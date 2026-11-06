// Adoption of an existing repository (used by init.mjs). Read-only: it detects the project's checks and
// lists rules that may conflict with Maestro. It never edits anything; the PM changes files on the
// `maestro-setup` branch only after the owner agrees (see skills/init/SKILL.md).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const MARKER_START = "<!-- MAESTRO START -->";
export const MARKER_END = "<!-- MAESTRO END -->";

const readText = (path) => (existsSync(path) ? readFileSync(path, "utf8") : null);
const linesOf = (text) => text.split(/\r?\n/);

// ---------------------------------------------------------------- checks

const INSTALL = /^(npm\s+(ci|install|i)\b|pnpm\s+(install|i)\b|yarn(\s+install)?$|bun\s+install\b|pip3?\s+install\b|python3?\s+-m\s+pip\s+install\b|uv\s+sync\b|poetry\s+install\b)/;
const SCRIPT_PRIORITY = ["test", "lint", "typecheck", "type-check", "check", "build"];
const SCRIPT_EXTRA = /^(test:(?!watch)[\w:-]+|lint:[\w:-]+|check:[\w:-]+|typecheck:[\w:-]+|format:check|verify|e2e)$/;

/** Package runner from the lockfile: "npm" | "pnpm" | "yarn" | "bun" (npm when only package.json exists). */
export function detectRunner(root) {
  const has = (f) => existsSync(join(root, f));
  if (has("pnpm-lock.yaml")) return "pnpm";
  if (has("yarn.lock")) return "yarn";
  if (has("bun.lock") || has("bun.lockb")) return "bun";
  if (has("package-lock.json") || has("npm-shrinkwrap.json")) return "npm";
  return has("package.json") ? "npm" : null;
}

const NODE_LOCKFILES = ["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"];

/** True when the project keeps Node packages in node_modules (the folder exists, or a Node lockfile does). */
export function usesNodeModules(root) {
  return existsSync(join(root, "node_modules")) || NODE_LOCKFILES.some((f) => existsSync(join(root, f)));
}

function scriptCommand(runner, name) {
  if (runner === "yarn") return `yarn ${name}`;
  if (name === "test" && runner !== "bun") return `${runner} test`;
  return `${runner} run ${name}`;
}

function packageChecks(root) {
  const text = readText(join(root, "package.json"));
  if (text === null) return [];
  let scripts;
  try {
    scripts = JSON.parse(text).scripts;
  } catch {
    return [];
  }
  if (!scripts || typeof scripts !== "object") return [];
  const runner = detectRunner(root) ?? "npm";
  const names = Object.keys(scripts);
  const picked = [...SCRIPT_PRIORITY.filter((n) => names.includes(n)), ...names.filter((n) => SCRIPT_EXTRA.test(n))];
  return picked.map((name) => ({ command: scriptCommand(runner, name), source: `package.json script "${name}"` }));
}

function cleanCommand(raw) {
  const c = raw.replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "");
  return c && !INSTALL.test(c) ? c : null;
}

/** `run:` commands of a GitHub Actions workflow, line based (inline and block scalars). */
export function githubRunCommands(text) {
  const out = [];
  const lines = linesOf(text);
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const value = m[2].trim();
    if (/^[|>][+-]?$/.test(value)) {
      const baseIndent = m[1].length;
      for (let j = i + 1; j < lines.length; j++) {
        if (!lines[j].trim()) continue;
        if (lines[j].match(/^\s*/)[0].length <= baseIndent) break;
        const c = cleanCommand(lines[j]);
        if (c) out.push(c);
        i = j;
      }
    } else {
      const c = cleanCommand(value);
      if (c) out.push(c);
    }
  }
  return out;
}

