#!/usr/bin/env node
// Install Maestro's project files (used by the init skill). Node built-ins only, idempotent:
// creates missing files from templates/ (plus an empty .maestro/events.jsonl and .maestro/reports/), appends
// missing ignore/attributes lines (including LF line endings for backlog/ and .maestro/), inserts or refreshes
// the marked AGENTS.md block (text outside the markers is never touched), proposes `worktreeSetup` for Node
// projects, and sets up Backlog.md.
//
// usage: node init.mjs [--dry-run] [--json] [--project NAME] [--main-branch B] [--language L] [--skip-backlog]
// Exit codes: 0 done, 1 error, 2 done but something needs the owner (see "manual" lines). "review" lines are
// conflicting rules found in the existing files for the PM to go through with the owner; they are never edited here.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { findProjectRoot } from "./lib/config.mjs";
import { backlogVersion, runTool } from "./lib/backlog.mjs";
import { MARKER_END, MARKER_START, detectChecks, flagConflicts, planInfo, prefillChecks, usesNodeModules } from "./lib/adopt.mjs";

const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), "..", "templates");

export { MARKER_START, MARKER_END };
export const BACKLOG_STATUSES = ["To Do", "Ready", "In Progress", "Blocked", "In Review", "Integrated", "Done"];
export const BACKLOG_LABELS = ["goal", "proposed"];
export const DEFINITION_OF_DONE = ["Named test per acceptance criterion passes", "Architect review approved"];
// Backlog.md runs this with `sh -c` and TASK_ID/OLD_STATUS/NEW_STATUS in the environment. `maestro` is on
// PATH only inside Claude Code sessions with the plugin enabled; elsewhere the hook does nothing.
export const STATUS_HOOK =
  'command -v maestro >/dev/null 2>&1 || exit 0; maestro event task.status --task "$TASK_ID" --data "{\\"from\\":\\"$OLD_STATUS\\",\\"to\\":\\"$NEW_STATUS\\"}"';

const EVENTS_PATH = ".maestro/events.jsonl";
const REPORTS_DIR = ".maestro/reports";
const BACKLOG_CONFIGS =[join("backlog", "config.yml"), join(".backlog", "config.yml"), "backlog.config.yml"];
const HOOK_KEYS = ["onStatusChange", "on_status_change"];

const template = (name) => readFileSync(join(TEMPLATES, name), "utf8");
const eolOf = (text) => (text.includes("\r\n") ? "\r\n" : "\n");
const withEol = (text, eol) => text.replace(/\r?\n/g, eol);
const yamlList = (items) => `[${items.map((s) => `"${s}"`).join(", ")}]`;
const parseYamlList = (value) =>
  value.trim().replace(/^\[|\]$/g, "").split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);

/** Append `section` to `text`, separated by a blank line, keeping the file's line endings. */
function appendSection(text, section) {
  const eol = eolOf(text);
  let out = text;
  if (out && !out.endsWith("\n")) out += eol;
  if (out) out += eol;
  return out + withEol(section.trimEnd(), eol) + eol;
}

const WORKTREE_SETUP_NOTE = 'worktreeSetup.link ["node_modules"]: worktrees link the main checkout\'s node_modules instead of installing';

/** Add a top-level key to a JSON object text before its closing brace, keeping the rest of the text as it is. */
export function addJsonKey(text, key, value) {
  const eol = eolOf(text);
  const end = text.lastIndexOf("}");
  const head = text.slice(0, end).replace(/\s*$/, "");
  const sep = head.endsWith("{") ? "" : ",";
  return `${head}${sep}${eol}  ${JSON.stringify(key)}: ${JSON.stringify(value)}${eol}}${text.slice(end + 1)}`;
}

/** Append the lines of `wanted` missing from `text` (compared trimmed, without leading/trailing slashes). */
export function mergeLines(text, wanted, header = "# Maestro") {
  const norm = (l) => l.trim().replace(/^\/+|\/+$/g, "");
  const have = new Set(text.split(/\r?\n/).map(norm));
  const missing = wanted.filter((l) => l.trim() && !have.has(norm(l)));
  if (!missing.length) return { text, added: [] };
  return { text: appendSection(text, [header, ...missing].join("\n")), added: missing };
}

/**
 * Insert or refresh the marked block. Returns { text, mode } with mode
 * "inserted" | "refreshed" | "unchanged" | "invalid" (markers broken: nothing changed).
 */
