import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readEvents } from "../scripts/lib/events.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "..", "scripts", "cli.mjs");
const FAKE = join(here, "cli-fake-backlog.mjs");
const STUB = join(here, "cli-context-stub.mjs");

function setup({ tasks = {}, version = "1.55.3", config } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "maestro-cli-")));
  const git = (...args) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  git("init", "-q", "-b", "master");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init");
  mkdirSync(join(dir, ".maestro"));
  writeFileSync(join(dir, ".maestro", "config.json"), JSON.stringify(config ?? { mainBranch: "master" }));
  const state = join(dir, "fake-state.json");
  writeFileSync(state, JSON.stringify({ version, tasks, edits: [] }));
  const env = {
    ...process.env,
    GIT_CEILING_DIRECTORIES: dirname(dir),
    MAESTRO_BACKLOG_BIN: process.execPath,
    MAESTRO_BACKLOG_ARGS: JSON.stringify([FAKE]),
    FAKE_BACKLOG_STATE: state,
    MAESTRO_TEST_CONTEXT_MODULE: STUB,
  };
  const run = (args, cwd = dir) => spawnSync(process.execPath, [CLI, ...args], { cwd, env, encoding: "utf8" });
  const edits = () => JSON.parse(readFileSync(state, "utf8")).edits;
  return { dir, git, env, run, edits, state };
}

const types = (dir) => readEvents(dir).map((e) => e.type);
const lockDir = (dir, id) => join(dir, ".git", "maestro-locks", id);

test("event_appends_line", () => {
  const { dir, run } = setup();
  const r = run(["event", "goal.start", "--goal", "TASK-3", "--actor", "pm", "--data", '{"a":1}']);
  assert.equal(r.status, 0, r.stderr);
  const events = readEvents(dir);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "goal.start");
  assert.equal(events[0].goal, "TASK-3");
  assert.deepEqual(events[0].data, { a: 1 });
  assert.equal(readFileSync(join(dir, ".maestro", "events.jsonl"), "utf8").split("\n").length, 2);
  assert.equal(run(["event", "x", "--data", "{bad"]).status, 1);
});

test("claim_is_exclusive_under_concurrency", async () => {
  const { dir, env, edits } = setup({ tasks: { "TASK-9": { title: "t", status: "Ready", assignees: [] } } });
  const launch = (actor) =>
    new Promise((resolve) => {
      const p = spawn(process.execPath, [CLI, "claim", "task-9", "--actor", actor], { cwd: dir, env, stdio: "ignore" });
      p.on("close", (code) => resolve(code));
    });
  const codes = await Promise.all([launch("a"), launch("b")]);
  assert.deepEqual([...codes].sort(), [0, 2]);
  const t = types(dir);
  assert.equal(t.filter((x) => x === "task.claim").length, 1);
  assert.equal(t.filter((x) => x === "task.claim_denied").length, 1);
  assert.equal(edits().length, 1);
  assert.ok(existsSync(lockDir(dir, "TASK-9")));
});

test("claim_refuses_non_ready_task", () => {
  const { dir, run, edits } = setup({
    tasks: { "TASK-5": { title: "t", status: "In Progress", assignees: ["@other"] } },
  });
  const r = run(["claim", "TASK-5", "--actor", "me"]);
  assert.equal(r.status, 2);
  assert.equal(edits().length, 0);
  assert.deepEqual(types(dir), ["task.claim_denied"]);
  assert.equal(existsSync(lockDir(dir, "TASK-5")), false);
});

test("claim_then_release", () => {
  const { dir, run, edits } = setup({ tasks: { "TASK-1": { title: "t", status: "To Do", assignees: [] } } });
  assert.equal(run(["claim", "TASK-1", "--actor", "me"]).status, 0);
  assert.deepEqual(edits()[0].args, ["-a", "@me", "-s", "In Progress"]);
  assert.equal(run(["release", "TASK-1", "--actor", "me", "--status", "In Review"]).status, 0);
  assert.equal(existsSync(lockDir(dir, "TASK-1")), false);
  assert.equal(edits().length, 2);
  assert.deepEqual(types(dir), ["task.claim", "task.release"]);
});

test("worktree_branches_from_goal", () => {
  const { dir, run } = setup();
  const r = run(["worktree", "impl-1", "--goal", "TASK-3"]);
  assert.equal(r.status, 0, r.stderr);
  const path = join(dir, ".claude", "worktrees", "impl-1");
  assert.ok(existsSync(path));
  const rev = (b) => execFileSync("git", ["rev-parse", b], { cwd: dir, encoding: "utf8" }).trim();
  assert.equal(rev("goal/TASK-3"), rev("master"));
  assert.equal(execFileSync("git", ["branch", "--show-current"], { cwd: path, encoding: "utf8" }).trim(), "impl-1");
  // second call refused, --reuse accepted
  assert.equal(run(["worktree", "impl-1", "--goal", "TASK-3"]).status, 2);
  assert.equal(run(["worktree", "impl-1", "--goal", "TASK-3", "--reuse"]).status, 0);
  // run from inside the worktree: events go to the main checkout
  assert.equal(run(["event", "x.y"], path).status, 0);
  assert.equal(types(dir).includes("x.y"), true);
});

