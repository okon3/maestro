import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, findProjectRoot, DEFAULTS } from "../scripts/lib/config.mjs";
import { appendEvent, readEvents, makeEvent } from "../scripts/lib/events.mjs";

function tempRepo() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "maestro-test-")));
  const git = (...args) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  git("init", "-q", "-b", "master");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init");
  return { dir, git };
}

const norm = (p) => p.replace(/\\/g, "/").toLowerCase();

test("loadConfig returns defaults when the project is not initialized", () => {
  const { dir } = tempRepo();
  const { root, config, initialized } = loadConfig(dir);
  assert.equal(norm(root), norm(dir));
  assert.equal(initialized, false);
  assert.deepEqual(config, { ...DEFAULTS });
});

test("loadConfig merges the project file over defaults, BOM tolerated", () => {
  const { dir } = tempRepo();
  mkdirSync(join(dir, ".maestro"));
  writeFileSync(join(dir, ".maestro", "config.json"), "﻿" + JSON.stringify({ mainBranch: "main" }));
  const { config, initialized } = loadConfig(dir);
  assert.equal(initialized, true);
  assert.equal(config.mainBranch, "main");
  assert.equal(config.contextWindow, DEFAULTS.contextWindow);
});

test("config_framework_feedback_defaults_to_false", () => {
  assert.equal(DEFAULTS.frameworkFeedback, false);
  const { dir } = tempRepo();
  assert.equal(loadConfig(dir).config.frameworkFeedback, false, "not initialized");
  mkdirSync(join(dir, ".maestro"));
  const file = join(dir, ".maestro", "config.json");
  writeFileSync(file, JSON.stringify({ mainBranch: "main" }));
  assert.equal(loadConfig(dir).config.frameworkFeedback, false, "config without the key");
  writeFileSync(file, JSON.stringify({ frameworkFeedback: true }));
  assert.equal(loadConfig(dir).config.frameworkFeedback, true, "opt-in honoured");
});

test("loadConfig rejects a non-object config", () => {
  const { dir } = tempRepo();
  mkdirSync(join(dir, ".maestro"));
  writeFileSync(join(dir, ".maestro", "config.json"), "[1]");
  assert.throws(() => loadConfig(dir), /JSON object/);
});

test("findProjectRoot resolves the main checkout from a linked worktree", () => {
  const { dir, git } = tempRepo();
  const wt = join(dir, ".claude", "worktrees", "impl-1");
  git("worktree", "add", "-q", "-b", "impl-1", wt);
  assert.equal(norm(findProjectRoot(wt)), norm(dir));
});

test("findProjectRoot returns null outside git", () => {
  // The temp dir may itself live inside a repository (e.g. a versioned home folder): stop discovery there.
  const dir = mkdtempSync(join(tmpdir(), "maestro-nogit-"));
  const saved = process.env.GIT_CEILING_DIRECTORIES;
  process.env.GIT_CEILING_DIRECTORIES = realpathSync(tmpdir());
  try {
    assert.equal(findProjectRoot(dir), null);
  } finally {
    if (saved === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
    else process.env.GIT_CEILING_DIRECTORIES = saved;
  }
});

test("appendEvent writes one JSON line per event and readEvents skips torn lines", () => {
  const { dir } = tempRepo();
  appendEvent(dir, "task.claim", { actor: "impl-1", task: "TASK-3.2", data: {} });
  appendEvent(dir, "agent.stop", { agentId: "abc", goal: "", data: { usage: {} } });
  const file = join(dir, ".maestro", "events.jsonl");
  writeFileSync(file, readFileSync(file, "utf8") + "{torn\n");
  const events = readEvents(dir);
  assert.equal(events.length, 2);
  assert.equal(events[0].type, "task.claim");
  assert.equal(events[0].actor, "impl-1");
  assert.ok(!("goal" in events[1]), "empty optional fields are omitted");
});

test("makeEvent requires a type and stamps ISO UTC time", () => {
  assert.throws(() => makeEvent(""), /type is required/);
  const e = makeEvent("x", {}, new Date("2026-11-06T10:00:00Z"));
  assert.equal(e.ts, "2026-11-06T10:00:00.000Z");
});
