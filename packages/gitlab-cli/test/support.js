import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function captureProcess(fn) {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const originalExitCode = process.exitCode;
  let stdout = "";
  let stderr = "";
  process.exitCode = 0;

  process.stdout.write = (chunk, encoding, callback) => {
    stdout += String(chunk);
    if (typeof encoding === "function") {
      encoding();
    } else if (typeof callback === "function") {
      callback();
    }
    return true;
  };

  process.stderr.write = (chunk, encoding, callback) => {
    stderr += String(chunk);
    if (typeof encoding === "function") {
      encoding();
    } else if (typeof callback === "function") {
      callback();
    }
    return true;
  };

  try {
    await fn();
    await new Promise((resolve) => setImmediate(resolve));
    return {
      stdout,
      stderr,
      exitCode: process.exitCode || 0
    };
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.exitCode = originalExitCode;
  }
}

export function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

export async function runCli(binPath, args, options = {}) {
  const resolvedBinPath = binPath instanceof URL ? fileURLToPath(binPath) : binPath;

  try {
    const result = await execFileAsync(process.execPath, [resolvedBinPath, ...args], {
      env: {
        ...process.env,
        ...options.env
      }
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: 0
    };
  } catch (error) {
    return {
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
      exitCode: Number.isInteger(error.code) ? error.code : 1
    };
  }
}
