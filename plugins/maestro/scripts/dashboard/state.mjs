// Dashboard state (contract: docs/dashboard-contract.md). Pure builders plus loadState(root), which reads the inputs.
// Read-only: nothing here writes to the project.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { DEFAULTS } from "../lib/config.mjs";
import { usageSummary } from "../lib/context.mjs";
import { readEvents } from "../lib/events.mjs";
import { git } from "../lib/git.mjs";
import { PRICES_AS_OF, PRICES_SOURCE, costUsd } from "./prices.mjs";

const STALE_MS = 30 * 60 * 1000;
const AGENT_RUNNING_MS = 12 * 60 * 60 * 1000;
const CLAIM_WINDOW_MS = 2 * 60 * 1000;
const RELEASE_WINDOW_MS = 2 * 60 * 1000;
const DONE_STATUSES = new Set(["done", "integrated"]);

// ---------------------------------------------------------------------------------------------
// Frontmatter: a small YAML subset (scalars, quoted strings, inline lists, `- item` block lists).

function unquote(raw) {
  const s = raw.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    try {
      return JSON.parse(s);
    } catch {
      return s.slice(1, -1);
    }
  }
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replaceAll("''", "'");
  return s;
}

function splitInline(inner) {
  const items = [];
  let cur = "";
  let quote = null;
  for (const ch of inner) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ",") {
      items.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim() !== "") items.push(cur);
  return items.map((i) => unquote(i)).filter((i) => i !== "");
}

function scalar(raw) {
  const s = raw.trim();
  if (s === "") return null;
  if (s.startsWith("[") && s.endsWith("]")) return splitInline(s.slice(1, -1));
  if (s.startsWith('"') || s.startsWith("'")) return unquote(s);
  const noComment = s.replace(/\s+#.*$/, "");
  if (noComment === "null" || noComment === "~") return null;
  if (noComment === "true") return true;
  if (noComment === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(noComment)) return Number(noComment);
  return noComment;
}

const snake = (k) => k.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

/** Split a Markdown file into {data, body}. Keys are normalised to snake_case. Never throws on odd input. */
export function parseFrontmatter(text) {
  const src = String(text).replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const m = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(src);
  if (!m) return { data: {}, body: src, hasFrontmatter: false };
  const data = {};
  let listKey = null;
  const lines = m[1].split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    // Block scalars (`key: >-`, `key: |`): Backlog.md writes long titles this way.
    const block = /^([A-Za-z_][\w.-]*)\s*:\s+([>|])[+-]?\s*$/.exec(line);
    if (block) {
      const body = [];
      while (i + 1 < lines.length && (lines[i + 1].trim() === "" || /^\s/.test(lines[i + 1]))) body.push(lines[++i].trim());
      while (body.length && body[body.length - 1] === "") body.pop();
      data[snake(block[1])] =
        block[2] === "|" ? body.join("\n") : body.join("\n").replace(/([^\n])\n(?=[^\n])/g, "$1 ").replace(/\n\n/g, "\n");
      listKey = null;
      continue;
    }
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && listKey) {
      data[listKey].push(unquote(item[1]));
      continue;
    }
    const kv = /^([A-Za-z_][\w.-]*)\s*:(?:\s+(.*)|\s*)$/.exec(line);
    if (!kv) {
      listKey = null;
      continue;
    }
    const key = snake(kv[1]);
    const rest = kv[2] ?? "";
    if (rest.trim() === "") {
      data[key] = [];
      listKey = key;
    } else {
      data[key] = scalar(rest);
      listKey = null;
    }
  }
  return { data, body: src.slice(m[0].length), hasFrontmatter: true };
}

// ---------------------------------------------------------------------------------------------
// Normalisation helpers.

const first = (obj, ...keys) => {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)) return v;
  }
  return null;
};
const asList = (v) => (Array.isArray(v) ? v : v === null || v === undefined || v === "" ? [] : [v]).map(String);
const normId = (v) => {
  const s = String(v ?? "").trim();
  if (/^task-/i.test(s)) return s.toUpperCase();
  if (/^draft-/i.test(s)) return s.toLowerCase();
  return s;
};
const lower = (v) => String(v ?? "").trim().toLowerCase();

/** ISO string for the date formats Backlog.md writes ("2026-11-06", "2026-11-06 15:04", full ISO); null if unparseable. */
export function toIso(v) {
  if (v === null || v === undefined || v === "") return null;
  let s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += "T00:00:00Z";
  else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s)) s = s.replace(" ", "T") + (s.length <= 16 ? ":00Z" : "Z");
  else s = s.replace(/^(\d{4}-\d{2}-\d{2}) (\d)/, "$1T$2");
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
const ms = (iso) => (iso ? Date.parse(iso) : NaN);

function acCounts(body) {
  const m = /<!--\s*AC:BEGIN\s*-->([\s\S]*?)<!--\s*AC:END\s*-->/.exec(body);
  if (!m) return { acDone: 0, acTotal: 0 };
  let acDone = 0;
  let acTotal = 0;
  for (const line of m[1].split("\n")) {
    const c = /^\s*-\s*\[([ xX])\]/.exec(line);
    if (!c) continue;
    acTotal++;
    if (c[1] !== " ") acDone++;
  }
  return { acDone, acTotal };
}

