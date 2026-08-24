import {
  configExists,
  normalizeStringValue,
  resolveRuntime,
  writeStoredConfig
} from "@khaale/cli-core";
import { fail } from "./errors.js";

export const TOOL_NAME = "pgc";
export const DEFAULT_LIMITS = Object.freeze({
  statementTimeoutMs: 30_000,
  rowLimit: 1_000,
  byteLimit: 1_048_576
});

export async function loadConfig(options = {}) {
  const env = options.env || process.env;
  const runtime = resolveRuntime(TOOL_NAME, {
    ...options,
    env,
    configPath: options.configPath || env.PGC_CONFIG_PATH
  });
  const raw = await readConfig(runtime);
  const defaults = normalizeLimits(raw.defaults || {}, "defaults");
  const sessions = {};

  for (const [name, value] of Object.entries(raw.sessions || {})) {
    sessions[name] = normalizeSession(name, value, runtime.env, defaults);
  }

  return {
    path: runtime.configPath,
    env: runtime.env,
    fsImpl: runtime.fsImpl,
    platform: runtime.platform,
    defaults,
    sessions,
    listSessions() {
      return Object.values(sessions).map(toSafeSession);
    },
    safeView() {
      return {
        path: runtime.configPath,
        sessions: Object.values(sessions).map(toSafeSession),
        defaults
      };
    },
    getSession(name) {
      const session = sessions[name];
      if (!session) {
        fail(`unknown PostgreSQL session: ${name}`, 3);
      }

      return resolveSessionSecret(session, runtime.env);
    },
    async init({ force = false } = {}) {
      if (!force && await configExists(runtime.fsImpl, runtime.configPath)) {
        fail(`config file already exists: ${runtime.configPath}`, 3);
      }

      const values = {
        sessions: {},
        defaults: DEFAULT_LIMITS
      };
      await writeStoredConfig(values, runtime);
      return { ok: true, path: runtime.configPath, configured: ["sessions", "defaults"] };
    }
  };
}

async function readConfig(runtime) {
  let text;
  try {
    text = await runtime.fsImpl.readFile(runtime.configPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { sessions: {}, defaults: {} };
    }

    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    fail(`invalid config JSON at ${runtime.configPath}: ${error.message}`, 3);
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    fail(`invalid config JSON at ${runtime.configPath}: expected an object`, 3);
  }

  if (parsed.sessions !== undefined && (!parsed.sessions || typeof parsed.sessions !== "object" || Array.isArray(parsed.sessions))) {
    fail("invalid config value for sessions: expected an object", 3);
  }

  return parsed;
}

function normalizeSession(name, value, env, defaults) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`invalid configuration for session ${name}: expected an object`, 3);
  }

  const host = requiredString(value.host, `${name}.host`);
  const database = requiredString(value.database, `${name}.database`);
  const user = requiredString(value.user, `${name}.user`);
  const port = positiveInteger(value.port ?? 5432, `${name}.port`);
  const password = value.password === undefined ? null : requiredString(value.password, `${name}.password`);
  const passwordEnv = value.passwordEnv === undefined ? null : requiredString(value.passwordEnv, `${name}.passwordEnv`);

  if (password && passwordEnv) {
    fail(`invalid configuration for session ${name}: set password or passwordEnv, not both`, 3);
  }

  const limits = normalizeLimits(value, `${name}.limits`, defaults);
  return {
    name,
    host,
    port,
    database,
    user,
    password,
    passwordEnv,
    ssl: normalizeSsl(value.ssl),
    ...limits
  };
}

function resolveSessionSecret(session, env) {
  if (!session.passwordEnv) {
    return { ...session };
  }

  const password = env[session.passwordEnv];
  if (!password) {
    fail(`missing secret for PostgreSQL session ${session.name}: ${session.passwordEnv}`, 3);
  }

  return { ...session, password };
}

function toSafeSession(session) {
  return {
    name: session.name,
    host: session.host,
    port: session.port,
    database: session.database,
    user: session.user,
    ssl: Boolean(session.ssl),
    readOnly: true,
    limits: {
      statementTimeoutMs: session.statementTimeoutMs,
      rowLimit: session.rowLimit,
      byteLimit: session.byteLimit
    },
    secret: session.password || session.passwordEnv ? "configured" : "not-configured"
  };
}

function normalizeLimits(value, prefix, fallback = DEFAULT_LIMITS) {
  return {
    statementTimeoutMs: positiveInteger(value.statementTimeoutMs ?? fallback.statementTimeoutMs, `${prefix}.statementTimeoutMs`),
    rowLimit: positiveInteger(value.rowLimit ?? fallback.rowLimit, `${prefix}.rowLimit`),
    byteLimit: positiveInteger(value.byteLimit ?? fallback.byteLimit, `${prefix}.byteLimit`)
  };
}

function normalizeSsl(value) {
  if (value === undefined || value === null || value === false) {
    return false;
  }

  if (value === true || typeof value === "object") {
    return value;
  }

  fail("invalid configuration value for ssl: expected boolean or object", 3);
}

function requiredString(value, key) {
  const normalized = normalizeStringValue(value, key, { exitCode: 3 });
  if (!normalized) {
    fail(`missing required configuration value: ${key}`, 3);
  }

  return normalized;
}

function positiveInteger(value, key) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    fail(`invalid configuration value for ${key}: expected a positive integer`, 3);
  }

  return number;
}
