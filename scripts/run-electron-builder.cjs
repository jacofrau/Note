/* eslint-disable @typescript-eslint/no-require-imports */
const { spawnSync } = require("child_process");
const path = require("path");

const projectDir = path.join(__dirname, "..");
const builderCliPath = path.join(projectDir, "node_modules", "electron-builder", "cli.js");
const args = process.argv.slice(2);

const result = spawnSync(process.execPath, [builderCliPath, ...args], {
  cwd: projectDir,
  stdio: "inherit",
  env: {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: "false",
  },
});

if (result.error) {
  console.error(result.error instanceof Error ? result.error.message : String(result.error));
  process.exit(1);
}

process.exit(result.status ?? 0);
