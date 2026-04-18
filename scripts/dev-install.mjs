import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const binDir = path.join(os.homedir(), ".local", "bin");

const commands = [
  {
    name: "glc",
    target: path.join(repoRoot, "packages", "gitlab-cli", "bin", "glc.js")
  },
  {
    name: "ktc",
    target: path.join(repoRoot, "packages", "kaiten-cli", "bin", "ktc.js")
  }
];

await fs.mkdir(binDir, { recursive: true });

for (const command of commands) {
  const wrapperPath = path.join(binDir, command.name);
  const wrapper = `#!/bin/sh
exec node "${command.target}" "$@"
`;

  await fs.writeFile(wrapperPath, wrapper, { mode: 0o755 });
  await fs.chmod(wrapperPath, 0o755);
  process.stdout.write(`installed ${command.name} -> ${wrapperPath}\n`);
}

process.stdout.write(`\nAdd to PATH for this shell:\nexport PATH="${binDir}:$PATH"\n`);
