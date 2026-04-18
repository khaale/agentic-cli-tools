export function logDebug(enabled, message) {
  if (!enabled) {
    return;
  }

  process.stderr.write(`[ktc ${new Date().toISOString()}] ${message}\n`);
}
