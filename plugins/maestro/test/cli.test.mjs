import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readEvents } from "../scripts/lib/events.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "..", "scripts", "cli.mjs");
const FAKE = join(here, "cli-fake-backlog.mjs");
const STUB = join(here, "cli-context-stub.mjs");
const FAKE_CLAUDE = join(here, "cli-fake-claude.mjs");

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
    // Claims probe usage when no fresh sample exists: never call the real claude. Without FAKE_CLAUDE_USAGE the
    // fake prints nothing, so usage is unknown and claims are not gated.
    MAESTRO_CLAUDE_BIN: process.execPath,
    MAESTRO_CLAUDE_ARGS: JSON.stringify([FAKE_CLAUDE]),
    FAKE_CLAUDE_USAGE: "",
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@t",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@t",
  };
  const run = (args, cwd = dir, extraEnv = {}) => spawnSync(process.execPath, [CLI, ...args], { cwd, env: { ...env, ...extraEnv }, encoding: "utf8" });
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

test("worktree_tracks_remote_goal_branch", () => {
  const { dir, git, run } = setup();
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "goal work");
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
  git("update-ref", "refs/remotes/origin/goal/TASK-7", sha);
  git("reset", "-q", "--hard", "HEAD~1");
  const r = run(["worktree", "impl-9", "--goal", "TASK-7"]);
  assert.equal(r.status, 0, r.stderr);
  const rev = execFileSync("git", ["rev-parse", "goal/TASK-7"], { cwd: dir, encoding: "utf8" }).trim();
  assert.equal(rev, sha, "goal branch follows the remote, not main");
});

// ---------------------------------------------------------------------------------------------
// Usage gate, pause flag and salvage (M-6 tasks 8.4 and 8.7).

const RESET = 1793988600; // Unix seconds, as in the probe output
function writeUsage(dir, { fiveHour, sevenDay = 10, ageMs = 0 }) {
  mkdirSync(join(dir, ".maestro", "runtime"), { recursive: true });
  const ts = new Date(Date.now() - ageMs).toISOString();
  writeFileSync(join(dir, ".maestro", "runtime", "usage.json"), JSON.stringify({ ts, fiveHour, sevenDay, resetsAt: RESET }));
}
const ready = (id) => ({ [id]: { title: "t", status: "Ready", assignees: [] } });

test("claim_refused_at_top_usage_band", () => {
  const { dir, run, edits } = setup({ tasks: ready("TASK-1") });
  writeUsage(dir, { fiveHour: 96 });
  const r = run(["claim", "TASK-1", "--actor", "impl-1"]);
  assert.equal(r.status, 2);
  assert.match(r.stdout, /five-hour usage 96%/);
  assert.match(r.stdout, /top usage band 95%/);
  assert.ok(r.stdout.includes(new Date(RESET * 1000).toISOString()), "names the reset time");
  assert.equal(edits().length, 0);
  assert.equal(existsSync(lockDir(dir, "TASK-1")), false);
  const denied = readEvents(dir).find((e) => e.type === "task.claim_denied");
  assert.equal(denied.data.gate, "top");
  // The seven-day window gates too, and a custom top band (last of usageBands) is honoured.
  const custom = setup({ tasks: ready("TASK-2"), config: { mainBranch: "master", usageBands: [70, 90] } });
  writeUsage(custom.dir, { fiveHour: 20, sevenDay: 91 });
  const c = custom.run(["claim", "TASK-2", "--actor", "impl-1"]);
  assert.equal(c.status, 2);
  assert.match(c.stdout, /seven-day usage 91%.*top usage band 90%/);
});

