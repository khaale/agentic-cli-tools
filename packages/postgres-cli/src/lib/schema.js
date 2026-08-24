import { executeReadQuery } from "./postgres.js";

export async function schemaOverview(config, options = {}) {
  const session = config.getSession(options.session);
  const execute = options.execute || executeReadQuery;
  const limit = resolveCatalogLimit(options.limit, session.rowLimit);
  const result = await execute(session, OVERVIEW_SQL, [limit + 1], { ...options, rowLimit: limit });
  return { ok: true, session: session.name, kind: "schema-overview", ...withContinuation(result, "narrow by schema or increase --limit") };
}

export async function schemaSearch(config, options = {}) {
  if (!String(options.query || "").trim()) {
    throw new Error("schema search query is required");
  }

  const session = config.getSession(options.session);
  const execute = options.execute || executeReadQuery;
  const pattern = `%${String(options.query || "").trim()}%`;
  const limit = resolveCatalogLimit(options.limit, session.rowLimit);
  const result = await execute(session, SEARCH_SQL, [pattern, options.schema || null, options.type || null, limit + 1], { ...options, rowLimit: limit });
  return { ok: true, session: session.name, kind: "schema-search", ...withContinuation(result, "narrow by schema/type or increase --limit") };
}

export async function tableDetail(config, options = {}) {
  requireOption(options.schema, "schema");
  requireOption(options.table, "table");
  const session = config.getSession(options.session);
  const execute = options.execute || executeReadQuery;
  const queryOptions = { ...options, execute: undefined };
  const [tableMetadata, columns, indexes, constraints, relations] = await Promise.all([
    execute(session, TABLE_METADATA_SQL, [options.schema, options.table], queryOptions),
    execute(session, COLUMNS_SQL, [options.schema, options.table], queryOptions),
    execute(session, INDEXES_SQL, [options.schema, options.table], queryOptions),
    execute(session, CONSTRAINTS_SQL, [options.schema, options.table], queryOptions),
    relationships(config, { ...options, execute })
  ]);

  const metadata = tableMetadata.rows?.[0];
  const availability = !metadata
    ? "not_found"
    : metadata.can_select === true || metadata.can_select === "true"
      ? "available"
      : "inaccessible";

  return {
    ok: true,
    session: session.name,
    kind: "table-detail",
    table: { schema: options.schema, name: options.table, comment: metadata?.comment ?? null, availability },
    columns,
    indexes,
    constraints,
    relationships: relations
  };
}

export async function relationships(config, options = {}) {
  requireOption(options.schema, "schema");
  requireOption(options.table, "table");
  const session = config.getSession(options.session);
  const execute = options.execute || executeReadQuery;
  const direction = options.direction || "both";
  if (!["incoming", "outgoing", "both"].includes(direction)) {
    throw new Error(`unsupported relationship direction: ${direction}`);
  }
  const directions = direction === "both" ? ["incoming", "outgoing"] : [direction];
  const result = {};

  for (const item of directions) {
    const sql = item === "incoming" ? INCOMING_RELATIONS_SQL : OUTGOING_RELATIONS_SQL;
    result[item] = groupRelationships(await execute(session, sql, [options.schema, options.table], options));
  }

  return result;
}

export function groupRelationships(result) {
  const groups = new Map();
  for (const row of result.rows || []) {
    const key = [row.constraint_name, row.source_schema, row.source_table, row.target_schema, row.target_table].join("\u0000");
    const relationship = groups.get(key) || {
      constraintName: row.constraint_name,
      source: { schema: row.source_schema, table: row.source_table },
      target: { schema: row.target_schema, table: row.target_table },
      columns: []
    };
    relationship.columns.push({
      position: row.column_position,
      source: row.source_column,
      target: row.target_column
    });
    groups.set(key, relationship);
  }

  const rows = [...groups.values()].map((relationship) => ({
    ...relationship,
    columns: relationship.columns.sort((left, right) => left.position - right.position)
  }));
  return { ...result, rows, rowCount: rows.length };
}

const OVERVIEW_SQL = `
SELECT
  n.nspname AS schema_name,
  (SELECT count(*) FROM pg_catalog.pg_class r WHERE r.relnamespace = n.oid AND r.relkind IN ('r', 'p'))::int AS table_count,
  (SELECT count(*) FROM pg_catalog.pg_class v WHERE v.relnamespace = n.oid AND v.relkind IN ('v', 'm'))::int AS view_count,
  (SELECT count(*) FROM pg_catalog.pg_proc p WHERE p.pronamespace = n.oid)::int AS routine_count
FROM pg_catalog.pg_namespace n
WHERE n.nspname NOT LIKE 'pg_toast%'
ORDER BY n.nspname
LIMIT $1`;

