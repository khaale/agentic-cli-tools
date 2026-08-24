import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function createConfigFile(value) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pgc-test-"));
  const configPath = path.join(directory, "config.json");
  await fs.writeFile(configPath, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  return { directory, configPath };
}

export function captureStream() {
  let value = "";
  return {
    write(chunk) {
      value += String(chunk);
      return true;
    },
    get value() {
      return value;
    }
  };
}

export function fakeClient({ rows = [{ id: 1 }], fields = [{ name: "id", dataTypeID: 23 }], errorOnQuery = null } = {}) {
  const calls = [];
  return {
    calls,
    factory: () => ({
      async connect() {
        calls.push(["connect"]);
      },
      async query(query) {
        calls.push(["query", query]);
        const text = typeof query === "string" ? query : query?.text;
        if (errorOnQuery && text?.includes(errorOnQuery)) {
          throw new Error(`password=secret ${errorOnQuery}`);
        }
        if (text?.includes("current_database")) {
          return { rows, fields };
        }
        if (typeof query === "object") {
          return { rows, fields };
        }
        return { rows: [], fields: [] };
      },
      async end() {
        calls.push(["end"]);
      }
    })
  };
}