/** Parse one task/draft file into a flat record, or null when it has no usable id. */
export function parseTaskFile(text, { archived = false, draft = false } = {}) {
  const { data, body } = parseFrontmatter(text);
  const rawId = first(data, "id");
  if (rawId === null) return null;
  const refs = asList(data.references);
  const created = toIso(first(data, "created_date"));
  const parent = first(data, "parent_task_id", "parent");
  return {
    id: normId(rawId),
    title: String(first(data, "title") ?? rawId),
    status: String(first(data, "status") ?? (draft ? "Draft" : "")),
    assignees: asList(first(data, "assignee", "assignees")),
    labels: asList(data.labels),
    milestone: first(data, "milestone") === null ? null : String(first(data, "milestone")),
    dependencies: asList(first(data, "dependencies", "depends_on")).map(normId),
    scope: refs.filter((r) => r.startsWith("scope:")).map((r) => r.slice(6)),
    references: refs.filter((r) => !r.startsWith("scope:")),
    parent: parent === null ? null : normId(parent),
    priority: first(data, "priority"),
    createdAt: created,
    updatedAt: toIso(first(data, "updated_date")) ?? created,
    archived,
    draft,
    // Model the architect planned in the notes ("Modello: Opus", "model: sonnet").
    plannedModel: (/\b(?:modello|model)\s*[:=]\s*\**\s*(opus|sonnet|haiku)\b/i.exec(String(text))?.[1] ?? "").toLowerCase() || null,
    // Decisions the task mentions (references or text), e.g. "decision-7": they block the GOAL while open.
    decisionRefs: [...new Set((String(text).match(/\bdecision-\d+\b/gi) ?? []).map((d) => d.toLowerCase()))],
    ...acCounts(body),
  };
}

// ---------------------------------------------------------------------------------------------
// Pure state builder.

const isGoal = (t) => t.labels.some((l) => lower(l) === "goal");
const isDone = (t) => DONE_STATUSES.has(lower(t.status));

/**
 * Agents that ended without an agent.stop: killed by a usage limit (a limit.hit after their last event, and
 * nothing from them since), or already measured by the architect after their last start. agentId -> end time (ISO).
 */
function silentEnds(events) {
  const last = new Map();
  const lastStart = new Map();
  const ended = new Map();
  for (const e of events) {
    if (e.agentId) {
      last.set(e.agentId, e.ts);
      if (e.type === "agent.start") {
        lastStart.set(e.agentId, e.ts);
        ended.delete(e.agentId); // resumed: running again
      } else if (e.type === "agent.stop") ended.delete(e.agentId);
    } else if (e.type === "limit.hit") {
      for (const [id, ts] of last) if (!ended.has(id) && Date.parse(ts) <= Date.parse(e.ts)) ended.set(id, e.ts);
    } else if (e.type === "task.measure") {
      for (const id of e.data?.agentIds ?? []) if (lastStart.has(id) && !ended.has(id)) ended.set(id, e.ts);
    }
  }
  return ended;
}

// Default model of an agent definition, shown as "planned" when nothing better is known.
const PLANNED_MODEL = { "maestro:implementer": "sonnet", "maestro:architect": "opus" };

