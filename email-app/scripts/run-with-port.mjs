/**
 * Lance Next avec un port configurable.
 * Priorité : variable d'environnement PORT → .env.local → .env → défaut 3001.
 */
import { spawn } from "child_process";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadPortFromFiles() {
  for (const name of [".env.local", ".env"]) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
    const text = readFileSync(p, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const m = t.match(/^PORT\s*=\s*"?(\d+)"?\s*$/);
      if (m) return m[1];
    }
  }
  return null;
}

const mode = process.argv[2];
if (mode !== "dev" && mode !== "start") {
  console.error("Usage: node scripts/run-with-port.mjs dev|start");
  process.exit(1);
}

const port = process.env.PORT || loadPortFromFiles() || "3001";
const nextCmd = mode === "dev" ? "dev" : "start";

if (mode === "dev") {
  console.info(`Email Control → http://localhost:${port} (PORT=${port})\n`);
}

const child = spawn("npx", ["next", nextCmd, "-p", port], {
  stdio: "inherit",
  shell: true,
  cwd: root,
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 0));
