// Shared hook runner: never blocks the session, never exits non-zero.
// A hook module calls runHook(name, handler); handler({input, root, config}) may return a string or object to print.
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../lib/config.mjs";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function logError(root, name, err) {
  if (!root) return;
  try {
    const dir = join(root, ".maestro", "runtime");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "hook-errors.log"), `${new Date().toISOString()} ${name}: ${err?.stack || err}\n`, "utf8");
  } catch {
    // Nothing more can be done.
  }
}

export async function runHook(name, handler) {
  let root = null;
  try {
    const raw = await readStdin();
    const input = raw.trim() ? JSON.parse(raw) : {};
    const loaded = loadConfig(input.cwd || process.cwd());
    root = loaded.root;
    if (!loaded.initialized) return;
    const out = await handler({ input, root, config: loaded.config });
    if (out) process.stdout.write(typeof out === "string" ? out : JSON.stringify(out));
  } catch (err) {
    logError(root, name, err);
  }
  process.exitCode = 0;
}

/** Output envelope that injects text into the model context. */
export const additionalContext = (hookEventName, text) => ({
  hookSpecificOutput: { hookEventName, additionalContext: text },
});