function buildAgents(events, now, tasksById) {
  const quietEnd = silentEnds(events);
  const starts = new Map();
  const stops = new Map();
  for (const e of events) {
    if (!e.agentId) continue;
    // A resumed agent (SendMessage) starts again under the same id: keep its first start for "since",
    // and drop the earlier stop so it shows as running until it stops again.
    if (e.type === "agent.start") {
      if (!starts.has(e.agentId)) starts.set(e.agentId, e);
      else stops.delete(e.agentId);
    } else if (e.type === "agent.stop") stops.set(e.agentId, e);
  }
  const claims = events.filter((e) => e.type === "task.claim" && e.task).map((e) => ({ e, t: Date.parse(e.ts), used: false }));
  // Exact links first: task.measure lists the agent ids that worked on a task.
  const measured = new Map();
  for (const e of events) {
    if (e.type !== "task.measure" || !e.task) continue;
    for (const id of e.data?.agentIds ?? []) measured.set(id, normId(e.task));
  }
  const actorByTask = new Map(claims.map((c) => [normId(c.e.task), c.e.actor]));
  // agent.bind: written by the PreToolUse hook when a subagent runs `maestro claim` (exact agent id).
  const bound = new Map();
  for (const e of events) {
    if (e.type === "agent.bind" && e.agentId && e.task) bound.set(e.agentId, { task: normId(e.task), actor: e.actor ?? null, model: e.data?.model ?? null });
  }
  // An implementer stops right after it releases its task: pair a stop with the latest release before it.
  const releases = events.filter((e) => e.type === "task.release" && e.task).map((e) => ({ e, t: Date.parse(e.ts), used: false }));
  const agents = [];
  const ordered = [...starts.values()].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  // Pass 1: exact or near-exact links (task.measure, agent.bind, a release just before the stop), so that
  // the time-order heuristic of pass 2 never takes a claim that belongs to another agent.
  const links = new Map();
  const markClaims = (task) => claims.filter((c) => normId(c.e.task) === task).forEach((c) => (c.used = true));
  for (const s of ordered) {
    const type = s.data?.agentType ?? "";
    const stop = stops.get(s.agentId);
    let task = measured.get(s.agentId) ?? bound.get(s.agentId)?.task ?? null;
    let actor = bound.get(s.agentId)?.actor ?? (task ? actorByTask.get(task) ?? null : null);
    if (!task && stop && /implementer/.test(type)) {
      const tStop = Date.parse(stop.ts);
      const rel = releases.filter((r) => !r.used && r.t <= tStop && tStop - r.t <= RELEASE_WINDOW_MS).sort((x, y) => y.t - x.t)[0];
      if (rel) {
        rel.used = true;
        task = normId(rel.e.task);
        actor = rel.e.actor ?? null;
      }
    }
    if (task) {
      markClaims(task);
      links.set(s.agentId, { task, actor });
    }
  }
  // Pass 2: remaining implementers take the first unused claim within 2 minutes of their start.
  for (const s of ordered) {
    const t0 = Date.parse(s.ts);
    const stop = stops.get(s.agentId) ?? null;
    const type = s.data?.agentType ?? null;
    let { task = null, actor = null } = links.get(s.agentId) ?? {};
    if (!task && /implementer/.test(type ?? "")) {
      const claim = claims.find((c) => !c.used && c.t >= t0 && c.t - t0 <= CLAIM_WINDOW_MS);
      if (claim) {
        claim.used = true;
        task = normId(claim.e.task);
        actor = claim.e.actor ?? null;
      }
    }
    // Other roles (architect, QA, reviewer) are named after their agent type.
    if (!actor && type) actor = type.replace(/^.*:/, "");
    // QA explorers and code reviewers have a mission: the id in the latest qa.start / review.start before their start.
    const missionType = /qa-explorer/.test(type ?? "") ? "qa.start" : /code-reviewer/.test(type ?? "") ? "review.start" : null;
    const missionEvent = missionType ? events.filter((e) => e.type === missionType && Date.parse(e.ts) <= t0).pop() : null;
    const mission = missionEvent ? String(missionEvent.data?.[missionType === "qa.start" ? "qa" : "review"] ?? "") || null : null;
    // Model: measured (largest token share in the stop usage), else recorded at claim time, else planned.
    const used = Object.entries(stop?.data?.usage?.models ?? {})
      .map(([id, u]) => [id, ["input", "output", "cacheRead", "cacheWrite"].reduce((n, k) => n + (Number(u?.[k]) || 0), 0)])
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    const planned = (task && tasksById?.get(task)?.plannedModel) || PLANNED_MODEL[type ?? ""] || null;
    const model = used ?? bound.get(s.agentId)?.model ?? planned;
    const modelPlanned = !used && !bound.get(s.agentId)?.model && Boolean(planned);
    const endedQuietly = !stop ? quietEnd.get(s.agentId) ?? null : null;
    const running = !stop && !endedQuietly && now - t0 < AGENT_RUNNING_MS;
    agents.push({
      agentId: s.agentId,
      type,
      actor,
      task,
      mission,
      model,
      modelPlanned,
      state: running ? "running" : "finished",
      since: s.ts,
      until: stop?.ts ?? endedQuietly,
    });
  }
  return agents.reverse(); // newest first
}

function addTokens(into, from) {
  for (const k of ["input", "output", "cacheRead", "cacheWrite"]) into[k] = (into[k] ?? 0) + (from?.[k] ?? 0);
}

// ---------------------------------------------------------------------------------------------
// Full GOAL cost: everything that ran between goal.start and goal.done, split by role.

const ROLES = ["pm", "architect", "implementer", "qa", "reviewer", "other"];
const ROLE_BY_TYPE = {
  "maestro:architect": "architect",
  "maestro:implementer": "implementer",
  "maestro:qa-explorer": "qa",
  "maestro:code-reviewer": "reviewer",
};
const MINUTE_MS = 60 * 1000;

/** goal id -> spans [{from, to, open}] (ms): each goal.start up to the next goal.done of the same goal, else now. */
function goalWindows(events, nowMs) {
  const byGoal = new Map();
  for (const e of events) {
    // goal.approved opens the window too: the PM's work to agree the GOAL is part of its cost.
    if ((e.type !== "goal.start" && e.type !== "goal.approved" && e.type !== "goal.done") || !e.goal) continue;
    const t = Date.parse(e.ts);
    if (Number.isNaN(t)) continue;
    const id = normId(e.goal);
    const g = byGoal.get(id) ?? { spans: [], openFrom: null };
    if (e.type === "goal.start" || e.type === "goal.approved") g.openFrom ??= t;
    else if (g.openFrom !== null) {
      g.spans.push({ from: g.openFrom, to: t, open: false });
      g.openFrom = null;
    }
    byGoal.set(id, g);
  }
  const out = new Map();
  for (const [id, g] of byGoal) {
    if (g.openFrom !== null) g.spans.push({ from: g.openFrom, to: nowMs, open: true });
    if (g.spans.length) out.set(id, g.spans);
  }
  return out;
}

/**
 * One record per subagent: first start (for the GOAL window), role, whether it is still running, and the usage
 * of its latest agent.stop. Usage is cumulative over the agent's transcript, so a resumed agent is counted once.
 */
