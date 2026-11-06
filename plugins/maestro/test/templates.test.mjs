import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readEvents } from "../scripts/lib/events.mjs";
import { MARKER_END, MARKER_START, STATUS_HOOK } from "../scripts/init.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const INIT = join(here, "..", "scripts", "init.mjs");
const BIN = join(here, "..", "bin");
const FAKE = join(here, "templates-fake-backlog.mjs");
const TEMPLATES = join(here, "..", "templates");

function setup(files = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "maestro-init-")));
  execFileSync("git", ["init", "-q", "-b", "master"], { cwd: dir, stdio: "ignore" });
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  const log = join(tmpdir(), `maestro-init-log-${process.pid}-${Math.random().toString(36).slice(2)}.jsonl`);
  const env = {
    ...process.env,
    GIT_CEILING_DIRECTORIES: dirname(dir),
    MAESTRO_BACKLOG_BIN: process.execPath,
    MAESTRO_BACKLOG_ARGS: JSON.stringify([FAKE]),
    FAKE_BACKLOG_LOG: log,
  };
  const run = (...args) => spawnSync(process.execPath, [INIT, ...args], { cwd: dir, env, encoding: "utf8" });
  const calls = () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
  return { dir, run, calls, env };
}

/** All files under dir except .git, as {relative path: content}. */
function snapshot(dir, base = dir, out = {}) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) snapshot(path, base, out);
    else out[relative(base, path).replaceAll("\\", "/")] = readFileSync(path, "utf8");
  }
  return out;
}

const read = (dir, path) => readFileSync(join(dir, path), "utf8");
const block = () => readFileSync(join(TEMPLATES, "agents-section.md"), "utf8").trimEnd();
const count = (text, s) => text.split(s).length - 1;

