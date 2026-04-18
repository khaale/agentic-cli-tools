import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export class FileCache {
  constructor(rootDir) {
    this.rootDir = rootDir;
  }

  async get(key, { refresh = false } = {}) {
    if (refresh) {
      return null;
    }

    const filePath = this.#filePath(key);
    try {
      const text = await fs.readFile(filePath, "utf8");
      const entry = JSON.parse(text);
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        return null;
      }
      return entry;
    } catch (error) {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async set(key, value) {
    const filePath = this.#filePath(key);
    await fs.mkdir(this.rootDir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
  }

  async list() {
    try {
      const files = await fs.readdir(this.rootDir);
      const entries = [];
      for (const file of files) {
        if (!file.endsWith(".json")) {
          continue;
        }

        try {
          const filePath = path.join(this.rootDir, file);
          const stat = await fs.stat(filePath);
          const text = await fs.readFile(filePath, "utf8");
          const entry = JSON.parse(text);
          entries.push({
            key: entry.key,
            scope: entry.scope || {},
            storedAt: entry.storedAt,
            expiresAt: entry.expiresAt,
            size: stat.size
          });
        } catch {
          // Ignore malformed cache entries.
        }
      }
      return entries.sort((left, right) => (right.storedAt || 0) - (left.storedAt || 0));
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async clear(filters = {}) {
    const entries = await this.list();
    const removed = [];

    await fs.mkdir(this.rootDir, { recursive: true });

    for (const entry of entries) {
      if (!matchesScope(entry.scope, filters)) {
        continue;
      }

      const filePath = this.#filePath(entry.key);
      try {
        await fs.unlink(filePath);
        removed.push(entry);
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }
      }
    }

    return removed;
  }

  #filePath(key) {
    const digest = crypto.createHash("sha256").update(key).digest("hex");
    return path.join(this.rootDir, `${digest}.json`);
  }
}

function matchesScope(scope, filters) {
  for (const [key, value] of Object.entries(filters)) {
    if (!value) {
      continue;
    }

    if (scope[key] !== value) {
      return false;
    }
  }

  return true;
}