function agentRuns(events, nowMs) {
  const quietEnd = silentEnds(events);
  const usages = agentUsages(events);
  const runs = new Map();
  events.forEach((e, i) => {
    if (!e.agentId || (e.type !== "agent.start" && e.type !== "agent.stop")) return;
    const r = runs.get(e.agentId) ?? { id: e.agentId, firstStart: null, lastStartAt: null, lastStartIdx: -1, stop: null, stopIdx: -1, type: null };
    if (e.type === "agent.start") {
      r.firstStart ??= Date.parse(e.ts);
      r.lastStartAt = Date.parse(e.ts);
      r.lastStartIdx = i;
    } else {
      r.stop = e;
      r.stopIdx = i;
    }
    r.type ??= e.data?.agentType ?? null;
    runs.set(e.agentId, r);
  });
  const out = [];
  for (const r of runs.values()) {
    if (r.firstStart === null || Number.isNaN(r.firstStart)) continue;
    // Same rule as the Agents view: no stop after the latest start, and that start is less than 12 hours old.
    const running = r.stopIdx < r.lastStartIdx && !quietEnd.has(r.id) && nowMs - r.lastStartAt < AGENT_RUNNING_MS;
    out.push({
      start: r.firstStart,
      role: ROLE_BY_TYPE[r.type] ?? "other",
      running,
      // A resumed agent keeps the tokens of its previous stop while it runs again (a lower bound), so totals never drop.
      models: r.stop?.data?.usage?.models ?? (quietEnd.has(r.id) ? usages.get(r.id)?.models : null) ?? {},
    });
  }
  return out;
}

const inSpans = (t, spans) => spans.some((s) => t >= s.from && (s.open || t < s.to));

/**
 * Breakdown by role for one GOAL. `pmUsage({from, to})` returns {sessions, models} for the PM transcripts in
 * that window, or null when no PM session is known. For an open window `to` is rounded down to the minute,
 * so the reader can cache the result between state builds.
 */
function goalBreakdown(spans, runs, pmUsage) {
  const rows = new Map(ROLES.map((role) => [role, { role, agents: 0, running: 0, models: {} }]));
  for (const a of runs) {
    if (!inSpans(a.start, spans)) continue;
    const row = rows.get(a.role);
    row.agents++;
    if (a.running) row.running++;
    for (const [m, tok] of Object.entries(a.models)) addTokens((row.models[m] ??= {}), tok);
  }
  const pm = rows.get("pm");
  let known = typeof pmUsage === "function";
  for (const s of known ? spans : []) {
    let u = null;
    try {
      u = pmUsage({ from: s.from, to: s.open ? Math.floor(s.to / MINUTE_MS) * MINUTE_MS : s.to });
    } catch {
      u = null;
    }
    if (!u) {
      known = false;
      break;
    }
    pm.agents = Math.max(pm.agents, Number(u.sessions) || 0);
    for (const [m, tok] of Object.entries(u.models ?? {})) addTokens((pm.models[m] ??= {}), tok);
  }
  if (!known) {
    pm.agents = 0;
    pm.models = {};
    pm.note = "No PM session recorded for this project yet: the context-watch hook records it while the PM works.";
  }
  return [...rows.values()];
}

/**
 * Per-task usage from task.measure events. An agent's usage is counted once overall: when one implementer worked
 * on several tasks (a batch), its usage is split evenly among them and each row lists the tasks it shares.
 * Per-agent usage comes from the agent's latest agent.stop (cumulative over its transcript) or, failing that, from
 * a single-agent measure. Measures without agent ids (older data) are summed as recorded.
 */
/**
 * agentId -> {models, wallMs}: the latest agent.stop; else a single-agent measure; else, for the one agent of a
 * measure with no usage of its own (killed by a usage limit), what the measure holds beyond the other agents.
 */
function agentUsages(events) {
  const agentUsage = new Map();
  for (const e of events) if (e.type === "agent.stop" && e.agentId && e.data?.usage) agentUsage.set(e.agentId, e.data.usage);
  const fromStop = new Set(agentUsage.keys());
  const measures = events.filter((e) => e.type === "task.measure" && e.data?.usage && e.data?.agentIds?.length);
  for (const e of measures) {
    const ids = e.data.agentIds.map(String);
    if (ids.length === 1 && !fromStop.has(ids[0])) {
      agentUsage.set(ids[0], { ...e.data.usage, wallMs: Number(e.data.wallMs ?? e.data.usage.wallMs ?? 0) || 0 });
    }
  }
  for (const e of measures) {
    const ids = e.data.agentIds.map(String);
    const unknown = ids.filter((a) => !agentUsage.has(a));
    if (ids.length < 2 || unknown.length !== 1) continue;
    const known = ids.filter((a) => agentUsage.has(a));
    const models = {};
    for (const [model, tok] of Object.entries(e.data.usage.models ?? {})) {
      const rest = {};
      for (const k of ["input", "output", "cacheRead", "cacheWrite"]) {
        rest[k] = Math.max(0, (tok?.[k] ?? 0) - known.reduce((s, a) => s + (agentUsage.get(a).models?.[model]?.[k] ?? 0), 0));
      }
      if (Object.values(rest).some((v) => v > 0)) models[model] = rest;
    }
    const wall = Number(e.data.wallMs ?? e.data.usage.wallMs ?? 0) || 0;
    const knownWall = known.reduce((s, a) => s + (Number(agentUsage.get(a).wallMs) || 0), 0);
    agentUsage.set(unknown[0], { models, wallMs: Math.max(0, wall - knownWall) });
  }
  return agentUsage;
}

