import { runSafely } from "cmd-ts";
import { CliError } from "./lib/errors.js";
import { kaitenCli, normalizeKaitenArgv, unwrapCommandResult } from "./lib/command-spec.js";
import { pickFields, resolveOutputMode, writeOutput } from "./lib/output.js";

export async function main(argv) {
  try {
    const outcome = await runSafely(kaitenCli, normalizeKaitenArgv(argv));
    if (outcome._tag === "error") {
      const { message, exitCode, into } = outcome.error.config;
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

    writeOutput(data, mode, { compact: options.compact });
  } catch (error) {
    if (error instanceof CliError) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = error.exitCode;
      return;
    }

    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