export function upsertBlock(text, block, extra = "") {
  const eol = eolOf(text);
  const body = withEol(block.trimEnd(), eol);
  const start = text.indexOf(MARKER_START);
  const end = text.indexOf(MARKER_END);
  const starts = text.split(MARKER_START).length - 1;
  const ends = text.split(MARKER_END).length - 1;
  if (starts === 0 && ends === 0) {
    const out = appendSection(text, body);
    return { text: extra ? appendSection(out, extra) : out, mode: "inserted" };
  }
  if (starts !== 1 || ends !== 1 || end < start) return { text, mode: "invalid" };
  const current = text.slice(start, end + MARKER_END.length);
  if (current === body) return { text, mode: "unchanged" };
  return { text: text.slice(0, start) + body + text.slice(end + MARKER_END.length), mode: "refreshed" };
}

/**
 * Apply Maestro's Backlog.md settings to a config.yml text. `fresh` (just created by `backlog init`)
 * sets every value; otherwise only missing keys are added and differences are reported in `manual`.
 */
export function patchBacklogConfig(text, { fresh }) {
  const eol = eolOf(text);
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  const wanted = [
    { keys: ["statuses"], value: yamlList(BACKLOG_STATUSES), same: (v) => parseYamlList(v).join("|") === BACKLOG_STATUSES.join("|") },
    { keys: ["labels"], value: yamlList(BACKLOG_LABELS), same: (v) => BACKLOG_LABELS.every((l) => parseYamlList(v).includes(l)) },
    { keys: ["remote_operations"], value: "false", same: (v) => v.trim() === "false" },
    { keys: ["definition_of_done"], dod: true },
    { keys: HOOK_KEYS, value: `'${STATUS_HOOK}'`, same: (v) => v.trim().replace(/^'|'$/g, "") === STATUS_HOOK },
  ];
  const changes = [];
  const manual = [];
  for (const w of wanted) {
    const index = lines.findIndex((l) => w.keys.some((k) => new RegExp(`^${k}\\s*:`).test(l)));
    const name = w.keys[0];
    if (w.dod) {
      // Definition of Done defaults (an inline JSON array, as Backlog.md writes it): always additive.
      if (index === -1) {
        lines.push(`${name}: ${JSON.stringify(DEFINITION_OF_DONE)}`);
        changes.push(`added ${name}`);
        continue;
      }
      const raw = lines[index].slice(lines[index].indexOf(":") + 1).trim();
      let items = null;
      try {
        items = JSON.parse(raw);
      } catch {}
      if (!Array.isArray(items)) manual.push(`backlog config ${name} is ${raw || "a multi-line list"}; add ${DEFINITION_OF_DONE.map((d) => `"${d}"`).join(" and ")} by hand`);
      else {
        const missing = DEFINITION_OF_DONE.filter((d) => !items.includes(d));
        if (missing.length) {
          lines[index] = `${name}: ${JSON.stringify([...items, ...missing])}`;
          changes.push(`extended ${name}`);
        }
      }
      continue;
    }
    if (index === -1) {
      lines.push(`${name}: ${w.value}`);
      changes.push(`added ${name}`);
      continue;
    }
    const value = lines[index].slice(lines[index].indexOf(":") + 1).trim();
    if (w.same(value)) continue;
    if (fresh) {
      lines[index] = `${name}: ${w.value}`;
      changes.push(`set ${name}`);
    } else manual.push(`backlog config ${name} is ${value}; Maestro expects ${name}: ${w.value}`);
  }
  return { text: lines.join(eol) + eol, changes, manual };
}

