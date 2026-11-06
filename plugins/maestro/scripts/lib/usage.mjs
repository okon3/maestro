// Usage gate, pause flag and interruption marker (contract: docs/plugin-contracts.md sections 2, 6 and 7).
// Shared by the CLI (`claim`, `usage`, `pause`, `salvage`, `status`) and the hooks. No git here: hooks import it.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runTool } from "./backlog.mjs";
import { DEFAULTS } from "./config.mjs";
import { appendEvent } from "./events.mjs";

/** A runtime sample younger than this is used as is; an older one is refreshed with a probe. */
export const USAGE_FRESH_MS = 5 * 60 * 1000;

const runtime = (root, name) => join(root, ".maestro", "runtime", name);
export const usageFile = (root) => runtime(root, "usage.json");
export const pauseFile = (root) => runtime(root, "pause.json");
export const interruptedFile = (root) => runtime(root, "interrupted.json");

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, file);
}

/** `{lower, top}` from config `usageBands` (sorted; the top band is the last). Invalid values fall back to the defaults. */
export function usageBands(config = {}) {
  const raw = Array.isArray(config.usageBands) ? config.usageBands.filter((n) => typeof n === "number" && n > 0) : [];
  const bands = (raw.length ? raw : DEFAULTS.usageBands).slice().sort((a, b) => a - b);
  return { lower: bands[0], top: bands[bands.length - 1] };
}

/** Reset time as text: `resetsAt` is Unix seconds in the probe output (milliseconds or ISO also accepted). */
export function formatReset(value) {
  if (value === null || value === undefined || value === "") return "unknown";
  const n = Number(value);
  if (Number.isFinite(n)) return new Date(n < 1e12 ? n * 1000 : n).toISOString();
  return String(value);
}

const resetMs = (value) => {
  const n = Number(value);
  if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
};

export function readUsageSample(root) {
  const s = readJson(usageFile(root));
  return s && typeof s === "object" && !Array.isArray(s) ? s : null;
}

/**
 * Runs a tiny `claude -p` call (stdin ignored) and reads its rate_limit_event lines. Percentages are 0-100.
 * Throws when claude cannot run or prints no rate_limit_event.
 */
export function probeUsage(root, { timeout = 120000 } = {}) {
  const args = ["-p", "Reply OK", "--output-format", "stream-json", "--verbose", "--model", "haiku", "--no-session-persistence"];
  const r = runTool("claude", args, { cwd: root, timeout });
  if (r.error) throw new Error(`cannot run claude: ${r.error.message}`);
  const windows = {};
  for (const line of r.stdout.split("\n")) {
    if (!line.includes("rate_limit_event")) continue;
    try {
      Object.assign(windows, JSON.parse(line).rate_limit_info?.unifiedWindows ?? {});
    } catch {
      // not a JSON line
    }
  }
  const pct = (w) => (typeof w?.utilization === "number" ? Math.round(w.utilization * 1000) / 10 : null);
  const reset = (w) => w?.resetsAt ?? w?.resets_at ?? null;
  const five = windows.five_hour;
  const seven = windows.seven_day;
  if (!five && !seven) throw new Error("probe returned no rate_limit_event");
  return {
    ts: new Date().toISOString(),
    fiveHour: pct(five),
    sevenDay: pct(seven),
    resetsAt: reset(five),
    sevenDayResetsAt: reset(seven),
  };
}

/** Saves a probe result as the runtime sample and logs `usage.sample`. */
export function recordUsageSample(root, sample) {
  writeJson(usageFile(root), sample);
  appendEvent(root, "usage.sample", {
    actor: "usage",
    data: { fiveHour: sample.fiveHour, sevenDay: sample.sevenDay, resetsAt: sample.resetsAt },
  });
}

/**
 * Current usage: the runtime sample when younger than `maxAgeMs`, else a fresh probe (recorded).
 * When the probe fails, a stale sample still counts while its five-hour window has not reset (usage only grows
 * inside a window). Returns `{sample, source: "fresh"|"probe"|"stale"|"none", error}`.
 */
export function currentUsage(root, { maxAgeMs = USAGE_FRESH_MS, probe = true, timeout = 60000, now = Date.now() } = {}) {
  const last = readUsageSample(root);
  const age = last ? now - Date.parse(last.ts) : Infinity;
  if (last && age >= 0 && age < maxAgeMs) return { sample: last, source: "fresh", error: null };
  let error = probe ? null : "no fresh sample";
  if (probe) {
    try {
      const sample = probeUsage(root, { timeout });
      recordUsageSample(root, sample);
      return { sample, source: "probe", error: null };
    } catch (e) {
      error = e.message;
    }
  }
  const reset = last ? resetMs(last.resetsAt) : null;
  if (last && reset !== null && reset > now) return { sample: last, source: "stale", error };
  return { sample: null, source: "none", error };
}