function measuredTasks(events) {
  const agentUsage = agentUsages(events);
  const byTask = new Map();
  for (const e of events) {
    if (e.type !== "task.measure" || !e.task) continue;
    const id = normId(e.task);
    const rec = byTask.get(id) ?? { agents: new Set(), legacy: [], reworkCycles: 0, ownerInterventions: 0 };
    const ids = (e.data?.agentIds ?? []).map(String);
    const known = ids.filter((a) => agentUsage.has(a));
    known.forEach((a) => rec.agents.add(a));
    if (known.length < ids.length || !ids.length) {
      // Agents with no usage of their own (no agent.stop, e.g. killed by a usage limit): keep what the measure
      // recorded beyond the known agents, so no agent is counted twice.
      const models = {};
      for (const [model, tok] of Object.entries(e.data?.usage?.models ?? {})) {
        const rest = {};
        for (const k of ["input", "output", "cacheRead", "cacheWrite"]) {
          const used = known.reduce((s, a) => s + (agentUsage.get(a).models?.[model]?.[k] ?? 0), 0);
          rest[k] = Math.max(0, (tok?.[k] ?? 0) - used);
        }
        models[model] = rest;
      }
      const wall = Number(e.data?.wallMs ?? e.data?.usage?.wallMs ?? 0) || 0;
      const knownWall = known.reduce((s, a) => s + (Number(agentUsage.get(a).wallMs) || 0), 0);
      rec.legacy.push({ models, wallMs: Math.max(0, wall - knownWall) });
    }
    // Later measures replace the counters: they are cumulative per task, not per measurement.
    rec.reworkCycles = Number(e.data?.reworkCycles ?? rec.reworkCycles) || 0;
    rec.ownerInterventions = Number(e.data?.ownerInterventions ?? rec.ownerInterventions) || 0;
    if (e.goal && !rec.goal) rec.goal = e.goal;
    byTask.set(id, rec);
  }
  const tasksOfAgent = new Map();
  for (const [id, rec] of byTask) for (const a of rec.agents) tasksOfAgent.set(a, [...(tasksOfAgent.get(a) ?? []), id]);
  const out = new Map();
  for (const [id, rec] of byTask) {
    const models = {};
    let wallMs = 0;
    const shared = new Set();
    for (const a of rec.agents) {
      const tasks = tasksOfAgent.get(a);
      const n = tasks.length;
      const u = agentUsage.get(a);
      for (const [model, tok] of Object.entries(u.models ?? {})) {
        const part = {};
        for (const k of ["input", "output", "cacheRead", "cacheWrite"]) part[k] = Math.round((tok?.[k] ?? 0) / n);
        addTokens((models[model] ??= {}), part);
      }
      wallMs += Math.round((Number(u.wallMs) || 0) / n);
      for (const t of tasks) if (t !== id) shared.add(t);
    }
    for (const l of rec.legacy) {
      for (const [model, tok] of Object.entries(l.models)) addTokens((models[model] ??= {}), tok);
      wallMs += l.wallMs;
    }
    out.set(id, { models, wallMs, sharedWith: [...shared].sort(), reworkCycles: rec.reworkCycles, ownerInterventions: rec.ownerInterventions, goal: rec.goal });
  }
  return out;
}

function buildCosts({ events, tasksById, overrides, nowMs = Date.now(), pmUsage = null }) {
  const unpriced = new Set();
  const byTask = measuredTasks(events);
  // Unrounded USD, or null when any model of the record has no price.
  // USD of the priced models only; null when no model has a price. Unpriced models are listed in `unpriced`
  // and the page flags the sum as partial.
  const usdOf = (models) => {
    let total = 0;
    let pricedAny = false;
    for (const [model, tok] of Object.entries(models)) {
      const c = costUsd(model, tok, overrides);
      if (c === null) unpriced.add(model);
      else {
        total += c;
        pricedAny = true;
      }
    }
    return pricedAny ? total : null;
  };
  const round = (n) => (n === null ? null : Math.round(n * 100) / 100);
  const taskRows = [];
  for (const [id, rec] of byTask) {
    const t = tasksById.get(id);
    taskRows.push({
      row: {
        task: id,
        goal: t?.parent ?? (rec.goal ? normId(rec.goal) : null),
        title: t?.title ?? id,
        wallMs: rec.wallMs,
        sharedWith: rec.sharedWith,
        reworkCycles: rec.reworkCycles,
        ownerInterventions: rec.ownerInterventions,
        models: rec.models,
      },
      usd: usdOf(rec.models),
    });
  }
  const goals = new Map();
  for (const { row, usd } of taskRows) {
    if (!row.goal) continue;
    const g = goals.get(row.goal) ?? { goal: row.goal, title: tasksById.get(row.goal)?.title ?? row.goal, tasks: 0, wallMs: 0, models: {}, usd: 0 };
    g.tasks++;
    g.wallMs += row.wallMs;
    for (const [m, tok] of Object.entries(row.models)) addTokens((g.models[m] ??= {}), tok);
    if (usd !== null) g.usd = (g.usd ?? 0) + usd;
    goals.set(row.goal, g);
  }
  // Full cost per GOAL that has a goal.start. A GOAL with no measured task still gets a record.
  const windows = goalWindows(events, nowMs);
  const runs = windows.size ? agentRuns(events, nowMs) : [];
  const full = new Map();
  for (const [id, spans] of windows) {
    const breakdown = goalBreakdown(spans, runs, pmUsage).map((r) => ({ ...r, usd: round(usdOf(r.models)) }));
    const models = {};
    for (const r of breakdown) for (const [m, tok] of Object.entries(r.models)) addTokens((models[m] ??= {}), tok);
    const last = spans[spans.length - 1];
    full.set(id, {
      window: { from: new Date(spans[0].from).toISOString(), to: last.open ? null : new Date(last.to).toISOString(), open: last.open },
      breakdown,
      total: { models, usd: round(usdOf(models)) },
    });
    if (!goals.has(id)) goals.set(id, { goal: id, title: tasksById.get(id)?.title ?? id, tasks: 0, wallMs: 0, models: {}, usd: null });
  }
  // Newest GOAL window first, then the GOALs known only from task measures (older data), in their order.
  const fromOf = (id) => (full.has(id) ? Date.parse(full.get(id).window.from) : -Infinity);
  const goalRows = [...goals.values()].sort((a, b) => fromOf(b.goal) - fromOf(a.goal));
  return {
    estimate: true,
    tasks: taskRows.map(({ row, usd }) => ({ ...row, usd: round(usd) })),
    goals: goalRows.map((g) => ({ ...g, usd: round(g.usd), ...(full.get(g.goal) ?? {}) })),
    unpriced: [...unpriced].sort(),
  };
}

