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

test("subagentTranscriptPath follows the session layout", () => {
  const p = subagentTranscriptPath(join("a", "proj", "sess1.jsonl"), "abc");
  assert.equal(p, join("a", "proj", "sess1", "subagents", "agent-abc.jsonl"));
});
