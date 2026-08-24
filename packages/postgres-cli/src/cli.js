import { runSafely } from "cmd-ts";
import { CliError } from "./lib/errors.js";
import { pgcCli, normalizePgcArgv, unwrapCommandResult, createPgcCli } from "./lib/command-spec.js";
import { resolveFormat, writeOutput } from "./lib/output.js";

export async function main(argv, dependencies = {}) {
  const result = await run(argv, dependencies);
  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}

export async function run(argv, dependencies = {}) {
  const stdout = dependencies.stdout || process.stdout;
  const stderr = dependencies.stderr || process.stderr;
  const wantsJson = !argv.includes("--md") && !argv.includes("--csv");

  try {
    const outcome = await runSafely(createPgcCli(dependencies), normalizePgcArgv(argv));
    if (outcome._tag === "error") {
      return writeCommandError(outcome.error.config, { wantsJson, stdout, stderr });
    }

    const { result, outputOptions } = unwrapCommandResult(outcome.value);
    writeOutput(result, resolveFormat(outputOptions), {
      compact: outputOptions.compact,
      fields: outputOptions.fields,
      stdout
    });
    return { exitCode: 0, data: result };
  } catch (error) {
    const normalized = normalizeError(error);
    if (wantsJson) {
      writeError(stdout, normalized);
    } else {
      stderr.write(`${normalized.message}\n`);
    }

    return { exitCode: normalized.exitCode, error: normalized };
  }
}

function writeCommandError(error, { wantsJson, stdout, stderr }) {
  const exitCode = error.exitCode === 0 ? 0 : 2;
  if (exitCode === 0) {
    (error.into === "stderr" ? stderr : stdout).write(error.message.endsWith("\n") ? error.message : `${error.message}\n`);
    return { exitCode: 0 };
  }

  const normalized = { message: error.message, exitCode, code: "cli_error" };
  if (wantsJson) {
    writeError(stdout, normalized);
  } else {
    stderr.write(`${normalized.message}\n`);
  }

  return { exitCode, error: normalized };
}

function normalizeError(error) {
  if (error instanceof CliError) {
    return { message: error.message, exitCode: error.exitCode, code: error.code || "cli_error" };
  }

  return { message: error?.message || String(error), exitCode: error?.exitCode || 1, code: error?.code || "internal_error" };
}

function writeError(stdout, error) {
  stdout.write(`${JSON.stringify({
    ok: false,
    error: {
      code: error.code,
      message: error.message
    }
  }, null, 2)}\n`);
}

export { pgcCli };