test("claim_allowed_below_top_band_and_when_usage_unknown", () => {
  const { dir, run } = setup({ tasks: { ...ready("TASK-1"), ...ready("TASK-2") } });
  writeUsage(dir, { fiveHour: 90 }); // lower band: claims still allowed
  assert.equal(run(["claim", "TASK-1", "--actor", "impl-1"]).status, 0);
  rmSync(join(dir, ".maestro", "runtime", "usage.json"));
  const r = run(["claim", "TASK-2", "--actor", "impl-2"]); // no sample, probe prints nothing: fail open, said on stderr
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /usage unknown.*not gated/);
});

test("claim_probes_when_sample_is_stale", () => {
  const { dir, run } = setup({ tasks: ready("TASK-1") });
  writeUsage(dir, { fiveHour: 50, ageMs: 6 * 60 * 1000 }); // older than 5 minutes
  const log = join(dir, "probes.log");
  const r = run(["claim", "TASK-1", "--actor", "impl-1"], dir, { FAKE_CLAUDE_USAGE: JSON.stringify({ five: 0.97, reset: RESET }), FAKE_CLAUDE_LOG: log });
  assert.equal(r.status, 2);
  assert.match(r.stdout, /five-hour usage 97%/);
  assert.equal(readFileSync(log, "utf8"), "probe\n");
  assert.equal(readEvents(dir).filter((e) => e.type === "usage.sample").length, 1);
  // A fresh sample is used as is: no second probe.
  assert.equal(run(["claim", "TASK-1", "--actor", "impl-1"], dir, { FAKE_CLAUDE_LOG: log }).status, 2);
  assert.equal(readFileSync(log, "utf8"), "probe\n");
});

test("claim_refused_while_paused", () => {
  const { dir, run } = setup({ tasks: ready("TASK-1") });
  writeUsage(dir, { fiveHour: 10 });
  assert.equal(run(["pause", "--on", "--reason", "usage", "--actor", "pm"]).status, 0);
  assert.ok(existsSync(join(dir, ".maestro", "runtime", "pause.json")));
  const r = run(["claim", "TASK-1", "--actor", "impl-1"]);
  assert.equal(r.status, 2);
  assert.match(r.stdout, /pause is active.*\(usage\)/);
  assert.match(run(["pause"]).stdout, /paused since/);
  assert.equal(run(["pause", "--off", "--actor", "pm"]).status, 0);
  assert.equal(existsSync(join(dir, ".maestro", "runtime", "pause.json")), false);
  assert.equal(run(["claim", "TASK-1", "--actor", "impl-1"]).status, 0);
  const phases = readEvents(dir).filter((e) => e.type === "session.pause").map((e) => e.data.phase);
  assert.deepEqual(phases, ["start", "off"]);
});

test("reclaim_by_the_holder_is_allowed_above_the_band", () => {
  const { dir, run, edits } = setup({ tasks: { ...ready("TASK-1"), ...ready("TASK-2") } });
  writeUsage(dir, { fiveHour: 40 });
  assert.equal(run(["claim", "TASK-1", "--actor", "impl-1"]).status, 0);
  writeUsage(dir, { fiveHour: 99 });
  const again = run(["claim", "TASK-1", "--actor", "impl-1", "--json"]); // resumed after needs_context
  assert.equal(again.status, 0, again.stdout);
  assert.equal(JSON.parse(again.stdout).held, true);
  assert.equal(edits().length, 1, "no second tracker edit");
  assert.equal(run(["claim", "TASK-1", "--actor", "impl-2"]).status, 2, "another actor is still refused");
  assert.equal(run(["claim", "TASK-2", "--actor", "impl-1"]).status, 2, "a new task is refused");
});

test("usage_check_reports_gate_levels", () => {
  const { dir, run } = setup();
  const check = () => {
    const r = run(["usage", "--check", "--json"]);
    return [r.status, JSON.parse(r.stdout).level];
  };
  writeUsage(dir, { fiveHour: 50 });
  assert.deepEqual(check(), [0, "ok"]);
  writeUsage(dir, { fiveHour: 85 });
  assert.deepEqual(check(), [0, "lower"]);
  writeUsage(dir, { fiveHour: 95 });
  assert.deepEqual(check(), [2, "top"]);
  writeUsage(dir, { fiveHour: 50 });
  run(["pause", "--on"]);
  assert.deepEqual(check(), [2, "paused"]);
  run(["pause", "--off"]);
  rmSync(join(dir, ".maestro", "runtime", "usage.json"));
  assert.deepEqual(check(), [0, "unknown"]);
  assert.match(run(["usage", "--check"]).stdout, /^UNKNOWN: usage unknown/);
});