/** Commands under `script:` / `before_script:` lists of a .gitlab-ci.yml, line based. */
export function gitlabScriptCommands(text) {
  const out = [];
  const lines = linesOf(text);
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(?:before_|after_)?script:\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    if (m[2].trim()) {
      const c = cleanCommand(m[2]);
      if (c) out.push(c);
      continue;
    }
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j].trim()) continue;
      const item = /^(\s*)-\s+(.*)$/.exec(lines[j]);
      if (!item || item[1].length < m[1].length) break;
      const c = cleanCommand(item[2]);
      if (c) out.push(c);
      i = j;
    }
  }
  return out;
}

function ciChecks(root) {
  const found = [];
  const dir = join(root, ".github", "workflows");
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((n) => /\.ya?ml$/.test(n)).sort()) {
      for (const command of githubRunCommands(readText(join(dir, f)) ?? "")) found.push({ command, source: `.github/workflows/${f}` });
    }
  }
  const gl = readText(join(root, ".gitlab-ci.yml"));
  if (gl !== null) for (const command of gitlabScriptCommands(gl)) found.push({ command, source: ".gitlab-ci.yml" });
  return found;
}

function otherChecks(root) {
  const out = [];
  const py = readText(join(root, "pyproject.toml"));
  if (py !== null) {
    if (/pytest/.test(py)) out.push({ command: "pytest", source: "pyproject.toml" });
    if (/\[tool\.ruff/.test(py)) out.push({ command: "ruff check .", source: "pyproject.toml" });
    if (/\[tool\.mypy/.test(py)) out.push({ command: "mypy .", source: "pyproject.toml" });
  }
  const mk = readText(join(root, "Makefile"));
  if (mk !== null) {
    for (const target of ["test", "lint", "check", "typecheck", "build"]) {
      if (new RegExp(`^${target}\\s*:`, "m").test(mk)) out.push({ command: `make ${target}`, source: "Makefile" });
    }
  }
  return out;
}

/**
 * Checks found in the project: `{ runner, checks: [{command, source}] }`, deduplicated by command
 * (project scripts first, then Makefile/pyproject, then CI commands). Best effort, no YAML library.
 */
export function detectChecks(root) {
  const seen = new Set();
  const checks = [];
  for (const c of [...packageChecks(root), ...otherChecks(root), ...ciChecks(root)]) {
    if (seen.has(c.command)) continue;
    seen.add(c.command);
    checks.push(c);
  }
  return { runner: detectRunner(root), checks: checks.slice(0, 20) };
}

/** Markdown for the `## Checks` section body, marked for the owner to confirm. */
export function renderChecks({ checks }) {
  const lines = [
    "Standard checks every task runs before review and the architect runs after integration.",
    "Pre-filled by `maestro init` from package.json, CI files and lockfiles: **owner to confirm** (remove what is not a gate, add what is missing).",
    "",
    ...checks.map((c) => `- \`${c.command}\` (from ${c.source})`),
    "- TODO: how to start the app for QA snapshots",
  ];
  return lines.join("\n");
}

const TEMPLATE_CHECKS = ["- TODO: test command", "- TODO: lint or type check", "- TODO: build or start command (also used for QA snapshots)"];

/**
 * Replace the `## Checks` section of `text` with the detected checks, only while it still holds the three
 * template TODO lines. Returns `{ text, changed }`.
 */
export function prefillChecks(text, detected) {
  if (!detected.checks.length) return { text, changed: false };
  const lines = linesOf(text);
  const head = lines.findIndex((l) => /^##\s+Checks\s*$/.test(l));
  if (head === -1) return { text, changed: false };
  let end = lines.findIndex((l, i) => i > head && /^#{1,2}\s/.test(l));
  if (end === -1) end = lines.length;
  const body = lines.slice(head + 1, end).map((l) => l.trim());
  if (!TEMPLATE_CHECKS.every((t) => body.includes(t))) return { text, changed: false };
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const tail = lines.slice(end);
  const replacement = ["## Checks", "", ...renderChecks(detected).split("\n"), ...(tail.length ? [""] : [])];
  return { text: [...lines.slice(0, head), ...replacement, ...tail].join(eol), changed: true };
}

// ---------------------------------------------------------------- conflicts

const MULTI_AGENT = /sub-?agents?|multi-?agents?|\bdelegat\w*|\bdelega\w*|orchestrat\w*/i;
const QA_RULE = /\b(QA|quality assurance)\b|test\w*\s+(la\s+|the\s+)?(feature|funzionalit)|testare/i;
const EVERY = /\b(after every|after each|after any|for every|for each|always|mandatory|must|dopo ogni|per ogni|sempre|obbligator\w*|incaricare)\b/i;
const PLAN_COMMIT = /PLAN\.md/;
const PLAN_VERB = /(same commit|every commit|each commit|stesso commit|ogni commit|keep\b.*updated|update[sd]?\b|aggiorn\w*|tener\w*\s+aggiornato|mantener\w*)/i;
const HIDING_CLAUDE = new Set([".claude", ".claude/", "/.claude", "/.claude/", ".claude/*", "/.claude/*", ".claude/**", "/.claude/**"]);

/** Zero-based line indexes that are inside the Maestro block (markers included). */
function maestroLines(lines) {
  const inside = new Set();
  let open = false;
  lines.forEach((l, i) => {
    if (l.includes(MARKER_START)) open = true;
    if (open) inside.add(i);
    if (l.includes(MARKER_END)) open = false;
  });
  return inside;
}

function excerpt(line) {
  const t = line.trim().replace(/\s+/g, " ");
  return t.length > 110 ? `${t.slice(0, 107)}...` : t;
}

function ruleFlags(file, text) {
  const lines = linesOf(text);
  const skip = maestroLines(lines);
  const flags = [];
  let flaggedHeading = false;
  lines.forEach((line, i) => {
    if (skip.has(i) || !line.trim()) return;
    const isHeading = /^#{1,6}\s/.test(line);
    if (isHeading) flaggedHeading = false;
    const add = (reason) => flags.push({ file, line: i + 1, reason, text: excerpt(line) });
    if (PLAN_COMMIT.test(line) && PLAN_VERB.test(line) && /commit/i.test(line)) return add("rule makes commits update PLAN.md; with Maestro the tracker holds the state and PLAN.md stays short");
    if (QA_RULE.test(line) && EVERY.test(line) && !isHeading) return add("mandatory QA per feature; with Maestro QA is a black-box mission on a tagged snapshot run on the PM's call");
    if (MULTI_AGENT.test(line)) {
      if (isHeading) {
        flaggedHeading = true;
        return add("section about another multi-agent or delegation strategy; it conflicts with Maestro's roles");
      }
      if (!flaggedHeading) add("mentions delegation to subagents or another multi-agent strategy; check it against Maestro's roles");
    }
  });
  return flags;
}

function gitignoreFlags(text) {
  const flags = [];
  linesOf(text).forEach((line, i) => {
    const t = line.trim();
    if (HIDING_CLAUDE.has(t)) flags.push({ file: ".gitignore", line: i + 1, reason: "hides all of .claude/, so project settings and the Maestro plugin enablement are never committed; ignore only .claude/worktrees/ and .claude/settings.local.json", text: t });
  });
  return flags;
}

/** Rules that may conflict with Maestro, for the PM to review with the owner: `[{file, line, reason, text}]`. */
export function flagConflicts(root) {
  const flags = [];
  for (const file of ["AGENTS.md", "CLAUDE.md"]) {
    const text = readText(join(root, file));
    if (text !== null) flags.push(...ruleFlags(file, text));
  }
  const ignore = readText(join(root, ".gitignore"));
  if (ignore !== null) flags.push(...gitignoreFlags(ignore));
  return flags;
}

/** PLAN.md size, to decide whether the skill proposes the history migration. */
export function planInfo(root) {
  const text = readText(join(root, "PLAN.md"));
  if (text === null) return null;
  return { lines: linesOf(text).length, history: /^#{1,3}\s+.*(history|storico|completat|closed|chiuse)/im.test(text) || /\bGOAL[-\s]?\d+/i.test(text) };
}
