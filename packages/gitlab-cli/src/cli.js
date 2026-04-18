import { runSafely } from "cmd-ts";
import { hasJsonFlag, writeJsonError } from "@khaale/cli-core";
import { CliError } from "./lib/errors.js";
import { applyJq } from "./lib/jq.js";
import { pickFields, resolveOutputMode, writeOutput } from "./lib/output.js";
import { gitLabCli, normalizeGitLabArgv, unwrapCommandResult } from "./lib/command-spec.js";

export async function main(argv) {
  const wantsJson = hasJsonFlag(argv);

  try {
    const outcome = await runSafely(gitLabCli, normalizeGitLabArgv(argv));
    if (outcome._tag === "error") {
      const { message, exitCode, into } = outcome.error.config;
      if (wantsJson) {
        writeJsonError(message, { exitCode });
        return;
      }

      process[into].write(message.endsWith("\n") ? message : `${message}\n`);
      process.exitCode = exitCode;
      return;
    }

    const { result, outputOptions: options } = unwrapCommandResult(outcome.value);
    const mode = resolveOutputMode(result.kind, options);

    let data = result.data;
    if (!options.full && options.fields) {
      data = pickFields(data, options.fields);
    }

    if (options.jq) {
      data = await applyJq(data, options.jq);
    }

    writeOutput(data, options.jq ? resolveJqMode(data, options) : mode, {
      compact: options.compact
    });
  } catch (error) {
    if (error instanceof CliError) {
      if (wantsJson) {
        writeJsonError(error, { exitCode: error.exitCode });
        return;
      }

      process.stderr.write(`${error.message}\n`);
      process.exitCode = error.exitCode;
      return;
    }

    if (wantsJson) {
      writeJsonError(error, { exitCode: 1, code: "internal_error" });
      return;
    }

    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

function resolveJqMode(data, options) {
  if (options.raw) {
    return Array.isArray(data) ? "lines" : "raw";
  }

  if (Array.isArray(data)) {
    return "jsonl";
  }

  if (typeof data === "string") {
    return "raw";
  }

  return "json";
}
