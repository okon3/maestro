// Implementer reports saved from subagent transcripts (contract: docs/plugin-contracts.md sections 2 and 6).
// Used by `maestro measure`: the architect no longer copies reports by hand.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const STATE_LINE = /^[ \t]*\**STATE:/m;

/**
 * The agent's final report from its transcript JSONL: the last assistant text (text blocks of one message joined,
 * or the `message` of a SubagentHandback tool call) that has a line starting with `STATE:`, from that line on,
 * without a closing code fence. Without any `STATE:` line, the last assistant text (`hasState: false`).
 * Returns `{text, hasState}` or null when the transcript is missing or has no assistant text.
 */
export function finalReport(transcriptPath) {
  if (!existsSync(transcriptPath)) return null;
  const candidates = []; // {id, text}
  for (const line of readFileSync(transcriptPath, "utf8").split("\n")) {
    if (!line.includes('"assistant"')) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue; // torn or partial line
    }
    if (e?.type !== "assistant" || !Array.isArray(e.message?.content)) continue;
    const id = e.message.id ?? null;
    for (const block of e.message.content) {
      let text = null;
      if (block?.type === "text" && typeof block.text === "string") text = block.text;
      else if (block?.type === "tool_use" && block.name === "SubagentHandback" && typeof block.input?.message === "string") {
        text = block.input.message;
      }
      if (!text || !text.trim()) continue;
      const last = candidates.at(-1);
      // Streamed messages split one answer into several lines that share the message id.
      if (last && id && last.id === id && block.type === "text" && last.kind === "text") last.text += `\n${text}`;
      else candidates.push({ id, kind: block.type, text });
    }
  }
  if (!candidates.length) return null;
  const withState = [...candidates].reverse().find((c) => STATE_LINE.test(c.text));
  if (!withState) return { text: candidates.at(-1).text.trim(), hasState: false };
  const text = withState.text.slice(withState.text.search(STATE_LINE)).replace(/\n[ \t]*```[ \t]*\s*$/, "").trim();
  return { text, hasState: true };
}

/** "1h 02m", "12m 03s", "45s" (wall time of a report header). */
export function formatDuration(ms) {
  const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, "0");
  if (h) return `${h}h ${pad(m)}m`;
  if (m) return `${m}m ${pad(s % 60)}s`;
  return `${s}s`;
}

export const taskReportPath = (root, task) => join(root, ".maestro", "reports", "task", `${task}.md`);

/** The metadata line of a report or of a rework round. */
function metaLine({ task, batch, agentIds, models, wallMs, date }) {
  const parts = [`Task: ${task}`];
  if (batch?.length > 1) parts.push(`Batch: ${batch.join(", ")} (one implementer, one shared report and measure)`);
  parts.push(`Agents: ${agentIds.join(", ")}`, `Model: ${models.length ? models.join(", ") : "unknown"}`, `Wall time: ${formatDuration(wallMs)}`, `Date: ${date}`);
  return parts.join("   ");
}

/**
 * Write `.maestro/reports/task/<task>.md`. `reports` is one `{agentId, text}` per agent with a report, in the
 * order the agents worked. A new file holds a heading (`# <task> <title>`), a metadata line, then the first report, then one "Round" section per further
 * agent. An existing file is overwritten only with `force`; otherwise the reports go in as a new round, unless the
 * file already holds them (the same report measured again: unchanged).
 * Returns `{path, action: "created" | "appended" | "overwritten" | "unchanged"}`.
 */
export function writeTaskReport(root, { task, title, batch, agentIds, models, wallMs, reports, force = false, now = new Date() }) {
  const path = taskReportPath(root, task);
  const date = now.toISOString().slice(0, 10);
  const meta = metaLine({ task, batch, agentIds, models, wallMs, date });
  const exists = existsSync(path);
  const current = exists ? readFileSync(path, "utf8") : "";
  if (exists && !force && reports.every((r) => current.includes(r.text))) return { path, action: "unchanged" };
  // Several agents on one task (a fresh implementer for a correction): one "Round" section each after the first.
  const body = (next) => reports.map((r, i) => (i === 0 ? `${r.text}\n` : `\n## Round ${next + i - 1} (agent ${r.agentId})\n\n${r.text}\n`)).join("");
  let text;
  if (exists && !force) {
    // A rework round measured later (for example a defect fix on the same task): never overwrite, append.
    const n = (current.match(/^## Round \d+/gm) ?? []).length + 2;
    text = `${current.replace(/\s*$/, "")}\n\n## Round ${n} (${date})\n\n${meta}\n\n${body(n + 1)}`;
  } else {
    // The dashboard lists reports by their first line: the task title when known.
    text = `# ${task} ${title || "implementer report"}\n\n${meta}\n\n${body(2)}`;
  }
  mkdirSync(join(root, ".maestro", "reports", "task"), { recursive: true });
  writeFileSync(path, text, "utf8");
  return { path, action: exists ? (force ? "overwritten" : "appended") : "created" };
}
