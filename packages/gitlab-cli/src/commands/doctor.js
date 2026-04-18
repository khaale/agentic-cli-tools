import { buildDoctorReport, FileCache } from "@khaale/cli-core";
import packageJson from "../../package.json" with { type: "json" };
import { getEffectiveConfigSnapshot } from "../lib/config.js";
import { GitLabClient } from "../lib/gitlab.js";

export async function doctor(_options = {}) {
  const snapshot = await getEffectiveConfigSnapshot();
  const authSource = snapshot.sources.GITLAB_TOKEN;
  const hasHost = Boolean(snapshot.values.GITLAB_HOST);
  const hasToken = Boolean(snapshot.values.GITLAB_TOKEN);
  const missing = [];

  if (!hasHost) {
    missing.push("GITLAB_HOST");
  }

  if (!hasToken) {
    missing.push("GITLAB_TOKEN");
  }

  const checks = [];
  if (hasHost && hasToken) {
    const client = new GitLabClient({
      host: snapshot.values.GITLAB_HOST,
      token: snapshot.values.GITLAB_TOKEN,
      cache: new FileCache(snapshot.values.GITLAB_CACHE_DIR)
    });

    try {
      await client.requestJson("/api/v4/groups", {
        query: { all_available: "true", page: "1", per_page: "1" },
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
      tool: "glc",
      version: packageJson.version,
      configPath: snapshot.path,
      auth: {
        available: hasToken,
        source: authSource || "missing",
        token: snapshot.values.GITLAB_TOKEN
      },
      cacheDir: snapshot.values.GITLAB_CACHE_DIR,
      checks,
      missing
    })
  };
}