test("doctor_reports_backlog_version", () => {
  const ok = setup();
  assert.equal(ok.run(["doctor"]).status, 0);
  const wrong = setup({ version: "1.53.0" });
  const r = wrong.run(["doctor"]);
  assert.equal(r.status, 2);
  assert.match(r.stdout, /npm i -g backlog\.md@1\.55\.3/);
  const missing = setup({ version: null });
  const m = missing.run(["doctor"]);
  assert.equal(m.status, 2);
  assert.match(m.stdout, /npm i -g backlog\.md@1\.55\.3/);
});

test("measure_sums_agent_usage", () => {
  const { dir, run } = setup();
  const session = join(dir, "sess.jsonl");
  const sub = join(dir, "sess", "subagents");
  mkdirSync(sub, { recursive: true });
  const rec = (n, wallMs) => ({ models: { "claude-sonnet-5-5": { input: n, output: n * 2, cacheRead: 0, cacheWrite: 1 } }, wallMs });
  writeFileSync(join(sub, "agent-a1.jsonl"), JSON.stringify(rec(10, 1000)));
  writeFileSync(join(sub, "agent-a2.jsonl"), JSON.stringify(rec(5, 500)));
  const r = run(["measure", "TASK-3.2", "--agent-id", "a1,a2", "--transcript", session, "--interventions", "1", "--rework", "2"]);
  assert.equal(r.status, 0, r.stderr);
  const e = readEvents(dir).find((x) => x.type === "task.measure");
  assert.equal(e.task, "TASK-3.2");
  assert.deepEqual(e.data.usage.models["claude-sonnet-5-5"], { input: 15, output: 30, cacheRead: 0, cacheWrite: 2 });
  assert.equal(e.data.wallMs, 1500);
  assert.equal(e.data.ownerInterventions, 1);
  assert.equal(e.data.reworkCycles, 2);
  assert.equal(run(["measure", "TASK-3.2", "--agent-id", "nope", "--transcript", session]).status, 1);
});

test("status_groups_tasks_and_claims", () => {
  const { run } = setup({ tasks: { "TASK-1": { title: "a", status: "Ready", assignees: [] } } });
  run(["claim", "TASK-1", "--actor", "me"]);
  const r = run(["status", "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const s = JSON.parse(r.stdout);
  assert.equal(s.tasks["In Progress"][0].id, "TASK-1");
  assert.equal(s.claims[0].actor, "me");
});

test("usage_reads_last_sample_without_probe", () => {
  const { dir, run } = setup();
  assert.equal(run(["usage"]).status, 0);
  mkdirSync(join(dir, ".maestro", "runtime"));
  writeFileSync(join(dir, ".maestro", "runtime", "usage.json"), JSON.stringify({ ts: "t", fiveHour: 12.5, sevenDay: 3, resetsAt: "r" }));
  assert.match(run(["usage"]).stdout, /12\.5%/);
});

test("usage_probe_parses_rate_limit_event_with_fake_claude", () => {
  const { dir, env } = setup();
  const fake = join(dir, "fake-claude.mjs");
  const line = { type: "rate_limit_event", rate_limit_info: { unifiedWindows: { five_hour: { utilization: 0.42, resetsAt: 123 }, seven_day: { utilization: 0.1 } } } };
  writeFileSync(fake, `console.log("{}"); console.log(${JSON.stringify(JSON.stringify(line))});`);
  const e = { ...env, MAESTRO_CLAUDE_BIN: process.execPath, MAESTRO_CLAUDE_ARGS: JSON.stringify([fake]) };
  const r = spawnSync(process.execPath, [CLI, "usage", "--probe", "--json"], { cwd: dir, env: e, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const s = JSON.parse(r.stdout);
  assert.equal(s.fiveHour, 42);
  assert.equal(s.sevenDay, 10);
  assert.equal(readEvents(dir).find((x) => x.type === "usage.sample").data.fiveHour, 42);
});

test("bin_launchers_run_the_cli", () => {
  const bin = join(here, "..", "bin");
  const env = { ...process.env, GIT_CEILING_DIRECTORIES: dirname(tmpdir()) };
  const r =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/c", join(bin, "maestro.cmd"), "--help"], { env, encoding: "utf8" })
      : spawnSync("sh", [join(bin, "maestro"), "--help"], { env, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /usage: maestro/);
});