// ---------------------------------------------------------------------------------------------
// Pause flag: `.maestro/runtime/pause.json`, set by `maestro pause --on`, removed by `maestro pause --off`.

export function readPause(root) {
  return readJson(pauseFile(root));
}

export function setPause(root, { reason = null, actor = null } = {}) {
  const flag = { since: new Date().toISOString(), reason, actor };
  writeJson(pauseFile(root), flag);
  return flag;
}

/** Removes the flag; returns the flag that was active, or null. */
export function clearPause(root) {
  const flag = readPause(root);
  rmSync(pauseFile(root), { force: true });
  return flag;
}

// ---------------------------------------------------------------------------------------------
// Interruption marker: `.maestro/runtime/interrupted.json`, written by the StopFailure hook on a rate-limit stop,
// removed by `maestro salvage` once the work is saved.

export const isRateLimitError = (error) => /rate[\s_-]?limit/i.test(typeof error === "string" ? error : JSON.stringify(error ?? ""));

export function readInterrupted(root) {
  return readJson(interruptedFile(root));
}

/** Records (or extends) the marker: first and last stop time, count and the last error. */
export function markInterrupted(root, { error = null, agentId = null, agentType = null } = {}) {
  const now = new Date().toISOString();
  const prev = readInterrupted(root);
  const marker = {
    since: prev?.since ?? now,
    last: now,
    count: (prev?.count ?? 0) + 1,
    error,
    agentIds: [...new Set([...(prev?.agentIds ?? []), ...(agentId ? [agentId] : [])])],
    agentTypes: [...new Set([...(prev?.agentTypes ?? []), ...(agentType ? [agentType] : [])])],
  };
  writeJson(interruptedFile(root), marker);
  return marker;
}

export function clearInterrupted(root) {
  rmSync(interruptedFile(root), { force: true });
}

/** One line for the PM about interrupted work, or null. */
export function interruptedNotice(marker) {
  if (!marker) return null;
  return (
    `MAESTRO: work was interrupted by a usage limit (${marker.count} stop(s), first at ${marker.since}). ` +
    "Implementer worktrees may hold uncommitted work. Once no agent is running, run `maestro salvage` to commit it to " +
    "wip/<task> branches, then follow the maestro:resume skill."
  );
}

// ---------------------------------------------------------------------------------------------
// The gate.

/**
 * Whether new work may start: a claim or the launch of a Maestro agent.
 * Returns `{allow, level, reason, sample, source, pause, note}` where level is
 * "paused" | "top" (at or above the top band) | "lower" (at or above the lower band) | "ok" | "unknown" (no sample:
 * allowed, fail open). `reason` explains a refusal; `note` explains an unknown usage.
 */
export function usageGate(root, config, opts = {}) {
  const pause = readPause(root);
  if (pause) {
    const why = pause.reason ? ` (${pause.reason})` : "";
    return { allow: false, level: "paused", reason: `a Maestro pause is active since ${pause.since}${why}`, sample: null, source: null, pause, note: null };
  }
  const { lower, top } = usageBands(config);
  const { sample, source, error } = currentUsage(root, opts);
  if (!sample) {
    const note = `usage unknown (${error ?? "no sample"}): not gated`;
    return { allow: true, level: "unknown", reason: null, sample: null, source, pause: null, note };
  }
  const windows = [
    ["five-hour", sample.fiveHour, sample.resetsAt],
    ["seven-day", sample.sevenDay, sample.sevenDayResetsAt],
  ].filter(([, pct]) => typeof pct === "number");
  const over = windows.filter(([, pct]) => pct >= top);
  if (over.length) {
    const parts = over.map(([name, pct, reset]) => `${name} usage ${pct}% (resets ${formatReset(reset)})`);
    const reason = `${parts.join(" and ")} ${over.length > 1 ? "are" : "is"} at or above the top usage band ${top}%`;
    return { allow: false, level: "top", reason, sample, source, pause: null, note: null };
  }
  const level = windows.some(([, pct]) => pct >= lower) ? "lower" : "ok";
  return { allow: true, level, reason: null, sample, source, pause: null, note: null };
}
