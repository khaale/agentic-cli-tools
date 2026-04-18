import { fail } from "../lib/errors.js";

export async function apiRequest(client, options) {
  const method = String(options.method || "GET").trim().toUpperCase();
  if (!["GET", "HEAD"].includes(method)) {
    fail("only GET and HEAD are supported", 2);
  }

  const query = parseQuery(options.query);
  const result = await client.request(options.path, {
    method,
    query,
    refresh: options.refresh,
    ttlMs: 0,
    scope: { resource: "api", path: options.path }
  });

  return {
    kind: typeof result.data === "string" ? "raw" : "get",
    data: result.data
  };
}

function parseQuery(value) {
  if (!value) {
    return {};
  }

  const params = new URLSearchParams(String(value));
  return Object.fromEntries(params.entries());
}
