import { runSafely } from "cmd-ts";
import { hasJsonFlag, writeJsonError } from "@khaale/cli-core";
import { CliError } from "./lib/errors.js";
import { kaitenCli, normalizeKaitenArgv, unwrapCommandResult } from "./lib/command-spec.js";
import { pickFields, resolveOutputMode, writeOutput } from "./lib/output.js";

export async function main(argv) {
  const wantsJson = hasJsonFlag(argv);

  try {
    const outcome = await runSafely(kaitenCli, normalizeKaitenArgv(argv));
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
    if (options.fields) {
      data = pickFields(data, options.fields);
    }

    writeOutput(data, mode, {
      compact: options.compact,
      sanitize: result.kind !== "doctor"
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