const SEARCH_SQL = `
WITH objects AS (
  SELECT ns.nspname AS schema_name, rel.relname AS object_name, 'table' AS object_type, NULL::text AS parent_name,
    obj_description(rel.oid, 'pg_class') AS comment
  FROM pg_catalog.pg_class rel
  JOIN pg_catalog.pg_namespace ns ON ns.oid = rel.relnamespace
  WHERE rel.relkind IN ('r', 'p')
  UNION ALL
  SELECT ns.nspname, rel.relname, 'view', NULL::text,
    obj_description(rel.oid, 'pg_class')
  FROM pg_catalog.pg_class rel
  JOIN pg_catalog.pg_namespace ns ON ns.oid = rel.relnamespace
  WHERE rel.relkind IN ('v', 'm')
  UNION ALL
  SELECT ns.nspname, proc.proname, 'routine', NULL::text,
    obj_description(proc.oid, 'pg_proc')
  FROM pg_catalog.pg_proc proc
  JOIN pg_catalog.pg_namespace ns ON ns.oid = proc.pronamespace
  UNION ALL
  SELECT ns.nspname, att.attname, 'column', rel.relname,
    col_description(rel.oid, att.attnum)
  FROM pg_catalog.pg_attribute att
  JOIN pg_catalog.pg_class rel ON rel.oid = att.attrelid
  JOIN pg_catalog.pg_namespace ns ON ns.oid = rel.relnamespace
  WHERE rel.relkind IN ('r', 'p', 'v', 'm') AND att.attnum > 0 AND NOT att.attisdropped
)
SELECT schema_name, object_name, object_type, parent_name, comment
FROM objects
WHERE (object_name ILIKE $1 OR comment ILIKE $1)
  AND ($2::text IS NULL OR schema_name = $2)
  AND ($3::text IS NULL OR object_type = $3)
ORDER BY schema_name, object_type, object_name, parent_name NULLS FIRST
LIMIT $4`;

const TABLE_METADATA_SQL = `
SELECT obj_description(rel.oid, 'pg_class') AS comment,
  has_table_privilege(format('%I.%I', ns.nspname, rel.relname), 'SELECT') AS can_select
FROM pg_catalog.pg_class rel
JOIN pg_catalog.pg_namespace ns ON ns.oid = rel.relnamespace
WHERE ns.nspname = $1 AND rel.relname = $2`;

const COLUMNS_SQL = `
SELECT info.column_name, info.ordinal_position, info.data_type, info.udt_name, info.is_nullable, info.column_default,
  col_description(rel.oid, att.attnum) AS comment
FROM information_schema.columns info
JOIN pg_catalog.pg_class rel ON rel.relname = info.table_name
JOIN pg_catalog.pg_namespace ns ON ns.oid = rel.relnamespace AND ns.nspname = info.table_schema
JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attname = info.column_name
WHERE info.table_schema = $1 AND info.table_name = $2
ORDER BY info.ordinal_position`;

const INDEXES_SQL = `
SELECT indexname, indexdef
FROM pg_catalog.pg_indexes
WHERE schemaname = $1 AND tablename = $2
ORDER BY indexname`;

const CONSTRAINTS_SQL = `
SELECT con.conname AS constraint_name, con.contype AS constraint_type, pg_get_constraintdef(con.oid) AS definition
FROM pg_catalog.pg_constraint con
JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
JOIN pg_catalog.pg_namespace ns ON ns.oid = rel.relnamespace
WHERE ns.nspname = $1 AND rel.relname = $2
ORDER BY con.conname`;

const OUTGOING_RELATIONS_SQL = relationshipSql("source");
const INCOMING_RELATIONS_SQL = relationshipSql("target");

function relationshipSql(direction) {
  const filter = direction === "source"
    ? "src_ns.nspname = $1 AND src.relname = $2"
    : "dst_ns.nspname = $1 AND dst.relname = $2";

  return `
SELECT
  con.conname AS constraint_name,
  src_ns.nspname AS source_schema,
  src.relname AS source_table,
  dst_ns.nspname AS target_schema,
  dst.relname AS target_table,
  src_att.attname AS source_column,
  dst_att.attname AS target_column,
  src_key.ord AS column_position
FROM pg_catalog.pg_constraint con
JOIN pg_catalog.pg_class src ON src.oid = con.conrelid
JOIN pg_catalog.pg_namespace src_ns ON src_ns.oid = src.relnamespace
JOIN pg_catalog.pg_class dst ON dst.oid = con.confrelid
JOIN pg_catalog.pg_namespace dst_ns ON dst_ns.oid = dst.relnamespace
JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS src_key(attnum, ord) ON true
JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS dst_key(attnum, ord) ON dst_key.ord = src_key.ord
JOIN pg_catalog.pg_attribute src_att ON src_att.attrelid = src.oid AND src_att.attnum = src_key.attnum
JOIN pg_catalog.pg_attribute dst_att ON dst_att.attrelid = dst.oid AND dst_att.attnum = dst_key.attnum
WHERE con.contype = 'f' AND ${filter}
ORDER BY constraint_name, column_position`;
}

function requireOption(value, name) {
  if (!String(value || "").trim()) {
    throw new Error(`${name} is required`);
  }
}

function resolveCatalogLimit(value, fallback) {
  const limit = Number(value ?? fallback);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("schema result limit must be a positive integer");
  }

  return limit;
}

function withContinuation(result, hint) {
  return {
    ...result,
    continuation: result.truncated
      ? { required: true, reason: "result_limit", hint }
      : null
  };
}
