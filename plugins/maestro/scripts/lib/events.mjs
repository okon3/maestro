// Append-only event log (contract: docs/plugin-contracts.md section 4).
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const EVENTS_PATH = join(".maestro", "events.jsonl");

const OPTIONAL_KEYS = ["actor", "agentId", "goal", "task", "data"];

/**
 * Every event type the plugin, its skills and its agents write (docs/plugin-contracts.md section 4).
 * `maestro event` warns on stderr for any other type but still logs it.
 */
export const KNOWN_EVENT_TYPES = new Set([
  // tracker and claims
  "task.status",
  "task.claim",
  "task.claim_denied",
  "task.release",
  "task.measure",
  // agents and session
  "agent.start",
  "agent.stop",
  "agent.bind",
  "agent.launch_denied",
  "session.compact",
  "session.pause",
  "session.resume",
  "context.band",
  "usage.sample",
  "limit.hit",
  "work.salvaged",
  // GOAL lifecycle
  "maestro.init",
  "goal.approved",
  "goal.start",
  "goal.done",
  "fastlane.start",
  // quality
  "qa.start",
  "qa.freeze",
  "qa.done",
  "review.start",
  "review.done",
  // decisions and learnings
  "decision.recorded",
  "decision.ruling",
  "learning.proposed",
]);

/** Build a normalized event object; `type` is required. */
export function makeEvent(type, fields = {}, now = new Date()) {
  if (typeof type !== "string" || !type) throw new Error("event type is required");
  const event = { ts: now.toISOString(), type };
  for (const key of OPTIONAL_KEYS) {
    if (fields[key] !== undefined && fields[key] !== null && fields[key] !== "") event[key] = fields[key];
  }
  return event;
}

/** Append one event as a single JSON line to `<root>/.maestro/events.jsonl`. Returns the event. */
export function appendEvent(root, type, fields = {}) {
  const event = makeEvent(type, fields);
  const file = join(root, EVENTS_PATH);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(event) + "\n", "utf8");
  return event;
}

/** Read all events; malformed lines are skipped. */
export function readEvents(root) {
  const file = join(root, EVENTS_PATH);
  if (!existsSync(file)) return [];
  const events = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // A torn or hand-edited line must not break readers.
    }
  }
  return events;
}
