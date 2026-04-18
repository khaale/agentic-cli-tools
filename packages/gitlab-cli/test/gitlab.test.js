import test from "node:test";
import assert from "node:assert/strict";
import { listGroups } from "../src/commands/groups.js";
import { buildMergeRequestListQuery, GitLabClient } from "../src/lib/gitlab.js";
import { captureProcess } from "./support.js";

test("GitLabClient requestAllPages follows x-next-page headers", async () => {
  const originalFetch = globalThis.fetch;
  const responses = [
    { data: [{ id: 1 }], nextPage: "2" },
    { data: [{ id: 2 }], nextPage: "" }
  ];
  const seenUrls = [];

  globalThis.fetch = async (input) => {
    const index = seenUrls.length;
    seenUrls.push(String(input));
    const payload = responses[index];
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => payload.data,
      text: async () => JSON.stringify(payload.data),
      headers: { get: (name) => (name.toLowerCase() === "x-next-page" ? payload.nextPage : null) }
    };
  };

  const client = new GitLabClient({
    host: "https://gitlab.example.com",
    token: "token",
    cache: { async get() { return null; }, async set() {} }
  });

  try {
    const data = await client.requestAllPages("/api/v4/groups", {
      query: { all_available: true },
      perPage: 100
    });

    assert.deepEqual(data, [{ id: 1 }, { id: 2 }]);
    assert.match(seenUrls[0], /page=1/);
    assert.match(seenUrls[1], /page=2/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitLabClient requestAllPages honors maxItems", async () => {
  const originalFetch = globalThis.fetch;
  const responses = [
    { data: [{ id: 1 }, { id: 2 }], nextPage: "2" },
    { data: [{ id: 3 }, { id: 4 }], nextPage: "" }
  ];
  let calls = 0;

  globalThis.fetch = async () => {
    const payload = responses[calls];
    calls += 1;
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => payload.data,
      text: async () => JSON.stringify(payload.data),
      headers: { get: (name) => (name.toLowerCase() === "x-next-page" ? payload.nextPage : null) }
    };
  };

  const client = new GitLabClient({
    host: "https://gitlab.example.com",
    token: "token",
    cache: { async get() { return null; }, async set() {} }
  });

  try {
    const data = await client.requestAllPages("/api/v4/groups", {
      maxItems: 3,
      perPage: 100
    });

    assert.deepEqual(data, [{ id: 1 }, { id: 2 }, { id: 3 }]);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitLabClient uses 10 minute TTL for pipelines and jobs", async () => {
  const originalFetch = globalThis.fetch;
  const savedEntries = [];

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => [],
    text: async () => "[]",
    headers: { get() { return null; } }
  });

  const client = new GitLabClient({
    host: "https://gitlab.example.com",
    token: "token",
    cache: {
      async get() { return null; },
      async set(_key, value) { savedEntries.push(value); }
    }
  });

  try {
    await client.requestJson("/api/v4/projects/1/pipelines");
    await client.requestJson("/api/v4/projects/1/jobs");
    await client.requestJson("/api/v4/projects/1/merge_requests");
    assert.equal(savedEntries.length, 3);
    for (const entry of savedEntries) {
      assert.equal(entry.expiresAt - entry.storedAt, 600_000);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("buildMergeRequestListQuery maps MR-specific filters", () => {
  assert.deepEqual(
    buildMergeRequestListQuery({
      state: "merged",
      author: "aleks",
      targetBranch: "main",
      sourceBranch: "feature/retries"
    }),
    {
      state: "merged",
      order_by: "updated_at",
      sort: "desc",
      author_username: "aleks",
      target_branch: "main",
      source_branch: "feature/retries",
      scope: "all"
    }
  );
});

test("GitLabClient retries transient fetch failures", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;

  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts === 1) {
      throw new TypeError("fetch failed");
    }

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => [{ id: 1 }],
      text: async () => '[{"id":1}]',
      headers: { get() { return null; } }
    };
  };

  const client = new GitLabClient({
    host: "https://gitlab.example.com",
    token: "token",
    cache: { async get() { return null; }, async set() {} }
  });

  try {
    const data = await client.requestJson("/api/v4/projects");
    assert.deepEqual(data, [{ id: 1 }]);
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitLabClient retries retryable HTTP responses", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;

  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts === 1) {
      return {
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => ({}),
        text: async () => "",
        headers: { get() { return null; } }
      };
    }

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => [{ id: 2 }],
      text: async () => '[{"id":2}]',
      headers: { get() { return null; } }
    };
  };

  const client = new GitLabClient({
    host: "https://gitlab.example.com",
    token: "token",
    cache: { async get() { return null; }, async set() {} }
  });

  try {
    const data = await client.requestJson("/api/v4/projects");
    assert.deepEqual(data, [{ id: 2 }]);
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitLabClient cache hits are silent unless verbose is enabled", async () => {
  const client = new GitLabClient({
    host: "https://gitlab.example.com",
    token: "token",
    cache: {
      async get() {
        return {
          data: [{ id: 1 }],
          storedAt: Date.now() - 5_000,
          expiresAt: Date.now() + 60_000,
          nextPage: null
        };
      },
      async set() {}
    }
  });

  const silent = await captureProcess(async () => {
    const data = await client.requestJson("/api/v4/projects", {});
    assert.deepEqual(data, [{ id: 1 }]);
  });
  assert.equal(silent.stderr, "");

  const verbose = await captureProcess(async () => {
    const data = await client.requestJson("/api/v4/projects", { verbose: true });
    assert.deepEqual(data, [{ id: 1 }]);
  });
  assert.match(verbose.stderr, /cache hit: \/api\/v4\/projects/);
});

test("groups list uses the flat all-available groups API by default", async () => {
  const calls = [];
  const client = {
    requestAllPages: async (apiPath, options) => {
      calls.push({ apiPath, options });
      return [
        { id: 1, path: "platform", full_path: "platform", web_url: "https://gitlab.example.com/platform" }
      ];
    },
    groupPath: (group) => `/api/v4/groups/${encodeURIComponent(group)}`
  };

  const result = await listGroups(client, {
    refresh: false
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].apiPath, "/api/v4/groups");
  assert.equal(calls[0].options.query.all_available, true);
  assert.deepEqual(result.data, [
    {
      id: 1,
      path: "platform",
      path_with_namespace: "platform",
      web_url: "https://gitlab.example.com/platform"
    }
  ]);
});
