import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readEvents } from "../scripts/lib/events.mjs";
import { assistant, writeTranscript } from "./fixtures/transcript.mjs";

const HOOKS = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "hooks");

function tempRepo({ init = true, config = {} } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "maestro-hook-")));
  const git = (...args) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  git("init", "-q", "-b", "master");
  if (init) {
    mkdirSync(join(dir, ".maestro"));
    writeFileSync(join(dir, ".maestro", "config.json"), JSON.stringify(config));
  }
  return dir;
}

function run(script, input) {
  const r = spawnSync("node", [join(HOOKS, `${script}.mjs`)], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, GIT_CEILING_DIRECTORIES: tmpdir() },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const types = (dir) => readEvents(dir).map((e) => e.type);

test("context_warning_once_per_band", () => {
  const dir = tempRepo({ config: { contextWindow: 1000 } });
  const at = (tokens) => writeTranscript([assistant("m" + tokens, { input: tokens })]);
  const base = { cwd: dir, session_id: "s1", hook_event_name: "UserPromptSubmit" };

  assert.equal(run("context-watch", { ...base, transcript_path: at(300) }).stdout, "");

  const first = run("context-watch", { ...base, transcript_path: at(520) });
  assert.equal(first.status, 0);
  const out = JSON.parse(first.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(out.hookSpecificOutput.additionalContext, /52%/);
  assert.match(out.hookSpecificOutput.additionalContext, /do not start a new GOAL/);

  assert.equal(run("context-watch", { ...base, transcript_path: at(560) }).stdout, "");

  // Higher band warns again, on PostToolUse too.
  const second = run("context-watch", { ...base, hook_event_name: "PostToolUse", transcript_path: at(660) });
  assert.match(JSON.parse(second.stdout).hookSpecificOutput.additionalContext, /handoff\.md now/);

  // Inside a subagent: silent.
  assert.equal(run("context-watch", { ...base, agent_id: "ag1", transcript_path: at(900) }).stdout, "");

  assert.deepEqual(readEvents(dir).filter((e) => e.type === "context.band").map((e) => e.data.band), [50, 65]);

  // Dropping below the lowest band (compaction) resets the state: warns again on the way up.
  assert.equal(run("context-watch", { ...base, transcript_path: at(100) }).stdout, "");
  assert.match(run("context-watch", { ...base, transcript_path: at(510) }).stdout, /MAESTRO CONTEXT WARNING/);
});

test("session_start_reinjects_handoff", () => {
  const dir = tempRepo();
  writeFileSync(join(dir, ".maestro", "handoff.md"), "A".repeat(20000));
  const r = run("session-start", { cwd: dir, source: "compact" });
  assert.equal(r.status, 0);
  const ctx = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(ctx.hookEventName, "SessionStart");
  assert.match(ctx.additionalContext, /maestro:pm/);
  assert.match(ctx.additionalContext, /truncated/);
  assert.ok(ctx.additionalContext.includes("A".repeat(9000)));
  assert.ok(!ctx.additionalContext.includes("A".repeat(9001)));
  const ev = readEvents(dir).find((e) => e.type === "session.compact");
  assert.deepEqual(ev.data, { trigger: "compact", phase: "reinject" });

  const start = run("session-start", { cwd: dir, source: "startup" });
  const text = JSON.parse(start.stdout).hookSpecificOutput.additionalContext;
  assert.match(text, /handoff\.md/);
  assert.ok(!text.includes("AAAA"));
});

test("pre-compact prints preservation instructions and logs", () => {
  const dir = tempRepo();
  const r = run("pre-compact", { cwd: dir, trigger: "auto" });
  assert.match(r.stdout, /running agents/);
  assert.deepEqual(readEvents(dir)[0].data, { trigger: "auto", phase: "pre" });
});

test("hooks_noop_without_config", () => {
  const dir = tempRepo({ init: false });
  const transcript = writeTranscript([assistant("m", { input: 900 })]);
  for (const [script, extra] of [
    ["session-start", { source: "compact" }],
    ["context-watch", { transcript_path: transcript, session_id: "s" }],
    ["pre-compact", { trigger: "manual" }],
    ["agent-events", { hook_event_name: "SubagentStart", agent_id: "a", agent_type: "x" }],
    ["stop-failure", { error: "rate_limit" }],
    ["secret-guard", { agent_id: "a", tool_name: "Read", tool_input: { file_path: ".env" } }],
  ]) {
    const r = run(script, { cwd: dir, ...extra });
    assert.equal(r.status, 0, script);
    assert.equal(r.stdout, "", script);
  }
  assert.equal(existsSync(join(dir, ".maestro")), false);
});

test("subagent_stop_logs_usage", () => {
  const dir = tempRepo();
  const transcript = writeTranscript([
    assistant("a", { input: 4, output: 5, cacheRead: 6, cacheWrite: 7 }),
    assistant("a", { input: 4, output: 5, cacheRead: 6, cacheWrite: 7 }),
  ]);
  run("agent-events", { cwd: dir, hook_event_name: "SubagentStart", agent_id: "ag1", agent_type: "implementer" });
  const r = run("agent-events", {
    cwd: dir,
    hook_event_name: "SubagentStop",
    agent_id: "ag1",
    agent_type: "implementer",
    agent_transcript_path: transcript,
  });
  assert.equal(r.status, 0);
  const [start, stop] = readEvents(dir);
  assert.equal(start.type, "agent.start");
  assert.equal(start.data.agentType, "implementer");
  assert.equal(stop.type, "agent.stop");
  assert.equal(stop.agentId, "ag1");
  assert.deepEqual(stop.data.usage.models["claude-sonnet-5-5"], { input: 4, output: 5, cacheRead: 6, cacheWrite: 7 });
  assert.equal(stop.data.internal, undefined);

  run("agent-events", { cwd: dir, hook_event_name: "SubagentStop", agent_id: "c1", agent_type: "" });
  assert.equal(readEvents(dir).at(-1).data.internal, true);
});

test("stop-failure logs limit.hit", () => {
  const dir = tempRepo();
  run("stop-failure", { cwd: dir, error: "rate_limit" });
  const ev = readEvents(dir)[0];
  assert.equal(ev.type, "limit.hit");
  assert.deepEqual(ev.data, { error: "rate_limit" });
});

const guard = (dir, tool_name, tool_input, extra = { agent_id: "ag1", agent_type: "maestro:implementer" }) =>
  run("secret-guard", { cwd: dir, hook_event_name: "PreToolUse", tool_name, tool_input, ...extra });

const denied = (r) => {
  assert.equal(r.status, 0);
  if (!r.stdout) return false;
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, "PreToolUse");
  assert.match(out.permissionDecisionReason, /secret guard/);
  return out.permissionDecision === "deny";
};

test("secret_guard_blocks_subagent_reads", () => {
  const dir = tempRepo({ config: { secretPaths: ["config/credentials.yml", "secrets/**"] } });
  for (const [tool, input] of [
    ["Read", { file_path: join(dir, ".env") }],
    ["Read", { file_path: "C:\\work\\app\\.env.local" }],
    ["Edit", { file_path: "certs/server.pem" }],
    ["Write", { file_path: "tls/server.key" }],
    ["Read", { file_path: "/home/u/.ssh/id_rsa" }],
    ["Read", { file_path: "/home/u/.ssh/id_ed25519.pub" }],
    ["Read", { file_path: join(dir, ".claude", "worktrees", "impl-1", "config", "credentials.yml") }],
    ["Read", { file_path: "secrets/prod/db.json" }],
    ["Grep", { pattern: "PASSWORD", path: ".env.production" }],
    ["Grep", { pattern: "PASSWORD", glob: "*.pem" }],
    ["Glob", { pattern: "secrets/*" }],
    ["Bash", { command: "cat .env | grep KEY" }],
    ["Bash", { command: "node -e \"require('fs').readFileSync('config/credentials.yml')\"" }],
    ["PowerShell", { command: "Get-Content -Path .\\.env.local" }],
  ]) {
    assert.equal(denied(guard(dir, tool, input)), true, `${tool} ${JSON.stringify(input)}`);
  }
});

test("secret_guard_allows_main_session_and_env_example", () => {
  const dir = tempRepo({ config: { secretPaths: ["secrets/**"] } });
  // Main session (no agent_id): never blocked.
  assert.equal(denied(guard(dir, "Read", { file_path: ".env" }, {})), false);
  assert.equal(denied(guard(dir, "Bash", { command: "cat secrets/a.txt" }, {})), false);
  // Subagent: templates and ordinary files pass.
  for (const [tool, input] of [
    ["Read", { file_path: ".env.example" }],
    ["Bash", { command: "cat .env.example && echo $NODE_ENV" }],
    ["Read", { file_path: "src/config/env.ts" }],
    ["Grep", { pattern: "\\.env|process\\.env", path: "src" }],
    ["Glob", { pattern: "**/*.ts" }],
    ["Bash", { command: "npm test" }],
  ]) {
    assert.equal(denied(guard(dir, tool, input)), false, `${tool} ${JSON.stringify(input)}`);
  }
  // Without Maestro the hook is a no-op even for subagents.
  assert.equal(denied(guard(tempRepo({ init: false }), "Read", { file_path: ".env" })), false);
});

test("hooks_never_throw", () => {
  // Invalid config (contextBands not an array) makes the handler throw.
  const dir = tempRepo({ config: { contextBands: 5 } });
  const r = run("context-watch", { cwd: dir, session_id: "s", transcript_path: writeTranscript([assistant("m", { input: 1 })]) });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
  assert.match(readFileSync(join(dir, ".maestro", "runtime", "hook-errors.log"), "utf8"), /context-watch/);

  // Invalid stdin JSON also exits 0.
  const bad = spawnSync("node", [join(HOOKS, "stop-failure.mjs")], { input: "{not json", encoding: "utf8" });
  assert.equal(bad.status, 0);
  assert.deepEqual(types(dir), []);
});

test("context_hook_writes_runtime", () => {
  const dir = tempRepo({ config: { contextWindow: 1000 } });
  const file = join(dir, ".maestro", "runtime", "context.json");
  const at = (tokens) => writeTranscript([assistant("m" + tokens, { input: tokens })]);
  const base = { cwd: dir, session_id: "s7", hook_event_name: "UserPromptSubmit" };

  // Below every band: no warning, but the snapshot is written.
  assert.equal(run("context-watch", { ...base, transcript_path: at(300) }).stdout, "");
  const first = JSON.parse(readFileSync(file, "utf8"));
  assert.deepEqual({ sessionId: first.sessionId, percent: first.percent, contextTokens: first.contextTokens, window: first.window }, { sessionId: "s7", percent: 30, contextTokens: 300, window: 1000 });
  assert.ok(Math.abs(Date.now() - Date.parse(first.ts)) < 60000);

  // Every run refreshes it, also inside a band that already warned.
  run("context-watch", { ...base, transcript_path: at(520) });
  assert.equal(JSON.parse(readFileSync(file, "utf8")).percent, 52);
  run("context-watch", { ...base, transcript_path: at(560) });
  assert.equal(JSON.parse(readFileSync(file, "utf8")).percent, 56);

  // Subagents never write it: their transcript_path is the PM transcript.
  run("context-watch", { ...base, agent_id: "ag1", transcript_path: at(900) });
  assert.equal(JSON.parse(readFileSync(file, "utf8")).percent, 56);
});

test("context_hook_records_pm_sessions", () => {
  const dir = tempRepo({ config: { contextWindow: 1000 } });
  const file = join(dir, ".maestro", "runtime", "pm-sessions.json");
  const read = () => JSON.parse(readFileSync(file, "utf8")).sessions;
  const t1 = writeTranscript([assistant("m1", { input: 10 })]);
  const t2 = writeTranscript([assistant("m2", { input: 20 })]);
  const base = { cwd: dir, hook_event_name: "UserPromptSubmit" };

  run("context-watch", { ...base, session_id: "s1", transcript_path: t1 });
  const [first] = read();
  assert.deepEqual([first.sessionId, first.transcriptPath], ["s1", t1]);
  assert.ok(Math.abs(Date.now() - Date.parse(first.firstSeen)) < 60000);
  assert.equal(first.lastSeen, first.firstSeen);

  // The same session is updated in place, not duplicated; a new session adds an entry.
  run("context-watch", { ...base, hook_event_name: "PostToolUse", session_id: "s1", transcript_path: t1 });
  run("context-watch", { ...base, session_id: "s2", transcript_path: t2 });
  const sessions = read();
  assert.deepEqual(sessions.map((s) => [s.sessionId, s.transcriptPath]), [["s1", t1], ["s2", t2]]);
  assert.equal(sessions[0].firstSeen, first.firstSeen);
  assert.ok(sessions[0].lastSeen >= first.lastSeen);

  // Subagent runs and missing transcripts are not PM sessions.
  run("context-watch", { ...base, session_id: "s3", agent_id: "ag1", transcript_path: t1 });
  run("context-watch", { ...base, session_id: "s4", transcript_path: join(dir, "missing.jsonl") });
  assert.deepEqual(read().map((s) => s.sessionId), ["s1", "s2"]);
  // Atomic write: no temp file left behind.
  assert.deepEqual(readdirSync(join(dir, ".maestro", "runtime")).filter((f) => f.endsWith(".tmp")), []);
});

test("claim_command_binds_agent_id", () => {
  const dir = tempRepo();
  guard(dir, "Bash", { command: "maestro claim task-1.2 --actor impl-2" });
  guard(dir, "PowerShell", { command: 'node "C:/x/scripts/cli.mjs" claim TASK-1.1 --actor impl-1' }, { agent_id: "ag2" });
  guard(dir, "Bash", { command: "maestro claim TASK-1.3 --actor impl-1" }, {}); // main session: no binding
  const binds = readEvents(dir).filter((e) => e.type === "agent.bind").map((e) => [e.agentId, e.actor, e.task]);
  assert.deepEqual(binds, [["ag1", "impl-2", "TASK-1.2"], ["ag2", "impl-1", "TASK-1.1"]]);
});