test("salvage_commits_uncommitted_work_to_wip_task_branch", () => {
  const { dir, git, run } = setup({ tasks: ready("TASK-1.13") });
  const out = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  for (const n of ["impl-1", "impl-2", "impl-3"]) assert.equal(run(["worktree", n, "--goal", "TASK-1"]).status, 0);
  // A Claude Code isolation worktree (not an implementer's): never touched.
  git("worktree", "add", "-q", "-b", "worktree-agent-x", join(dir, ".claude", "worktrees", "agent-x"));
  writeUsage(dir, { fiveHour: 10 });
  assert.equal(run(["claim", "TASK-1.13", "--actor", "impl-1"]).status, 0);
  const wt = (n) => join(dir, ".claude", "worktrees", n);
  writeFileSync(join(wt("impl-1"), "half.txt"), "half done");
  writeFileSync(join(wt("impl-2"), "other.txt"), "no claim");
  writeFileSync(join(wt("agent-x"), "mine.txt"), "someone else's");
  writeFileSync(join(dir, ".maestro", "runtime", "interrupted.json"), JSON.stringify({ since: "t", count: 1 }));
  const mainHead = out(dir, "rev-parse", "HEAD");
  const mainStatus = out(dir, "status", "--porcelain");

  const r = run(["salvage", "--json"]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const results = JSON.parse(r.stdout).results;
  assert.deepEqual(results.map((x) => [x.worktree, x.salvaged]), [["impl-1", true], ["impl-2", true], ["impl-3", false]]);
  // The claimed task names the branch; without a claim the worktree name does.
  assert.equal(out(dir, "show", "wip/TASK-1.13:half.txt"), "half done");
  assert.equal(out(dir, "show", "wip/impl-2:other.txt"), "no claim");
  assert.equal(out(wt("impl-1"), "status", "--porcelain"), "");
  // The main checkout and the foreign worktree are untouched.
  assert.equal(out(dir, "rev-parse", "HEAD"), mainHead);
  assert.equal(out(dir, "status", "--porcelain"), mainStatus);
  assert.match(out(wt("agent-x"), "status", "--porcelain"), /mine\.txt/);
  const ev = readEvents(dir).filter((e) => e.type === "work.salvaged");
  assert.equal(ev.length, 2);
  assert.equal(ev[0].task, "TASK-1.13");
  assert.equal(ev[0].data.branch, "wip/TASK-1.13");
  assert.equal(existsSync(join(dir, ".maestro", "runtime", "interrupted.json")), false, "marker cleared");
  // Run again: nothing left to save.
  assert.ok(JSON.parse(run(["salvage", "--json"]).stdout).results.every((x) => !x.salvaged));
});

test("status_reports_interruption_and_pause", () => {
  const { dir, run } = setup();
  mkdirSync(join(dir, ".maestro", "runtime"), { recursive: true });
  writeFileSync(join(dir, ".maestro", "runtime", "interrupted.json"), JSON.stringify({ since: "2026-11-06T10:00:00Z", count: 2 }));
  run(["pause", "--on", "--reason", "limit"]);
  const text = run(["status"]).stdout;
  assert.match(text, /interrupted by a usage limit/);
  assert.match(text, /maestro salvage/);
  assert.match(text, /PAUSED since/);
  const s = JSON.parse(run(["status", "--json"]).stdout);
  assert.equal(s.interrupted.count, 2);
  assert.equal(s.pause.reason, "limit");
});
