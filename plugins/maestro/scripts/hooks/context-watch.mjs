// UserPromptSubmit / PostToolUse: warn once per context band in the main session.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { contextUsage } from "../lib/context.mjs";
import { appendEvent } from "../lib/events.mjs";
import { additionalContext, runHook } from "./_run.mjs";

const ACTIONS = {
  50: "do not start a new GOAL; finish or checkpoint the current step.",
  65: "rewrite .maestro/handoff.md now (state, running agent ids, open decisions, next action) and commit it.",
  80: "tell the owner; keep the handoff current, compaction will re-inject it.",
};

function readState(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function writeState(root, state) {
  const dir = join(root, ".maestro", "runtime");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "context-bands.json"), JSON.stringify(state));
}

// Snapshot for the dashboard (contract: docs/dashboard-contract.md, Runtime). Written on every main-session run.
function writeContextSnapshot(root, sessionId, percent, usage) {
  const dir = join(root, ".maestro", "runtime");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "context.json");
  const tmp = `${file}.${process.pid}.tmp`;
  const snapshot = {
    ts: new Date().toISOString(),
    sessionId: sessionId || null,
    percent,
    contextTokens: usage.postCompactNoUsageYet ? 0 : usage.contextTokens,
    window: usage.window,
  };
  writeFileSync(tmp, JSON.stringify(snapshot));
  renameSync(tmp, file);
}

// Main-session transcripts, so the dashboard can cost the PM inside each GOAL window
// (contract: docs/dashboard-contract.md, Runtime). One small file: add or update this session's entry.
function recordPmSession(root, sessionId, transcriptPath) {
  const dir = join(root, ".maestro", "runtime");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "pm-sessions.json");
  const data = readState(file);
  const sessions = Array.isArray(data.sessions) ? data.sessions : [];
  const now = new Date().toISOString();
  const id = sessionId || null;
  const entry = sessions.find((s) => (id ? s.sessionId === id : s.transcriptPath === transcriptPath));
  if (entry) {
    entry.transcriptPath = transcriptPath;
    entry.lastSeen = now;
  } else sessions.push({ sessionId: id, transcriptPath, firstSeen: now, lastSeen: now });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ sessions }));
  renameSync(tmp, file);
}

await runHook("context-watch", ({ input, root, config }) => {
  if (input.agent_id) return; // transcript_path in subagent hooks is the PM transcript
  if (!input.transcript_path || !existsSync(input.transcript_path)) return;
  recordPmSession(root, input.session_id, input.transcript_path);
  const bands = [...config.contextBands].sort((a, b) => a - b);
  const usage = contextUsage(input.transcript_path, { window: config.contextWindow });
  // After a compaction with no new message yet the old usage is stale: treat as empty.
  const percent = usage.postCompactNoUsageYet ? 0 : usage.percent;
  if (percent === null) return;
  writeContextSnapshot(root, input.session_id, percent, usage);

  const state = readState(join(root, ".maestro", "runtime", "context-bands.json"));
  const sid = input.session_id || "unknown";
  const warned = state[sid] || 0;
  const band = bands.filter((b) => b <= percent).pop() || 0;

  if (band === 0) {
    if (sid in state) {
      delete state[sid];
      writeState(root, state);
    }
    return;
  }
  if (band <= warned) return;

  state[sid] = band;
  writeState(root, state);
  appendEvent(root, "context.band", { actor: "hook", data: { percent, band } });
  const action = ACTIONS[band] || "keep the handoff current.";
  const text = `MAESTRO CONTEXT WARNING: the context window is ${percent}% full (band ${band}%). Action: ${action}`;
  return additionalContext(input.hook_event_name || "UserPromptSubmit", text);
});
