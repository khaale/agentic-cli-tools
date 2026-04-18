import { redactSecret } from "./config.js";

export function buildDoctorReport({
  tool,
  version = null,
  configPath,
  auth,
  cacheDir,
  checks = [],
  missing = []
}) {
  const normalizedChecks = checks.map((check) => ({
    name: check.name,
    ok: Boolean(check.ok),
    ...(check.message ? { message: check.message } : {})
  }));

  return {
    tool,
    version,
    ok: missing.length === 0 && normalizedChecks.every((check) => check.ok),
    config_path: configPath,
    auth: {
      available: Boolean(auth?.available),
      source: auth?.source || "missing",
      token: redactSecret(auth?.token || null)
    },
    cache: {
      dir: cacheDir || null
    },
    checks: normalizedChecks,
    missing
  };
}
