import { fail } from "./errors.js";
import { logDebug } from "./debug.js";

const MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 250;

export class KaitenClient {
  constructor({ host, apiBase, token, cache, brokenApi = false }) {
    this.host = host;
    this.apiBase = apiBase;
    this.token = token;
    this.cache = cache;
    this.brokenApi = brokenApi;
  }

  async requestJson(apiPath, options = {}) {
    const result = await this.request(apiPath, options);
    return result.data;
  }

  async requestOptionalJson(apiPath, options = {}) {
    const result = await this.request(apiPath, { ...options, allow404: true });
    return result.data;
  }

  async request(apiPath, options = {}) {
    const {
      query = {},
      refresh = false,
      ttlMs,
      scope = {},
      raw = false,
      verbose = false,
      allow404 = false,
      method = "GET"
    } = options;
    const url = buildUrl(this.host, apiPath, withDefaultQuery(query, this.brokenApi));
    const key = `${url.pathname}?${url.searchParams.toString()}`;
    const canUseCache = method === "GET";
    const cacheEntry = canUseCache ? await this.cache.get(key, { refresh }) : null;

    if (cacheEntry) {
      logDebug(
        verbose,
        `cache hit path=${apiPath} age=${Math.floor((Date.now() - cacheEntry.storedAt) / 1000)}s ttl=${Math.floor((cacheEntry.expiresAt - cacheEntry.storedAt) / 1000)}s`
      );
      return {
        data: cacheEntry.data,
        status: cacheEntry.status || 200
      };
    }

    const startedAt = Date.now();
    logDebug(verbose, `request start path=${apiPath} query=${url.searchParams.toString() || "-"}`);

    const response = await requestWithRetry(
      url,
      {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: raw ? "*/*" : "application/json"
        }
      },
      { verbose, allow404 }
    );

    if (allow404 && response.status === 404) {
      logDebug(verbose, `request done path=${apiPath} status=404 ms=${Date.now() - startedAt}`);
      return { data: null, status: 404 };
    }

    const data = await parseResponse(response, { method, raw });
    logDebug(
      verbose,
      `request done path=${apiPath} status=${response.status} ms=${Date.now() - startedAt} shape=${describePayload(data)}`
    );
    if (canUseCache) {
      await this.cache.set(key, {
        key,
        scope,
        storedAt: Date.now(),
        expiresAt: Date.now() + (ttlMs ?? inferTtlMs(apiPath)),
        status: response.status,
        data
      });
    }
    return {
      data,
      status: response.status
    };
  }

  spacesPath() {
    return `${this.apiBase}/spaces`;
  }

  spaceBoardsPath(spaceId) {
    return `${this.apiBase}/spaces/${encodeURIComponent(spaceId)}/boards`;
  }

  spaceBoardPath(spaceId, boardId) {
    return `${this.apiBase}/spaces/${encodeURIComponent(spaceId)}/boards/${encodeURIComponent(boardId)}`;
  }

  cardsPath() {
    return `${this.apiBase}/cards`;
  }

  cardPath(cardId) {
    return `${this.apiBase}/cards/${encodeURIComponent(cardId)}`;
  }

  cardCommentsPath(cardId) {
    return `${this.apiBase}/cards/${encodeURIComponent(cardId)}/comments`;
  }

  cardCandidatePaths(cardId) {
    const candidates = [this.cardPath(cardId)];

    if (this.apiBase !== "/api/latest") {
      candidates.push(`/api/latest/cards/${encodeURIComponent(cardId)}`);
    }

    if (this.apiBase !== "/api/v1") {
      candidates.push(`/api/v1/cards/${encodeURIComponent(cardId)}`);
    }

    return [...new Set(candidates)];
  }

  currentUserCandidatePaths() {
    return [`${this.apiBase}/users/current`];
  }
}

function withDefaultQuery(query, brokenApi) {
  return {
    broken_api: brokenApi ? "true" : "false",
    ...query
  };
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

async function handleHttpError(response, { allow404 = false } = {}) {
  if (allow404 && response.status === 404) {
    return;
  }

  if (response.status === 404) {
    fail("resource not found", 4);
  }

  if (response.status === 401 || response.status === 403) {
    fail(`kaiten auth failed: ${response.status}`, 3);
  }

  fail(`kaiten request failed: ${response.status} ${response.statusText}`, 5);
}

async function requestWithRetry(url, fetchOptions, { verbose = false, allow404 = false } = {}) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, fetchOptions);

      if (!response.ok && isRetryableStatus(response.status) && attempt < MAX_RETRIES) {
        await wait(retryDelayMs(attempt, response));
        continue;
      }

      if (!response.ok) {
        await handleHttpError(response, { allow404 });
      }

      return response;
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error) || attempt >= MAX_RETRIES) {
        break;
      }

      logDebug(
        verbose,
        `retrying request after network failure: ${error.message} (attempt ${attempt + 2}/${MAX_RETRIES + 1})`
      );

      await wait(retryDelayMs(attempt));
    }
  }

  if (lastError) {
    fail(`kaiten request failed: ${lastError.message}`, 5);
  }

  fail("kaiten request failed", 5);
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
  if (apiPath.includes("/boards/")) {
    return 120_000;
  }

  if (apiPath.includes("/boards") || apiPath.includes("/spaces")) {
    return 300_000;
  }

  return 120_000;
}

function describePayload(data) {
  if (Array.isArray(data)) {
    return `array(${data.length})`;
  }

  if (data && typeof data === "object") {
    const cards = Array.isArray(data.cards) ? data.cards.length : null;
    const columns = Array.isArray(data.columns) ? data.columns.length : null;
    const parts = [`object(keys=${Object.keys(data).length})`];

    if (cards !== null) {
      parts.push(`cards=${cards}`);
    }

    if (columns !== null) {
      parts.push(`columns=${columns}`);
    }

    return parts.join(" ");
  }

  return typeof data;
}
