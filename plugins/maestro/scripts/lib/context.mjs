// Context usage and token usage from a Claude Code transcript JSONL
// (contract: docs/plugin-contracts.md sections 5 and "Module API").
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import { basename, dirname, join } from "node:path";

const CHUNK = 256 * 1024;
const NL = 0x0a;

function parse(line) {
  if (!line || !line.trim()) return null;
  try {
    return JSON.parse(line);
  } catch {
    return null; // torn or partial line
  }
}

/** Yield transcript lines from last to first, reading the file backwards in 256 KB chunks. */
function* linesBackwards(path) {
  const fd = openSync(path, "r");
  try {
    let pos = fstatSync(fd).size;
    let carry = Buffer.alloc(0); // bytes of a line whose start is not read yet
    while (pos > 0) {
      const len = Math.min(CHUNK, pos);
      pos -= len;
      const buf = Buffer.alloc(len);
      readSync(fd, buf, 0, len, pos);
      const data = Buffer.concat([buf, carry]);
      let end = data.length;
      // The text before the first newline may be a partial line: keep it for the next chunk.
      for (let i = data.lastIndexOf(NL, end - 1); i >= 0; i = i === 0 ? -1 : data.lastIndexOf(NL, i - 1)) {
        yield data.subarray(i + 1, end).toString("utf8");
        end = i;
      }
      carry = data.subarray(0, end);
    }
    if (carry.length) yield carry.toString("utf8");
  } finally {
    closeSync(fd);
  }
}

/** Yield transcript lines first to last without loading the whole file. */
function* linesForwards(path) {
  const fd = openSync(path, "r");
  try {
    const decoder = new StringDecoder("utf8");
    const buf = Buffer.alloc(CHUNK);
    let rest = "";
    for (;;) {
      const n = readSync(fd, buf, 0, CHUNK, null);
      if (n === 0) break;
      const parts = (rest + decoder.write(buf.subarray(0, n))).split("\n");
      rest = parts.pop();
      yield* parts;
    }
    rest += decoder.end();
    if (rest) yield rest;
  } finally {
    closeSync(fd);
  }
}

const isMainAssistant = (e) =>
  e && e.type === "assistant" && !e.isSidechain && e.message?.usage && e.message.model !== "<synthetic>";

/**
 * Context size of the last main-chain assistant message: input + cache_read + cache_creation.
 * contextTokens and percent are null when the transcript has no usable assistant message.
 */
export function contextUsage(transcriptPath, { window = 1000000 } = {}) {
  const result = {
    model: null,
    contextTokens: null,
    window,
    percent: null,
    postCompactNoUsageYet: false,
    preCompactTokens: null,
  };
  for (const line of linesBackwards(transcriptPath)) {
    const e = parse(line);
    if (!e) continue;
    if (e.type === "system" && e.subtype === "compact_boundary") {
      result.postCompactNoUsageYet = true;
      result.preCompactTokens = e.compactMetadata?.preTokens ?? null;
      return result;
    }
    if (isMainAssistant(e)) {
      const u = e.message.usage;
      result.model = e.message.model ?? null;
      result.contextTokens =
        (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      result.percent = Math.round((result.contextTokens / window) * 10000) / 100;
      return result;
    }
  }
  return result;
}

/** Token usage per model plus wall time, deduplicated by message id (section 5). */
export function usageSummary(transcriptPath) {
  const byId = new Map(); // last occurrence wins: streamed messages repeat their usage
  let anon = 0;
  let first = null;
  let last = null;
  for (const line of linesForwards(transcriptPath)) {
    const e = parse(line);
    if (!e) continue;
    const t = Date.parse(e.timestamp);
    if (!Number.isNaN(t)) {
      if (first === null || t < first) first = t;
      if (last === null || t > last) last = t;
    }
    if (e.type !== "assistant" || !e.message?.usage) continue;
    const model = e.message.model;
    if (!model || model === "<synthetic>") continue;
    byId.set(e.message.id ?? `anon-${anon++}`, { model, usage: e.message.usage });
  }
  const models = {};
  for (const { model, usage } of byId.values()) {
    const m = (models[model] ??= { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    m.input += usage.input_tokens || 0;
    m.output += usage.output_tokens || 0;
    m.cacheRead += usage.cache_read_input_tokens || 0;
    m.cacheWrite += usage.cache_creation_input_tokens || 0;
  }
  return { models, wallMs: first === null ? 0 : last - first };
}

/** `<dir>/<sessionId>/subagents/agent-<agentId>.jsonl` for a session transcript `<dir>/<sessionId>.jsonl`. */
export function subagentTranscriptPath(sessionTranscriptPath, agentId) {
  const sessionId = basename(sessionTranscriptPath).replace(/\.jsonl$/, "");
  return join(dirname(sessionTranscriptPath), sessionId, "subagents", `agent-${agentId}.jsonl`);
}
