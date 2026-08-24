import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [, , packageDirArg, binNameArg] = process.argv;

if (!packageDirArg || !binNameArg) {
  console.error("usage: node scripts/test-self-contained-cli.mjs <package-dir> <bin-name>");
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const binPath = path.join(repoRoot, packageDirArg, "dist", "bin", `${binNameArg}.js`);

const result = await run(binPath, ["--help"]);
if (result.code !== 0 || !result.stdout.includes(binNameArg)) {
  console.error(`self-contained ${binNameArg} smoke test failed`);
  if (result.stdout) {
    console.error(`stdout:\n${result.stdout}`);
  }
  if (result.stderr) {
    console.error(`stderr:\n${result.stderr}`);
  }
  process.exit(1);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [command, ...args], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code: code ?? 1, signal, stdout, stderr }));
  });
}