function detectMainBranch(root) {
  const has = (b) => {
    try {
      execFileSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${b}`], { cwd: root, stdio: "ignore", windowsHide: true });
      return true;
    } catch {
      return false;
    }
  };
  if (has("main")) return "main";
  if (has("master")) return "master";
  try {
    return execFileSync("git", ["symbolic-ref", "--short", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true }).trim() || null;
  } catch {
    return null;
  }
}

/** Run the installer. Returns { root, actions: [{path, action, detail?}], manual: [string], review: [{file, line, reason, text}], checks, dryRun }. */
export function init({ cwd = process.cwd(), dryRun = false, project, mainBranch, language, skipBacklog = false } = {}) {
  const root = findProjectRoot(cwd);
  if (!root) throw new Error("not inside a git repository (run `git init` first)");
  const actions = [];
  const manual = [];
  const act = (path, action, detail) => actions.push({ path, action: dryRun && action !== "unchanged" ? `would ${action}` : action, ...(detail ? { detail } : {}) });
  const abs = (p) => join(root, p);
  const read = (p) => (existsSync(abs(p)) ? readFileSync(abs(p), "utf8") : null);
  const write = (p, text) => {
    if (dryRun) return;
    mkdirSync(dirname(abs(p)), { recursive: true });
    writeFileSync(abs(p), text, "utf8");
  };
  const name = project || basename(root);

  // .maestro/config.json
  // A Node project gets `worktreeSetup.link: ["node_modules"]` so worktrees share the main checkout's packages;
  // an existing config without the key gets it as an `update` line the owner approves.
  const configPath = ".maestro/config.json";
  const nodeSetup = usesNodeModules(root) ? { link: ["node_modules"], run: null } : null;
  const currentConfig = read(configPath);
  if (currentConfig === null) {
    const config = JSON.parse(template("config.json"));
    config.mainBranch = mainBranch || detectMainBranch(root) || config.mainBranch;
    if (language) config.language = language;
    if (nodeSetup) config.worktreeSetup = nodeSetup;
    write(configPath, JSON.stringify(config, null, 2) + "\n");
    act(configPath, "create", `mainBranch ${config.mainBranch}, language ${config.language}${nodeSetup ? `, ${WORKTREE_SETUP_NOTE}` : ""}`);
  } else {
    let parsed = null;
    try {
      parsed = JSON.parse(currentConfig.replace(/^﻿/, ""));
    } catch {
      manual.push(`${configPath} is not valid JSON; fix it by hand`);
    }
    if (nodeSetup && parsed && typeof parsed === "object" && !Array.isArray(parsed) && !("worktreeSetup" in parsed)) {
      write(configPath, addJsonKey(currentConfig, "worktreeSetup", nodeSetup));
      act(configPath, "update", WORKTREE_SETUP_NOTE);
    } else act(configPath, "unchanged");
  }

  // Files created only when missing.
  for (const [path, tpl] of [[".maestro/handoff.md", "handoff.md"], ["PLAN.md", "PLAN.md"]]) {
    if (read(path) === null) {
      write(path, template(tpl).replaceAll("{{PROJECT}}", name));
      act(path, "create");
    } else act(path, "unchanged");
  }

  // The event log and the reports folder exist from the start, so the first readers and writers find them.
  // The folder holds a .gitkeep so it travels with a clone before the first report.
  if (read(EVENTS_PATH) === null) {
    write(EVENTS_PATH, "");
    act(EVENTS_PATH, "create", "empty event log");
  } else act(EVENTS_PATH, "unchanged");
  if (!existsSync(abs(REPORTS_DIR))) {
    write(`${REPORTS_DIR}/.gitkeep`, "");
    act(`${REPORTS_DIR}/`, "create");
  } else act(`${REPORTS_DIR}/`, "unchanged");

  // Ignore and attributes lines (.gitattributes: union merge of the event log, LF for backlog/ and .maestro/).
  for (const [path, tpl] of [[".gitignore", "gitignore"], [".gitattributes", "gitattributes"]]) {
    const current = read(path);
    const { text, added } = mergeLines(current ?? "", template(tpl).split(/\r?\n/));
    if (!added.length) act(path, "unchanged");
    else {
      write(path, text);
      act(path, current === null ? "create" : "append", added.join(", "));
    }
  }

  // AGENTS.md block, plus the authority/checks skeleton the first time the block is inserted. The Checks
  // section is pre-filled from the project's scripts, CI and lockfiles while it still holds the template TODOs.
  const agentsPath = "AGENTS.md";
  const agents = read(agentsPath);
  const local = template("agents-local.md");
  const detected = detectChecks(root);
  const review = flagConflicts(root);
  const plan = planInfo(root);
  if (plan && plan.lines > 150) review.push({ file: "PLAN.md", line: 1, reason: `${plan.lines} lines${plan.history ? " with GOAL history" : ""}: propose the migration (history to docs/history/, short roadmap, open items as Backlog drafts)`, text: "" });
  if (agents === null) {
    const fresh = `# ${name}: agent instructions

${template("agents-section.md").trimEnd()}

${local.trimEnd()}
`;
    const { text, changed } = prefillChecks(fresh, detected);
    write(agentsPath, text);
    act(agentsPath, "create", changed ? `Checks pre-filled from ${detected.checks.length} detected command(s)` : undefined);
  } else {
    const hasAuthority = /^#{1,6}s+Authority/im.test(agents);
    const { text: upserted, mode } = upsertBlock(agents, template("agents-section.md"), hasAuthority ? "" : local);
    if (mode === "invalid") manual.push(`${agentsPath}: Maestro markers are broken (need exactly one ${MARKER_START} before one ${MARKER_END}); fix them by hand`);
    else {
      const { text, changed } = prefillChecks(upserted, detected);
      const note = changed ? `Checks pre-filled from ${detected.checks.length} detected command(s), owner to confirm` : "";
      if (mode === "unchanged" && !changed) act(agentsPath, "unchanged");
      else {
        write(agentsPath, text);
        if (mode === "unchanged") act(agentsPath, "update", note);
        else {
          const what = mode === "inserted" ? `Maestro block${hasAuthority ? "" : " + Authority and Checks sections"}` : "Maestro block";
          act(agentsPath, mode === "inserted" ? "insert" : "refresh", note ? `${what}; ${note}` : what);
        }
        if (mode === "inserted" && hasAuthority) manual.push(`${agentsPath}: check that the existing Authority section covers commits, push, deploy and the project checks`);
      }
    }
  }

  // CLAUDE.md must import AGENTS.md, or Claude Code never reads it.
  const claudePath = "CLAUDE.md";
  const claude = read(claudePath);
  if (claude === null) {
    write(claudePath, "@AGENTS.md\n");
    act(claudePath, "create");
  } else if (/^@AGENTS\.md\s*$/m.test(claude)) act(claudePath, "unchanged");
  else {
    write(claudePath, appendSection(claude, "@AGENTS.md"));
    act(claudePath, "append", "@AGENTS.md");
  }

  // Backlog.md.
  if (skipBacklog) act("backlog/", "skipped");
  else setupBacklog({ root, name, dryRun, read, write, act, manual });

  return { root, actions, manual, review, checks: detected.checks, dryRun };
}

function setupBacklog({ root, name, dryRun, read, write, act, manual }) {
  let configPath = BACKLOG_CONFIGS.find((p) => existsSync(join(root, p)));
  let fresh = false;
  if (!configPath) {
    if (existsSync(join(root, "backlog")) || existsSync(join(root, ".backlog"))) {
      manual.push("backlog/ exists but has no config.yml; run `backlog init` by hand");
      return;
    }
    if (!backlogVersion(root)) {
      manual.push("Backlog.md is not installed: npm i -g backlog.md@1.55.3, then run init again");
      return;
    }
    const args = ["init", name, "--defaults", "--integration-mode", "cli", "--agent-instructions", "none", "--include-remote", "false", "--auto-open-browser", "false"];
    if (dryRun) {
      act("backlog/", "create", `backlog ${args.join(" ")}; statuses, labels, remote_operations, onStatusChange`);
      return;
    }
    const r = runTool("backlog", args, { cwd: root, timeout: 120000 });
    configPath = BACKLOG_CONFIGS.find((p) => existsSync(join(root, p)));
    if (r.error || r.status !== 0 || !configPath) {
      manual.push(`backlog init failed: ${(r.stderr || r.stdout || String(r.error ?? "no config.yml created")).trim()}`);
      return;
    }
    act("backlog/", "create", "backlog init");
    fresh = true;
  }
  const { text, changes, manual: notes } = patchBacklogConfig(read(configPath), { fresh });
  manual.push(...notes);
  const path = configPath.replaceAll("\\", "/");
  if (!changes.length) act(path, "unchanged");
  else {
    write(configPath, text);
    act(path, "update", changes.join(", "));
  }
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--skip-backlog") opts.skipBacklog = true;
    else if (["--project", "--main-branch", "--language"].includes(a) && i + 1 < argv.length) {
      opts[a.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = argv[++i];
    } else throw new Error(`unknown or incomplete option: ${a}`);
  }
  return opts;
}

export function main(argv) {
  const opts = parseArgs(argv);
  const result = init(opts);
  if (opts.json) console.log(JSON.stringify(result));
  else {
    console.log(`Maestro init in ${result.root}${result.dryRun ? " (dry run: nothing written)" : ""}`);
    for (const a of result.actions) console.log(`${a.action.padEnd(14)} ${a.path}${a.detail ? `  (${a.detail})` : ""}`);
    for (const m of result.manual) console.log(`manual         ${m}`);
    for (const r of result.review) console.log(`review         ${r.file}:${r.line}  ${r.reason}${r.text ? `: "${r.text}"` : ""}`);
  }
  return result.manual.length ? 2 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(`maestro init: ${e.message}`);
    process.exitCode = 1;
  }
}
