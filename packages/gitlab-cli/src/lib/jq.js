import { spawn } from "node:child_process";
import { CliError } from "./errors.js";

export async function applyJq(data, query) {
  if (!query) {
    return data;
  }

  const values = Array.isArray(data) ? data : [data];
  const outputs = [];

  for (const value of values) {
    const result = await runJq(value, query);
    outputs.push(...result);
  }

  return Array.isArray(data) ? outputs : outputs[0];
}

function runJq(value, query) {
  return new Promise((resolve, reject) => {
    const child = spawn("jq", ["-c", query], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      if (error.code === "ENOENT") {
        reject(new Error("jq executable not found in PATH"));
        return;
      }

      reject(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new CliError(`jq query error: ${stderr.trim() || `exit code ${code}`}`, 2));
        return;
      }

      const lines = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return line;
          }
        });

      resolve(lines);
    });

    child.stdin.end(`${JSON.stringify(value)}\n`);
  });
}
