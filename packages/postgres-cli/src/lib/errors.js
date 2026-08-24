export { CliError, fail } from "@khaale/cli-core";

export function sanitizeDatabaseError(error, session) {
  let message = String(error?.message || error || "database request failed");
  const secrets = [session?.password].filter(Boolean);

  for (const secret of secrets) {
    message = message.replaceAll(secret, "<redacted>");
  }

  message = message.replace(/(postgres(?:ql)?:\/\/)([^/@\s]+):([^/@\s]+)@/giu, "$1<redacted>@");
  message = message.replace(/password\s*=\s*[^\s,;]+/giu, "password=<redacted>");
  return message;
}
