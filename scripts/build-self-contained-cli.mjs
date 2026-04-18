import fs from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const [, , packageDirArg, binNameArg] = process.argv;

if (!packageDirArg || !binNameArg) {
  console.error("usage: node scripts/build-self-contained-cli.mjs <package-dir> <bin-name>");
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const packageDir = path.resolve(repoRoot, packageDirArg);
const distDir = path.join(packageDir, "dist");
const cliEntry = path.join(packageDir, "src", "cli.js");
const cliOutfile = path.join(distDir, "cli.js");
const binDir = path.join(distDir, "bin");
const binPath = path.join(binDir, `${binNameArg}.js`);

await fs.rm(distDir, { recursive: true, force: true });
await fs.mkdir(binDir, { recursive: true });

await build({
  entryPoints: [cliEntry],
  outfile: cliOutfile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  packages: "bundle",
  logLevel: "silent"
});

await fs.writeFile(
  binPath,
  [
    "#!/usr/bin/env node",
    'import { main } from "../cli.js";',
    "",
    "main(process.argv.slice(2));",
    ""
  ].join("\n"),
  "utf8"
);

const stat = await fs.stat(binPath);
await fs.chmod(binPath, stat.mode | 0o755);