const snapshot = (raw, nowMs, pick) => {
  if (!raw || typeof raw !== "object") return null;
  const ts = toIso(raw.ts);
  return { ...pick(raw), ts, stale: ts === null ? true : nowMs - Date.parse(ts) > STALE_MS };
};

/**
 * Build the state object from raw inputs (no I/O). inputs:
 * { project, config, tasks[], drafts[], milestones[], decisions[], events[], reports[], git, runtime, warnings[], pmUsage }
 * pmUsage: optional ({from, to}) => {sessions, models} | null, the PM token usage inside a GOAL window (see loadState).
 */
export function buildState(inputs, now = new Date()) {
  const nowMs = now.getTime();
  const config = { ...DEFAULTS, ...(inputs.config ?? {}) };
  const events = inputs.events ?? [];
  const byId = (a, b) => String(a.id).localeCompare(String(b.id), "en", { numeric: true });
  const allTasks = [...(inputs.tasks ?? [])].sort(byId);
  const tasksById = new Map(allTasks.map((t) => [t.id, t]));
  const goalsList = allTasks.filter(isGoal);

  const goalView = (g) => {
    const kids = allTasks.filter((t) => t.parent === g.id);
    return {
      id: g.id,
      title: g.title,
      status: g.status,
      labels: g.labels,
      proposed: g.labels.some((l) => lower(l) === "proposed"),
      done: kids.filter(isDone).length,
      total: kids.length,
      dependencies: g.dependencies,
      archived: g.archived,
    };
  };

  // Milestones -> goals -> drafts. A task's `milestone` may be a milestone id or title.
  const matches = (m, ref) => ref !== null && (lower(m.id) === lower(ref) || lower(m.title) === lower(ref));
  const drafts = [...(inputs.drafts ?? [])].sort(byId);
  // Tasks that are not GOALs and have no parent GOAL (debt, fixes): listed under their milestone.
  const looseTasks = allTasks.filter((t) => !isGoal(t) && !t.parent && !t.archived);
  const looseView = (t) => ({ id: t.id, title: t.title, status: t.status });
  const withState = (m) => ({
    ...m,
    // Completed: it has GOALs and all of them are done; whatever else it holds is drafts and loose tasks.
    completed: m.goals.length > 0 && m.goals.every((g) => DONE_STATUSES.has(lower(g.status))),
  });
  const milestones = (inputs.milestones ?? []).map((m) =>
    withState({
      id: m.id,
      title: m.title,
      description: m.description ?? "",
      archived: !!m.archived,
      goals: goalsList.filter((g) => matches(m, g.milestone)).map(goalView),
      drafts: drafts.filter((d) => matches(m, d.milestone)).map((d) => ({ id: d.id, title: d.title })),
      tasks: looseTasks.filter((t) => matches(m, t.milestone)).map(looseView),
    }),
  );
  const placedGoals = new Set(milestones.flatMap((m) => m.goals.map((g) => g.id)));
  const placedDrafts = new Set(milestones.flatMap((m) => m.drafts.map((d) => d.id)));
  const looseGoals = goalsList.filter((g) => !placedGoals.has(g.id));
  const looseDrafts = drafts.filter((d) => !placedDrafts.has(d.id));
  const placedTasks = new Set(milestones.flatMap((m) => m.tasks.map((t) => t.id)));
  const unplacedTasks = looseTasks.filter((t) => !placedTasks.has(t.id));
  if (looseGoals.length || looseDrafts.length || unplacedTasks.length) {
    milestones.push(
      withState({
        id: null,
        title: "No milestone",
        description: "",
        archived: false,
        goals: looseGoals.map(goalView),
        drafts: looseDrafts.map((d) => ({ id: d.id, title: d.title })),
        tasks: unplacedTasks.map(looseView),
      }),
    );
  }

  const tasks = allTasks
    .filter((t) => !isGoal(t))
    .map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      goal: t.parent,
      assignees: t.assignees,
      dependencies: t.dependencies,
      scope: t.scope,
      acDone: t.acDone,
      acTotal: t.acTotal,
      updatedAt: t.updatedAt,
      archived: t.archived,
    }));

  // Header.
  const active = goalsList
    .filter((g) => lower(g.status) === "in progress" && !g.archived)
    .sort((a, b) => (ms(b.updatedAt) || 0) - (ms(a.updatedAt) || 0))[0];
  const activeView = active ? goalView(active) : null;
  // Open decisions the work depends on (named by the active GOAL, its tasks or a blocked task) block it; the
  // other open ones are questions that can wait.
  const blockedTasks = allTasks.filter((t) => lower(t.status) === "blocked" && !t.archived);
  const blockers = new Set(
    [...(active ? [active] : []), ...allTasks.filter((t) => active && t.parent === active.id && !t.archived), ...blockedTasks].flatMap((t) => t.decisionRefs ?? []),
  );
  const decisions = (inputs.decisions ?? []).map((d) => {
    const open = ["open", "proposed"].includes(lower(d.status));
    return { ...d, open, blocking: open && blockers.has(lower(d.id)) };
  });
  const ownerWaiting = decisions.filter((d) => d.blocking).length + blockedTasks.length;
  const ownerQuestions = decisions.filter((d) => d.open && !d.blocking).length;

  const tags = inputs.git?.tags ?? [];
  const lastCr = tags
    .filter((t) => /^cr\/CR-/.test(t.name))
    .sort((a, b) => (ms(b.date) || 0) - (ms(a.date) || 0))[0];
  const since = lastCr ? ms(lastCr.date) : -Infinity;
  const integratedSinceLast = events.filter((e) => e.type === "task.status" && e.data?.to === "Integrated" && Date.parse(e.ts) > since).length;

  const runtime = inputs.runtime ?? {};
  const overrides = config.prices && typeof config.prices === "object" ? config.prices : {};
  const costs = buildCosts({ events, tasksById, overrides, nowMs, pmUsage: inputs.pmUsage ?? null });
  costs.pricesSource = `${PRICES_SOURCE} (${PRICES_AS_OF})${Object.keys(overrides).length ? ", with overrides from .maestro/config.json" : ""}`;

  return {
    generatedAt: now.toISOString(),
    project: inputs.project ?? {},
    header: {
      activeGoal: activeView ? { id: activeView.id, title: activeView.title, done: activeView.done, total: activeView.total } : null,
      main: inputs.git?.main ?? null,
      review: { integratedSinceLast, every: config.reviewEveryTasks, lastTag: lastCr?.name ?? null },
      context: snapshot(runtime.context, nowMs, (r) => ({ percent: r.percent ?? null })),
      usage: snapshot(runtime.usage, nowMs, (r) => ({ fiveHour: r.fiveHour ?? null, sevenDay: r.sevenDay ?? null, resetsAt: r.resetsAt ?? null })),
      ownerWaiting,
      ownerQuestions,
    },
    milestones,
    tasks,
    agents: buildAgents(events, nowMs, tasksById),
    decisions: decisions.map((d) => ({ id: d.id, title: d.title, status: d.status, date: d.date, path: d.path ?? null, blocking: d.blocking })),
    reports: inputs.reports ?? [],
    costs,
    events: events.slice(-50).reverse(),
    git: { branch: inputs.git?.branch ?? null, tags },
    warnings: inputs.warnings ?? [],
  };
}

