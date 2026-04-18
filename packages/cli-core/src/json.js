export function hasJsonFlag(argv) {
  return argv.includes("--json");
}

export function writeJsonValue(value, { pretty = true } = {}) {
  process.stdout.write(`${JSON.stringify(value, null, pretty ? 2 : 0)}\n`);
}

export function writeJsonError(error, { exitCode = 1, code = "cli_error", details = null } = {}) {
  const payload = {
    ok: false,
    error: {
      code,
      message: String(error?.message || error || "unknown error"),
      ...(details ? { details } : {})
    }
  };

  writeJsonValue(payload);
  process.exitCode = exitCode;
}
