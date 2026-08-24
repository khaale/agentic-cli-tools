import { Client } from "pg";
import { fail, sanitizeDatabaseError } from "./errors.js";
import { assertParameters, assertReadOnlySql, boundedQueryText, normalizeQueryResult } from "./query.js";

export async function executeReadQuery(session, sql, parameters = [], options = {}) {
  assertReadOnlySql(sql);
  const values = assertParameters(parameters);
  const limits = {
    rowLimit: options.rowLimit ?? session.rowLimit,
    byteLimit: options.byteLimit ?? session.byteLimit,
    statementTimeoutMs: options.statementTimeoutMs ?? session.statementTimeoutMs
  };
  const client = await connectSession(session, options.clientFactory);
  let result;

  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION READ ONLY");
    await client.query(`SET LOCAL statement_timeout TO ${limits.statementTimeoutMs}`);
    result = await client.query({
      text: boundedQueryText(sql, limits.rowLimit),
      values
    });
    return normalizeQueryResult(result, limits);
  } catch (error) {
    throw databaseFailure(error, session);
  } finally {
    await rollbackQuietly(client);
    await endQuietly(client);
  }
}

export async function diagnoseSession(session, options = {}) {
  const client = await connectSession(session, options.clientFactory);
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION READ ONLY");
    const result = await client.query("SELECT current_database() AS database, current_user AS user, version() AS version");
    return {
      reachable: true,
      readOnly: true,
      database: result.rows?.[0]?.database || null,
      user: result.rows?.[0]?.user || null,
      version: result.rows?.[0]?.version || null
    };
  } catch (error) {
    throw databaseFailure(error, session);
  } finally {
    await rollbackQuietly(client);
    await endQuietly(client);
  }
}

async function connectSession(session, clientFactory = defaultClientFactory) {
  const client = clientFactory({
    host: session.host,
    port: session.port,
    database: session.database,
    user: session.user,
    password: session.password || undefined,
    ssl: session.ssl || undefined
  });

  try {
    await client.connect();
    return client;
  } catch (error) {
    await endQuietly(client);
    throw databaseFailure(error, session);
  }
}

function defaultClientFactory(config) {
  return new Client(config);
}

function databaseFailure(error, session) {
  const failure = new Error(sanitizeDatabaseError(error, session));
  failure.code = error?.code || "database_error";
  failure.exitCode = 4;
  return failure;
}

async function rollbackQuietly(client) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the operation error; cleanup is best effort.
  }
}

async function endQuietly(client) {
  try {
    await client.end();
  } catch {
    // Preserve the operation error; cleanup is best effort.
  }
}