// ---------------------------------------------------------------------------------------------
// Disk readers.

function listMd(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile() && d.name.endsWith(".md")).map((d) => join(dir, d.name));
  } catch {
    return [];
  }
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""));
  } catch {
    return null;
  }
}

const posix = (p) => p.split(sep).join("/");

// PM usage per transcript and window, kept between state builds (the server rebuilds on every change).
// A transcript that has not changed is never re-read; open windows end on a whole minute, so they hit too.
const pmCache = new Map();
const PM_CACHE_MAX = 500;

/**
 * Reader for the PM usage inside a GOAL window, from the transcripts listed in .maestro/runtime/pm-sessions.json
 * (written by the context-watch hook). Null when no PM session is known.
 */
export function pmUsageReader(root) {
  const data = readJson(join(root, ".maestro", "runtime", "pm-sessions.json"));
  const paths = [...new Set((Array.isArray(data?.sessions) ? data.sessions : []).map((s) => s?.transcriptPath).filter((p) => typeof p === "string" && p))];
  if (!paths.length) return null;
  return ({ from, to }) => {
    const models = {};
    let sessions = 0;
    for (const path of paths) {
      let st;
      try {
        st = statSync(path);
      } catch {
        continue; // transcript deleted or moved
      }
      const key = `${path}|${st.size}|${st.mtimeMs}|${from}|${to}`;
      let u = pmCache.get(key);
      if (!u) {
        try {
          u = usageSummary(path, { from, to });
        } catch {
          continue;
        }
        if (pmCache.size >= PM_CACHE_MAX) pmCache.clear();
        pmCache.set(key, u);
      }
      if (!Object.keys(u.models).length) continue;
      sessions++;
      for (const [m, tok] of Object.entries(u.models)) addTokens((models[m] ??= {}), tok);
    }
    return { sessions, models };
  };
}

