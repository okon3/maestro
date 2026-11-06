// Dashboard state (contract: docs/dashboard-contract.md). Pure builders plus loadState(root), which reads the inputs.
// Read-only: nothing here writes to the project.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { DEFAULTS } from "../lib/config.mjs";
import { readEvents } from "../lib/events.mjs";
import { git } from "../lib/git.mjs";
import { PRICES_AS_OF, PRICES_SOURCE, costUsd } from "./prices.mjs";

const STALE_MS = 30 * 60 * 1000;
const AGENT_RUNNING_MS = 12 * 60 * 60 * 1000;
const CLAIM_WINDOW_MS = 2 * 60 * 1000;
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
  for (const line of m[1].split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
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
    ...acCounts(body),
  };
}

// ---------------------------------------------------------------------------------------------
// Pure state builder.

const isGoal = (t) => t.labels.some((l) => lower(l) === "goal");
const isDone = (t) => DONE_STATUSES.has(lower(t.status));

function buildAgents(events, now) {
  const starts = new Map();
  const stops = new Map();
  for (const e of events) {
    if (!e.agentId) continue;
    if (e.type === "agent.start" && !starts.has(e.agentId)) starts.set(e.agentId, e);
    else if (e.type === "agent.stop") stops.set(e.agentId, e);
  }
  const claims = events.filter((e) => e.type === "task.claim" && e.task).map((e) => ({ e, t: Date.parse(e.ts), used: false }));
  const agents = [];
  const ordered = [...starts.values()].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  for (const s of ordered) {
    const t0 = Date.parse(s.ts);
    const stop = stops.get(s.agentId) ?? null;
    // Claim linking: the first unused claim that follows the start within 2 minutes (the claim names the actor).
    const claim = claims.find((c) => !c.used && c.t >= t0 && c.t - t0 <= CLAIM_WINDOW_MS);
    if (claim) claim.used = true;
    const running = !stop && now - t0 < AGENT_RUNNING_MS;
    agents.push({
      agentId: s.agentId,
      type: s.data?.agentType ?? null,
      actor: claim?.e.actor ?? null,
      task: claim ? normId(claim.e.task) : null,
      state: running ? "running" : "finished",
      since: s.ts,
      until: stop?.ts ?? null,
    });
  }
  return agents.reverse(); // newest first
}

function addTokens(into, from) {
  for (const k of ["input", "output", "cacheRead", "cacheWrite"]) into[k] = (into[k] ?? 0) + (from?.[k] ?? 0);
}

function buildCosts({ events, tasksById, overrides }) {
  const unpriced = new Set();
  const byTask = new Map();
  for (const e of events) {
    if (e.type !== "task.measure" || !e.task) continue;
    const id = normId(e.task);
    const usage = e.data?.usage ?? {};
    const rec = byTask.get(id) ?? { models: {}, wallMs: 0, reworkCycles: 0, ownerInterventions: 0 };
    for (const [model, tok] of Object.entries(usage.models ?? {})) addTokens((rec.models[model] ??= {}), tok);
    rec.wallMs += Number(e.data?.wallMs ?? usage.wallMs ?? 0) || 0;
    // Later measures replace the counters: they are cumulative per task, not per measurement.
    rec.reworkCycles = Number(e.data?.reworkCycles ?? rec.reworkCycles) || 0;
    rec.ownerInterventions = Number(e.data?.ownerInterventions ?? rec.ownerInterventions) || 0;
    if (e.goal && !rec.goal) rec.goal = e.goal;
    byTask.set(id, rec);
  }
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
  return {
    estimate: true,
    tasks: taskRows.map(({ row, usd }) => ({ ...row, usd: round(usd) })),
    goals: [...goals.values()].map((g) => ({ ...g, usd: round(g.usd) })),
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
 * { project, config, tasks[], drafts[], milestones[], decisions[], events[], reports[], git, runtime, warnings[] }
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
  const milestones = (inputs.milestones ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description ?? "",
    archived: !!m.archived,
    goals: goalsList.filter((g) => matches(m, g.milestone)).map(goalView),
    drafts: drafts.filter((d) => matches(m, d.milestone)).map((d) => ({ id: d.id, title: d.title })),
  }));
  const placedGoals = new Set(milestones.flatMap((m) => m.goals.map((g) => g.id)));
  const placedDrafts = new Set(milestones.flatMap((m) => m.drafts.map((d) => d.id)));
  const looseGoals = goalsList.filter((g) => !placedGoals.has(g.id));
  const looseDrafts = drafts.filter((d) => !placedDrafts.has(d.id));
  if (looseGoals.length || looseDrafts.length) {
    milestones.push({
      id: null,
      title: "No milestone",
      description: "",
      archived: false,
      goals: looseGoals.map(goalView),
      drafts: looseDrafts.map((d) => ({ id: d.id, title: d.title })),
    });
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
  const decisions = inputs.decisions ?? [];
  const ownerWaiting =
    decisions.filter((d) => ["open", "proposed"].includes(lower(d.status))).length +
    allTasks.filter((t) => lower(t.status) === "blocked" && !t.archived).length;

  const tags = inputs.git?.tags ?? [];
  const lastCr = tags
    .filter((t) => /^cr\/CR-/.test(t.name))
    .sort((a, b) => (ms(b.date) || 0) - (ms(a.date) || 0))[0];
  const since = lastCr ? ms(lastCr.date) : -Infinity;
  const integratedSinceLast = events.filter((e) => e.type === "task.status" && e.data?.to === "Integrated" && Date.parse(e.ts) > since).length;

  const runtime = inputs.runtime ?? {};
  const overrides = config.prices && typeof config.prices === "object" ? config.prices : {};
  const costs = buildCosts({ events, tasksById, overrides });
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
    },
    milestones,
    tasks,
    agents: buildAgents(events, nowMs),
    decisions: decisions.map((d) => ({ id: d.id, title: d.title, status: d.status, date: d.date, path: d.path ?? null })),
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
    },
    now,
  );
}
