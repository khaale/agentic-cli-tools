import { buildDoctorReport, FileCache } from "@khaale/cli-core";
import packageJson from "../../package.json" with { type: "json" };
import { getEffectiveConfigSnapshot, parseHostAndApiBaseForDoctor } from "../lib/config.js";
import { KaitenClient } from "../lib/kaiten.js";

export async function doctor(_options = {}) {
  const snapshot = await getEffectiveConfigSnapshot();
  const authSource = snapshot.sources.KAITEN_API_TOKEN;
  const hasUrl = Boolean(snapshot.values.KAITEN_URL);
  const hasToken = Boolean(snapshot.values.KAITEN_API_TOKEN);
  const missing = [];

  if (!hasUrl) {
    missing.push("KAITEN_URL");
  }

  if (!hasToken) {
    missing.push("KAITEN_API_TOKEN");
  }

  const checks = [];
  if (hasUrl && hasToken) {
    const parsed = parseHostAndApiBaseForDoctor(snapshot.values.KAITEN_URL, snapshot.values.KAITEN_API_BASE);
    const client = new KaitenClient({
      host: parsed.host,
      apiBase: parsed.apiBase,
      token: snapshot.values.KAITEN_API_TOKEN,
      cache: new FileCache(snapshot.values.KAITEN_CACHE_DIR),
      brokenApi: snapshot.values.KAITEN_BROKEN_API ?? false
    });

    try {
      await client.requestJson(client.spacesPath(), {
        refresh: true,
        ttlMs: 0,
        scope: { resource: "doctor", dataset: "reachability" }
      });
      checks.push({ name: "reachability", ok: true });
    } catch (error) {
      checks.push({ name: "reachability", ok: false, message: error.message });
    }
  }

  return {
    kind: "doctor",
    data: buildDoctorReport({
      tool: "ktc",
      version: packageJson.version,
      configPath: snapshot.path,
      auth: {
        available: hasToken,
        source: authSource || "missing",
        token: snapshot.values.KAITEN_API_TOKEN
      },
      cacheDir: snapshot.values.KAITEN_CACHE_DIR,
      checks,
      missing
    })
  };
}