function readEach(files, warnings, root, fn) {
  const out = [];
  for (const f of files) {
    try {
      const v = fn(readFileSync(f, "utf8"), f);
      if (v) out.push(v);
      else warnings.push(`${posix(relative(root, f))}: no id in frontmatter, skipped`);
    } catch (e) {
      warnings.push(`${posix(relative(root, f))}: ${e.message}`);
    }
  }
  return out;
}

function walkReports(root, warnings) {
  const base = join(root, ".maestro", "reports");
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith(".md")) {
        try {
          const rel = posix(relative(base, full));
          const kindDir = rel.includes("/") ? rel.split("/")[0] : "";
          const kind = { task: "task", tasks: "task", qa: "qa", review: "review", reviews: "review" }[kindDir.toLowerCase()] ?? (kindDir || "other");
          const text = readFileSync(full, "utf8");
          const line = parseFrontmatter(text).body.split(/\r?\n/).map((l) => l.trim()).find((l) => l !== "") ?? "";
          out.push({
            kind,
            id: e.name.replace(/\.md$/, ""),
            path: `.maestro/reports/${rel}`,
            title: line.replace(/^#+\s*/, "") || e.name,
            mtime: statSync(full).mtime.toISOString(),
          });
        } catch (err) {
          warnings.push(`reports/${e.name}: ${err.message}`);
        }
      }
    }
  };
  walk(base);
  return out.sort((a, b) => b.mtime.localeCompare(a.mtime));
}

function readGit(root, mainBranch) {
  const run = (args) => {
    try {
      return git(root, args);
    } catch {
      return null;
    }
  };
  let main = null;
  const line = run(["log", "-1", "--format=%h%x09%cI%x09%s", mainBranch]);
  if (line) {
    const [sha, date, ...subject] = line.split("\t");
    main = { sha, subject: subject.join("\t"), date: toIso(date) };
  }
  const branch = run(["rev-parse", "--abbrev-ref", "HEAD"]);
  const tags = [];
  const refs = run(["for-each-ref", "--format=%(refname:short)%09%(creatordate:iso-strict)", "refs/tags/done/", "refs/tags/qa/", "refs/tags/cr/"]);
  for (const l of (refs ?? "").split("\n")) {
    const [name, date] = l.split("\t");
    if (name && /^(done|qa|cr)\//.test(name)) tags.push({ name, date: toIso(date) });
  }
  return { main, branch, tags };
}

/** Read every input from disk under `root` and build the state. Never throws on a bad file. */
export function loadState(root, { now = new Date() } = {}) {
  const warnings = [];
  const config = { ...DEFAULTS, ...(readJson(join(root, ".maestro", "config.json")) ?? {}) };
  const backlog = join(root, "backlog");

  const tasks = [
    ...readEach(listMd(join(backlog, "tasks")), warnings, root, (t) => parseTaskFile(t)),
    ...readEach(listMd(join(backlog, "archive", "tasks")), warnings, root, (t) => parseTaskFile(t, { archived: true })),
  ];
  const drafts = readEach(listMd(join(backlog, "drafts")), warnings, root, (t) => parseTaskFile(t, { draft: true }));

  const milestoneOf = (archived) => (text) => {
    const { data, body } = parseFrontmatter(text);
    const id = first(data, "id");
    if (id === null) return null;
    const desc = /^##\s*Description\s*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/m.exec(body)?.[1] ?? body;
    return { id: String(id), title: String(first(data, "title") ?? id), description: desc.trim(), archived };
  };
  const milestones = [
    ...readEach(listMd(join(backlog, "milestones")), warnings, root, milestoneOf(false)),
    ...readEach(listMd(join(backlog, "archive", "milestones")), warnings, root, milestoneOf(true)),
  ];

  const decisions = readEach(listMd(join(backlog, "decisions")), warnings, root, (text, file) => {
    const { data } = parseFrontmatter(text);
    const id = first(data, "id");
    if (id === null) return null;
    return { id: String(id), title: String(first(data, "title") ?? id), status: String(first(data, "status") ?? ""), date: toIso(first(data, "date", "created_date")), path: posix(relative(root, file)) };
  });

  const mainBranch = config.mainBranch;
  const name = String(root).replace(/[\\/]+$/, "").split(/[\\/]/).pop();
  return buildState(
    {
      project: { name: config.projectName ?? name, root: posix(root), mainBranch, language: config.language },
      config,
      tasks,
      drafts,
      milestones,
      decisions,
      events: existsSync(join(root, ".maestro", "events.jsonl")) ? readEvents(root) : [],
      reports: walkReports(root, warnings),
      git: readGit(root, mainBranch),
      runtime: {
        usage: readJson(join(root, ".maestro", "runtime", "usage.json")),
        context: readJson(join(root, ".maestro", "runtime", "context.json")),
      },
      warnings,
      pmUsage: pmUsageReader(root),
    },
    now,
  );
}
