import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { assistant, writeTranscript } from "./fixtures/transcript.mjs";
import { contextUsage, usageSummary, subagentTranscriptPath } from "../scripts/lib/context.mjs";

test("context_uses_last_main_chain_usage", () => {
  const file = writeTranscript([
    assistant("m1", { input: 1, cacheRead: 1, cacheWrite: 1 }),
    assistant("m2", { input: 10, cacheRead: 20, cacheWrite: 30, output: 999 }),
    assistant("m3", { input: 500000 }, { isSidechain: true }),
    assistant("m4", { input: 500000 }, { model: "<synthetic>" }),
  ]);
  const r = contextUsage(file, { window: 1000 });
  assert.equal(r.contextTokens, 60);
  assert.equal(r.percent, 6);
  assert.equal(r.model, "claude-sonnet-5-5");
  assert.equal(r.postCompactNoUsageYet, false);
});

test("context_after_compaction", () => {
  const file = writeTranscript([
    assistant("m1", { input: 100 }),
    { type: "system", subtype: "compact_boundary", compactMetadata: { trigger: "auto", preTokens: 777 } },
    { type: "user", isCompactSummary: true, message: { content: "summary" } },
  ]);
  const r = contextUsage(file, { window: 1000 });
  assert.equal(r.postCompactNoUsageYet, true);
  assert.equal(r.preCompactTokens, 777);
});

test("context reads a transcript larger than one 256 KB chunk backwards", () => {
  const filler = "x".repeat(2000);
  const lines = [assistant("old", { input: 5 })];
  for (let i = 0; i < 200; i++) lines.push({ type: "user", message: { content: filler + "é" } });
  // The only usable assistant line sits > 300 KB from the end.
  const file = writeTranscript(lines);
  const r = contextUsage(file, { window: 100 });
  assert.equal(r.contextTokens, 5);
  const big = writeTranscript([...lines, assistant("new", { input: 40 })], "big.jsonl");
  assert.equal(contextUsage(big, { window: 100 }).contextTokens, 40);
});

test("context returns nulls without any assistant message", () => {
  const file = writeTranscript([{ type: "user", message: { content: "hi" } }]);
  assert.equal(contextUsage(file).contextTokens, null);
});

test("usage_dedupes_streamed_messages", () => {
  const file = writeTranscript([
    assistant("a", { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 }, { timestamp: "2026-11-06T10:00:00.000Z" }),
    assistant("a", { input: 1, output: 9, cacheRead: 3, cacheWrite: 4 }, { timestamp: "2026-11-06T10:00:01.000Z" }),
    assistant("b", { input: 10, output: 20 }, { model: "claude-haiku", timestamp: "2026-11-06T10:00:05.000Z" }),
    assistant("c", { input: 99 }, { model: "<synthetic>" }),
  ]);
  const r = usageSummary(file);
  assert.deepEqual(r.models["claude-sonnet-5-5"], { input: 1, output: 9, cacheRead: 3, cacheWrite: 4 });
  assert.deepEqual(r.models["claude-haiku"], { input: 10, output: 20, cacheRead: 0, cacheWrite: 0 });
  assert.equal(Object.keys(r.models).length, 2);
  assert.equal(r.wallMs, 5000);
});

test("usage_summary_respects_window", () => {
  const at = (ts) => ({ timestamp: ts });
  const file = writeTranscript([
    { type: "user", timestamp: "2026-11-06T09:00:00.000Z", message: { content: "before" } },
    assistant("before", { input: 1000 }, at("2026-11-06T09:59:59.999Z")),
    assistant("a", { input: 1, output: 2 }, at("2026-11-06T10:00:00.000Z")), // from is inclusive
    assistant("a", { input: 1, output: 5 }, at("2026-11-06T10:00:01.000Z")), // streamed repeat: last wins
    assistant("b", { cacheRead: 30 }, { ...at("2026-11-06T10:30:00.000Z"), model: "claude-opus-5-5" }),
    assistant("end", { input: 2000 }, at("2026-11-06T11:00:00.000Z")), // to is exclusive
    { type: "user", timestamp: "2026-11-06T12:00:00.000Z", message: { content: "after" } },
  ]);
  const r = usageSummary(file, { from: "2026-11-06T10:00:00.000Z", to: "2026-11-06T11:00:00.000Z" });
  assert.deepEqual(r.models, {
    "claude-sonnet-5-5": { input: 1, output: 5, cacheRead: 0, cacheWrite: 0 },
    "claude-opus-5-5": { input: 0, output: 0, cacheRead: 30, cacheWrite: 0 },
  });
  assert.equal(r.wallMs, 30 * 60 * 1000); // span of the included messages only
  // Milliseconds work too, and an open end keeps everything after `from`.
  const open = usageSummary(file, { from: Date.parse("2026-11-06T10:30:00.000Z") });
  assert.deepEqual(Object.keys(open.models).sort(), ["claude-opus-5-5", "claude-sonnet-5-5"]);
  assert.equal(open.models["claude-sonnet-5-5"].input, 2000);
  // Empty window: no models, no wall time.
  assert.deepEqual(usageSummary(file, { from: "2026-11-07T00:00:00Z", to: "2026-11-08T00:00:00Z" }), { models: {}, wallMs: 0 });
  // Without options the behaviour is unchanged: every message, wall time over every line.
  const all = usageSummary(file);
  assert.equal(all.models["claude-sonnet-5-5"].input, 3001);
  assert.equal(all.wallMs, 3 * 60 * 60 * 1000);
});

test("subagentTranscriptPath follows the session layout", () => {
  const p = subagentTranscriptPath(join("a", "proj", "sess1.jsonl"), "abc");
  assert.equal(p, join("a", "proj", "sess1", "subagents", "agent-abc.jsonl"));
});
