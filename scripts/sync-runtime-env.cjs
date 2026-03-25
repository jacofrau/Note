/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { getNamedAppDataDir } = require("../electron/paths.cjs");

const sourcePath = path.join(process.cwd(), ".env.local");
const outputDir = path.join(getNamedAppDataDir("Note"), "config");
const outputPath = path.join(outputDir, "runtime.env");
const allowedKeys = new Set([
  "FEEDBACK_EMAIL_TO",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "OPENAI_API_KEY",
  "OPENAI_FEEDBACK_MODERATION_MODEL",
]);

function readFilteredRuntimeEnv(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = [];

  for (const rawLine of content.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trim().startsWith("#")) continue;

    const separatorIndex = rawLine.indexOf("=");
    if (separatorIndex < 0) continue;

    const key = rawLine.slice(0, separatorIndex).trim();
    if (!allowedKeys.has(key)) continue;

    lines.push(rawLine);
  }

  return lines.join("\n");
}

if (!fs.existsSync(sourcePath)) {
  console.log("runtime env skipped: .env.local non trovato, config desktop non aggiornata");
  process.exit(0);
}

const filteredEnv = readFilteredRuntimeEnv(sourcePath);
if (!filteredEnv.trim()) {
  console.log("runtime env skipped: nessuna variabile desktop trovata in .env.local");
  process.exit(0);
}

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, `${filteredEnv}\n`, "utf8");
console.log(`runtime env scritto in ${outputPath}`);
