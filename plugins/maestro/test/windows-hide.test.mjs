import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const scripts = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts");

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".mjs") ? [p] : [];
  });
}

// Hooks run on every prompt and tool call. On Windows a child process started without
// windowsHide opens a console window for an instant, so every call must set it.
test("every_subprocess_sets_windows_hide", () => {
  const missing = [];
  for (const file of files(scripts)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/(?<![.\w])(execFileSync|execSync|spawnSync|spawn|execFile|exec)\(/g)) {
      const before = src.slice(Math.max(0, m.index - 40), m.index);
      if (/import\s*\{[^}]*$/.test(before) || /function\s+$/.test(before)) continue;
      // The options object follows within the call; look up to the closing ");". A shared `opts` object
      // (lib/backlog.mjs) is defined with windowsHide.
      const call = src.slice(m.index, src.indexOf(");", m.index) + 2);
      if (!/windowsHide|\bopts\b/.test(call)) missing.push(`${relative(scripts, file)}: ${call.split("\n")[0].slice(0, 80)}`);
    }
  }
  assert.deepEqual(missing, []);
});
