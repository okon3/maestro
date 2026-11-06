// Backlog.md and external tool calls (contract: docs/plugin-contracts.md section 6).
//
// Overrides (used by tests and unusual installs):
//   MAESTRO_BACKLOG_BIN   executable to run instead of `backlog` (spawned without a shell)
//   MAESTRO_BACKLOG_ARGS  JSON array of arguments placed before the real ones,
//                         e.g. MAESTRO_BACKLOG_BIN=node MAESTRO_BACKLOG_ARGS='["C:/x/fake.mjs"]'
//   MAESTRO_CLAUDE_BIN / MAESTRO_CLAUDE_ARGS  same, for `claude` (see cli.mjs usage --probe)
import { spawnSync } from "node:child_process";

const SAFE = /^[A-Za-z0-9_@=:.,\/\\-]+$/;

function quoteForShell(arg) {
  if (SAFE.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}

/**
 * Run a tool synchronously. Without an override on Windows the tool is typically an npm `.cmd` shim,
 * which cannot be spawned without a shell, so the command line is built with quoted arguments.
 * Returns { status, stdout, stderr, error }.
 */
export function runTool(name, args, { cwd, env, input, timeout } = {}) {
  const upper = name.toUpperCase();
  const override = process.env[`MAESTRO_${upper}_BIN`];
  const extra = process.env[`MAESTRO_${upper}_ARGS`] ? JSON.parse(process.env[`MAESTRO_${upper}_ARGS`]) : [];
  const opts = {
    cwd,
    env: env ?? process.env,
    encoding: "utf8",
    input,
    timeout,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    windowsHide: true,
  };
  let r;
  if (override) {
    r = spawnSync(override, [...extra, ...args], opts);
  } else if (process.platform === "win32") {
    r = spawnSync([name, ...args].map(quoteForShell).join(" "), { ...opts, shell: true });
  } else {
    r = spawnSync(name, args, opts);
  }
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", error: r.error ?? null };
}

/** Installed Backlog.md version string, or null when missing. */
export function backlogVersion(cwd) {
  const r = runTool("backlog", ["--version"], { cwd });
  if (r.error || r.status !== 0) return null;
  return r.stdout.trim().split(/\s+/).pop() || null;
}

function backlogJson(args, cwd) {
  const r = runTool("backlog", args, { cwd });
  if (r.error || r.status !== 0) {
    throw new Error(`backlog ${args.join(" ")} failed: ${(r.stderr || r.stdout || String(r.error)).trim()}`);
  }
  return JSON.parse(r.stdout);
}

/** `{id, status, assignees}` for one task (tolerates `task` envelope and `assignee` string). */
export function viewTask(id, cwd) {
  const raw = backlogJson(["task", "view", id, "--json"], cwd);
  const t = raw.task ?? raw;
  const assignees = Array.isArray(t.assignees) ? t.assignees : t.assignee ? [t.assignee] : [];
  return { ...t, id: t.id ?? id, status: t.status ?? "", assignees: assignees.filter(Boolean) };
}

/** All tasks from `task list --json` (envelope `{tasks}` or a bare array). */
export function listTasks(cwd) {
  const raw = backlogJson(["task", "list", "--json"], cwd);
  return Array.isArray(raw) ? raw : (raw.tasks ?? []);
}

/** `backlog task edit`; `assignee` like "@impl-1", `status` like "In Progress". Throws on failure. */
export function editTask(id, { assignee, status }, cwd) {
  const args = ["task", "edit", id];
  if (assignee) args.push("-a", assignee);
  if (status) args.push("-s", status);
  const r = runTool("backlog", args, { cwd });
  if (r.error || r.status !== 0) {
    throw new Error(`backlog ${args.join(" ")} failed: ${(r.stderr || r.stdout || String(r.error)).trim()}`);
  }
}
