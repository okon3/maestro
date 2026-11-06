// Stand-in for lib/context.mjs: a transcript is a JSON file {"models":{...},"wallMs":N}.
import { readFileSync } from "node:fs";
import { dirname, basename, join } from "node:path";

export function usageSummary(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
export function contextUsage() {
  return { model: "stub", contextTokens: 1, window: 2, percent: 50 };
}
export function subagentTranscriptPath(session, agentId) {
  return join(dirname(session), basename(session, ".jsonl"), "subagents", `agent-${agentId}.jsonl`);
}