test("init_templates_are_idempotent", () => {
  const agents = "# My project\r\n\r\nKeep this rule.\r\n";
  const gitignore = "node_modules/\n/.claude/worktrees\n";
  const { dir, run, calls } = setup({ "AGENTS.md": agents, ".gitignore": gitignore });

  const first = run();
  assert.equal(first.status, 0, first.stderr + first.stdout);

  const config = JSON.parse(read(dir, ".maestro/config.json"));
  assert.equal(config.mainBranch, "master");
  assert.equal(config.reviewEveryTasks, 15);
  assert.match(read(dir, ".maestro/handoff.md"), /## Now[\s\S]*## Running agents \(ids\)[\s\S]*## Waiting for the owner[\s\S]*## Next action[\s\S]*## Notes/);
  assert.match(read(dir, "PLAN.md"), new RegExp(`^# ${dir.split(/[\\/]/).pop()}: plan`));

  const ignore = read(dir, ".gitignore");
  assert.ok(ignore.startsWith(gitignore), "existing .gitignore text preserved");
  assert.ok(ignore.includes(".maestro/runtime/") && ignore.includes(".claude/settings.local.json"));
  assert.equal(count(ignore, "worktrees"), 1, "equivalent line not duplicated");
  assert.match(read(dir, ".gitattributes"), /^\.maestro\/events\.jsonl merge=union$/m);

  const agentsAfter = read(dir, "AGENTS.md");
  assert.ok(agentsAfter.startsWith(agents), "existing AGENTS.md text preserved");
  assert.equal(count(agentsAfter, MARKER_START), 1);
  assert.equal(count(agentsAfter, MARKER_END), 1);
  assert.ok(agentsAfter.includes(block().replace(/\n/g, "\r\n")), "block inserted with the file's line endings");
  assert.match(agentsAfter, /^## Authority/m);
  assert.equal(read(dir, "CLAUDE.md"), "@AGENTS.md\n");

  const backlog = read(dir, "backlog/config.yml");
  assert.match(backlog, /^statuses: \["To Do", "Ready", "In Progress", "Blocked", "In Review", "Integrated", "Done"\]$/m);
  assert.match(backlog, /^labels: \["goal", "proposed"\]$/m);
  assert.match(backlog, /^remote_operations: false$/m);
  assert.ok(backlog.includes(`onStatusChange: '${STATUS_HOOK}'`));
  const init = calls().find((c) => c[0] === "init");
  assert.deepEqual(init, ["init", dir.split(/[\\/]/).pop(), "--defaults", "--integration-mode", "cli", "--agent-instructions", "none", "--include-remote", "false", "--auto-open-browser", "false"]);

  const before = snapshot(dir);
  const second = run();
  assert.equal(second.status, 0, second.stderr + second.stdout);
  assert.deepEqual(snapshot(dir), before, "second run changes nothing");
  assert.equal(calls().filter((c) => c[0] === "init").length, 1, "backlog init runs once");
  for (const line of second.stdout.trim().split("\n").slice(1)) assert.match(line, /^unchanged /);
});

test("init_dry_run_writes_nothing", () => {
  const { dir, run, calls } = setup({ "AGENTS.md": "# Mine\n" });
  const before = snapshot(dir);
  const r = run("--dry-run");
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(snapshot(dir), before);
  assert.match(r.stdout, /would create\s+\.maestro\/config\.json/);
  assert.match(r.stdout, /would insert\s+AGENTS\.md/);
  assert.match(r.stdout, /would create\s+backlog\//);
  assert.equal(calls().filter((c) => c[0] === "init").length, 0);
});

test("init_refreshes_block_and_keeps_text_outside_markers", () => {
  const head = "# Rules\n\nBefore the block.\n\n";
  const tail = "\n\n## Authority\n\nPush: never.\n";
  const stale = `${MARKER_START}\nold Maestro text\n${MARKER_END}`;
  const { dir, run } = setup({ "AGENTS.md": head + stale + tail });
  const r = run("--skip-backlog");
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(read(dir, "AGENTS.md"), head + block() + tail);
  assert.match(r.stdout, /refresh\s+AGENTS\.md/);
});

test("init_extends_existing_backlog_config_without_overwriting", () => {
  const existing = 'project_name: "X"\nstatuses: ["Todo", "Doing", "Done"]\nlabels: ["bug"]\n';
  const { dir, run, calls } = setup({ "backlog/config.yml": existing });
  const r = run();
  assert.equal(r.status, 2, "differences need the owner");
  const text = read(dir, "backlog/config.yml");
  assert.ok(text.startsWith(existing), "existing settings untouched");
  assert.ok(text.includes(`onStatusChange: '${STATUS_HOOK}'`));
  assert.match(r.stdout, /manual\s+backlog config statuses/);
  assert.equal(calls().filter((c) => c[0] === "init").length, 0);
});

// Runs the generated hook the way Backlog.md 1.55.3 does: strip the outer quotes of the config value,
// then `sh -c` with TASK_ID/OLD_STATUS/NEW_STATUS set. Needs `sh` (Git Bash on Windows).
const hasSh = spawnSync("sh", ["-c", "exit 0"]).status === 0;
test("status_hook_logs_task_status_event", { skip: !hasSh && "sh not on PATH" }, () => {
  const { dir, run, env } = setup();
  assert.equal(run().status, 0);
  const line = read(dir, "backlog/config.yml").split("\n").find((l) => l.startsWith("onStatusChange:"));
  const command = line.substring(line.indexOf(":") + 1).trim().replace(/^['"]|['"]$/g, "");
  const hookEnv = { ...env, TASK_ID: "TASK-7", OLD_STATUS: "Ready", NEW_STATUS: "In Progress", PATH: `${BIN}${delimiter}${env.PATH}` };
  const r = spawnSync("sh", ["-c", command], { cwd: dir, env: hookEnv, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const events = readEvents(dir).filter((e) => e.type === "task.status");
  assert.equal(events.length, 1);
  assert.equal(events[0].task, "TASK-7");
  assert.deepEqual(events[0].data, { from: "Ready", to: "In Progress" });

  const noMaestro = env.PATH.split(delimiter).filter((p) => p && !existsSync(join(p, "maestro"))).join(delimiter);
  const silent = spawnSync("sh", ["-c", command], { cwd: dir, env: { ...hookEnv, PATH: noMaestro }, encoding: "utf8" });
  assert.equal(silent.status, 0, `no maestro on PATH: the hook is a no-op (${silent.stderr})`);
  assert.equal(readEvents(dir).filter((e) => e.type === "task.status").length, 1);
});
