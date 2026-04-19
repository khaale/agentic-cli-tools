import { parseDateSpec } from "@khaale/cli-core";
import { fail } from "./errors.js";

const MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 250;

export class GitLabClient {
  constructor({ host, token, cache }) {
    this.host = host;
    this.token = token;
    this.cache = cache;
  }

  async requestJson(apiPath, options = {}) {
    const result = await this.request(apiPath, options);
    return result.data;
  }

  async request(apiPath, options = {}) {
    const { query = {}, refresh = false, ttlMs, scope = {}, raw = false, verbose = false, method = "GET" } = options;
    const url = buildUrl(this.host, apiPath, query);
    const key = `${url.pathname}?${url.searchParams.toString()}`;
    const canUseCache = method === "GET";
    const cacheEntry = canUseCache ? await this.cache.get(key, { refresh }) : null;

    if (cacheEntry) {
      if (verbose) {
        process.stderr.write(
          `cache hit: ${apiPath} age=${Math.floor((Date.now() - cacheEntry.storedAt) / 1000)}s ttl=${Math.floor((cacheEntry.expiresAt - cacheEntry.storedAt) / 1000)}s\n`
        );
      }
      return {
        data: cacheEntry.data,
        nextPage: cacheEntry.nextPage ?? null
      };
    }

    const response = await requestWithRetry(
      url,
      {
        method,
        headers: {
          "PRIVATE-TOKEN": this.token
        }
      },
      { verbose }
    );

    const data = await parseResponse(response, { method, raw });
    const nextPage = response.headers.get("x-next-page") || null;
    if (canUseCache) {
      await this.cache.set(key, {
        key,
        scope,
        storedAt: Date.now(),
        expiresAt: Date.now() + (ttlMs ?? inferTtlMs(apiPath)),
        data,
        nextPage,
        status: response.status
      });
    }
    return { data, nextPage, status: response.status };
  }

  async requestPage(apiPath, options = {}) {
    const result = await this.requestPageResult(apiPath, options);
    return result.data;
  }

  async requestPageResult(apiPath, options = {}) {
    const query = { ...options.query };
    if (!query.per_page) {
      query.per_page = String(options.perPage || 20);
    }

    if (options.page) {
      query.page = String(options.page);
    }

    return this.request(apiPath, { ...options, query });
  }

  async requestAllPages(apiPath, options = {}) {
    const maxItems = options.maxItems;
    const perPage = Math.min(options.perPage || 100, maxItems || Number.POSITIVE_INFINITY);
    let page = 1;
    const results = [];

    while (true) {
      const { data, nextPage } = await this.requestPageResult(apiPath, {
        ...options,
        page,
        perPage
      });

      if (!Array.isArray(data) || data.length === 0) {
        break;
      }

      results.push(...data);

      if (maxItems && results.length >= maxItems) {
        return results.slice(0, maxItems);
      }

      if (!nextPage) {
        break;
      }

      page = Number(nextPage);
      if (!Number.isFinite(page)) {
        break;
      }
    }

    return results;
  }

  projectPath(project) {
    return `/api/v4/projects/${encodeURIComponent(project)}`;
  }

  groupPath(group) {
    return `/api/v4/groups/${encodeURIComponent(group)}`;
  }
}

export function buildListQuery(options) {
  return buildScopedListQuery(options, { stateKey: "status", sortKey: "order_by" });
}

export function buildMergeRequestListQuery(options) {
  const query = buildScopedListQuery(options, { stateKey: "state", sortKey: "sort" });

  if (options.orderBy) {
    query.order_by = options.orderBy;
  } else {
    query.order_by = "updated_at";
  }

  if (!query.sort) {
    query.sort = "desc";
  }

  if (options.author) {
    query.author_username = options.author;
  }

  if (options.targetBranch) {
    query.target_branch = options.targetBranch;
  }

  if (options.sourceBranch) {
    query.source_branch = options.sourceBranch;
  }

  if (options.scope) {
    query.scope = options.scope;
  } else if (!options.project && !options.group) {
    query.scope = "all";
  }

  if (options.since) {
    const date = parseDateSpec(options.since);
    query.updated_after = date.toISOString();
  }

  if (options.till) {
    const date = parseDateSpec(options.till);
    query.updated_before = date.toISOString();
  }

  return query;
}

function buildScopedListQuery(options, { stateKey, sortKey }) {
  const query = {};

  if (options.search) {
    query.search = options.search;
  }

  if (options.state) {
    query[stateKey] = options.state;
  }

  if (options.sort) {
    query[sortKey] = options.sort;
  }

  return query;
}

function buildUrl(host, apiPath, query) {
  const url = new URL(apiPath, `${host}/`);

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url;
}

async function parseResponse(response, { method, raw }) {
  if (method === "HEAD") {
    return null;
  }

  if (raw) {
    return response.text();
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("json")) {
    return response.json();
  }

  const text = await response.text();
  if (looksLikeJson(text)) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  return text;
}

function looksLikeJson(value) {
  const text = String(value || "").trim();
  return text.startsWith("{") || text.startsWith("[");
}

async function handleHttpError(response) {
  if (response.status === 404) {
    fail("resource not found", 4);
  }

  if (response.status === 401 || response.status === 403) {
    fail(`gitlab auth failed: ${response.status}`, 3);
  }

  fail(`gitlab request failed: ${response.status} ${response.statusText}`, 5);
}

async function requestWithRetry(url, fetchOptions, { verbose = false } = {}) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, fetchOptions);

      if (!response.ok && isRetryableStatus(response.status) && attempt < MAX_RETRIES) {
        await wait(retryDelayMs(attempt, response));
        continue;
      }

      if (!response.ok) {
        await handleHttpError(response);
      }

      return response;
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error) || attempt >= MAX_RETRIES) {
        break;
      }

      if (verbose) {
        process.stderr.write(
          `retrying request after network failure: ${error.message} (attempt ${attempt + 2}/${MAX_RETRIES + 1})\n`
        );
      }

      await wait(retryDelayMs(attempt));
    }
  }

  if (lastError) {
    fail(`gitlab request failed: ${lastError.message}`, 5);
  }

  fail("gitlab request failed", 5);
}

function isRetryableError(error) {
  return error instanceof TypeError || error?.cause?.code === "UND_ERR_CONNECT_TIMEOUT";
}

function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 504);
}

function retryDelayMs(attempt, response) {
  const retryAfter = response?.headers?.get?.("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) {
      return seconds * 1000;
    }
  }

  return BASE_RETRY_DELAY_MS * 2 ** attempt;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function inferTtlMs(apiPath) {
  if (
    apiPath.includes("/pipelines") ||
    apiPath.includes("/jobs") ||
    apiPath.includes("/merge_requests")
  ) {
    return 600_000;
  }

  if (apiPath.includes("/repository")) {
    return 300_000;
  }

  return 300_000;
}
