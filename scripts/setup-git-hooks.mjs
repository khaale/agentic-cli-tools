import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

if (!fs.existsSync(path.join(repoRoot, ".git"))) {
  process.exit(0);
}

execFileSync("git", ["-C", repoRoot, "config", "core.hooksPath", ".githooks"], {
  stdio: "inherit"
});

process.stdout.write("Configured Git hooks from .githooks\n");
