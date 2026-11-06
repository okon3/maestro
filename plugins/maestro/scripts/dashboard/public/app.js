// Maestro dashboard page (contract: docs/dashboard-contract.md, section "Page").
// Plain ES module, no framework, no external requests. Every string from the
// state comes from user files, so it goes through esc() before reaching HTML.

const TABS = [
  { id: "roadmap", label: "Roadmap" },
  { id: "board", label: "Board" },
  { id: "agents", label: "Agents" },
  { id: "decisions", label: "Decisions" },
  { id: "reports", label: "Reports" },
  { id: "costs", label: "Costs" },
];
const COLUMNS = ["To Do", "Ready", "In Progress", "Blocked", "In Review", "Integrated", "Done"];
const FINISHED = new Set(["Integrated", "Done"]);
const OWNER_STATUSES = new Set(["open", "proposed"]);
const REPORT_KINDS = [
  { kind: "task", label: "Task reports" },
  { kind: "qa", label: "QA" },
  { kind: "review", label: "Code reviews" },
];
// Raw token fields as measured (summed for totals).
const TOKEN_FIELDS = [
  ["input", "Input"],
  ["output", "Output"],
  ["cacheRead", "Cache read"],
  ["cacheWrite", "Cache write"],
];
// Columns shown in cost tables. Almost all input goes through the prompt cache, so "uncached" alone looks
// tiny: show the total input first and explain each part on hover.
const TOKEN_COLUMNS = [
  ["inTotal", "Input (total)", "Everything the model read: uncached + cache read + cache write"],
  ["input", "Uncached", "New input not served from or written to the prompt cache"],
  ["cacheRead", "Cache read", "Conversation re-read from the prompt cache on every step (about a tenth of the input price)"],
  ["cacheWrite", "Cache write", "New context written to the prompt cache: files read, tool results"],
  ["output", "Output", "Text and code the model wrote"],
];
const tokenValue = (u, f) =>
  f === "inTotal" ? (Number(u?.input) || 0) + (Number(u?.cacheRead) || 0) + (Number(u?.cacheWrite) || 0) : u?.[f];
const tokenHeads = () => TOKEN_COLUMNS.map(([, l, title]) => `<th scope="col" class="num" title="${title}">${l}</th>`).join("");
const tokenCells = (u) => TOKEN_COLUMNS.map(([f]) => `<td class="num">${fmtTokens(tokenValue(u, f))}</td>`).join("");
const FEED_LIMIT = 30;
const RECENT_AGENTS = 12;

const ui = {
  state: null,
  tab: "roadmap",
  boardAll: false,
  costMetric: "usd",
  report: null, // { path, status: "loading" | "ok" | "error", text, error }
  live: "connecting",
  fetchedAt: 0,
  fetchError: null,
  open: new Set(), // keys of <details> the user opened
};

const $ = (id) => document.getElementById(id);

// ---------- formatting ----------

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function fmtTokens(n) {
  if (n == null || !Number.isFinite(n)) return "–";
  const a = Math.abs(n);
  if (a < 1000) return String(Math.round(n));
  if (a < 1e6) return `${(n / 1e3).toFixed(a < 1e4 ? 1 : 0)}k`;
  return `${(n / 1e6).toFixed(a < 1e7 ? 2 : 1)}M`;
}

export function fmtDuration(ms) {
  if (ms == null || !Number.isFinite(ms)) return "–";
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** Coarse elapsed time for live counters, which refresh every 15 s: "under a minute", "22 min", "1h 05m". */
export function fmtSince(ms) {
  if (ms == null || !Number.isFinite(ms)) return "–";
  const m = Math.floor(Math.max(0, ms) / 60000);
  if (m < 1) return "under a minute";
  if (m < 60) return `${m} min`;
  return fmtDuration(m * 60000);
}

export function fmtPct(n) {
  if (n == null || !Number.isFinite(Number(n))) return "–";
  return `${Math.round(Number(n))}%`;
}

export function fmtUsd(n) {
  if (n == null || !Number.isFinite(n)) return "–";
  return `$${n.toFixed(2)}`;
}

function toMs(iso) {
  const t = typeof iso === "number" ? iso : Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

export function relTime(iso, now = Date.now()) {
  const t = toMs(iso);
  if (t == null) return "";
  const d = Math.round((now - t) / 1000);
  const future = d < 0;
  const a = Math.abs(d);
  let s;
  if (a < 10) return "just now";
  if (a < 60) s = `${a}s`;
  else if (a < 3600) s = `${Math.floor(a / 60)} min`;
  else if (a < 86400) s = `${Math.floor(a / 3600)}h ${String(Math.floor((a % 3600) / 60)).padStart(2, "0")}m`;
  else s = `${Math.floor(a / 86400)}d`;
  return future ? `in ${s}` : `${s} ago`;
}

function absTime(iso) {
  const t = toMs(iso);
  return t == null ? "" : new Date(t).toLocaleString();
}

function clockTime(iso) {
  const t = toMs(iso);
  return t == null ? "" : new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** A <time> that the ticker keeps current. mode "rel" = "5 min ago", "since" = elapsed duration. */
function timeEl(iso, mode = "rel") {
  const t = toMs(iso);
  if (t == null) return "";
  const text = mode === "since" ? fmtSince(Date.now() - t) : relTime(t);
  return `<time datetime="${esc(new Date(t).toISOString())}" data-${mode}="${t}" title="${esc(absTime(t))}">${esc(text)}</time>`;
}

function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** "Opus 5.5" for a measured model; "planned: Opus" (muted) for a family named only in the plan. */
function modelTag(model, planned) {
  if (!model) return "";
  const name = planned ? String(model).replace(/^./, (c) => c.toUpperCase()) : modelName(model);
  return `<span class="model-tag${planned ? " is-planned" : ""}" title="${esc(planned ? `Planned model (not yet measured): ${model}` : model)}">${esc(planned ? `planned: ${name}` : name)}</span>`;
}

function modelName(id) {
  const m = /^claude-([a-z]+)-(\d+)-(\d+)(.*)$/.exec(id || "");
  if (!m) return id || "unknown";
  const rest = m[4].replace(/^-/, "").replace(/-/g, " ");
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}.${m[3]}${rest ? ` ${rest}` : ""}`;
}

function totalTokens(models) {
  let sum = 0;
  for (const usage of Object.values(models || {})) {
    for (const [field] of TOKEN_FIELDS) sum += Number(usage?.[field]) || 0;
  }
  return sum;
}

function statusSlug(status) {
  return String(status || "unknown").toLowerCase().replace(/[^a-z]+/g, "-");
}

function roleOf(type, actor) {
  const t = String(type || "").replace(/^maestro:/, "");
  const a = String(actor || "");
  if (/implementer/.test(t) || /^impl/.test(a)) return { key: "impl", label: "Implementer" };
  if (/architect/.test(t) || /^arch/.test(a)) return { key: "arch", label: "Architect" };
  if (/qa/.test(t) || a === "qa") return { key: "qa", label: "QA explorer" };
  if (/review/.test(t) || a === "reviewer") return { key: "rev", label: "Code reviewer" };
  if (a === "pm") return { key: "pm", label: "PM" };
  if (a === "owner") return { key: "owner", label: "Owner" };
  return { key: "sys", label: t || "Agent" };
}

function idEl(id) {
  return `<span class="id">${esc(id)}</span>`;
}

function empty(title, body) {
  return `<div class="empty"><p class="empty-title">${esc(title)}</p>${body ? `<p>${body}</p>` : ""}</div>`;
}

function details(key, summary, body, cls = "") {
  const open = ui.open.has(key) ? " open" : "";
  return `<details class="${cls}" data-key="${esc(key)}"${open}><summary>${summary}</summary>${body}</details>`;
}

// ---------- derived data ----------

function lists(s) {
  return {
    milestones: Array.isArray(s?.milestones) ? s.milestones : [],
    tasks: Array.isArray(s?.tasks) ? s.tasks : [],
    agents: Array.isArray(s?.agents) ? s.agents : [],
    decisions: Array.isArray(s?.decisions) ? s.decisions : [],
    reports: Array.isArray(s?.reports) ? s.reports : [],
    events: Array.isArray(s?.events) ? s.events : [],
  };
}

function goalIndex(s) {
  const map = new Map();
  for (const ms of lists(s).milestones) for (const g of ms.goals || []) map.set(g.id, g);
  return map;
}

function runningByTask(s) {
  const map = new Map();
  for (const a of lists(s).agents) if (a.state === "running" && a.task) map.set(a.task, a);
  return map;
}

function naturalCompare(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

// ---------- header ----------

function renderHeader(s) {
  const p = s.project || {};
  $("project").textContent = p.name || "Maestro";
  $("project").title = p.root || "";
  document.title = p.name ? `${p.name}: Maestro dashboard` : "Maestro dashboard";
  const h = s.header || {};
  $("gauges").innerHTML = [goalGauge(s, h.activeGoal), mainGauge(p, h.main), reviewGauge(h.review), contextGauge(h.context), usageGauge(h.usage), ownerGauge(s, h.ownerWaiting)].join("");
}

function gauge(cls, label, body, extra = "") {
  return `<div class="gauge ${cls}"${extra}><p class="gauge-label">${label}</p>${body}</div>`;
}

function staleMark(part) {
  if (!part?.stale) return "";
  return `<span class="stale" title="Last reading ${esc(absTime(part.ts))}">stale, ${esc(relTime(part.ts))}</span>`;
}

function goalGauge(s, goal) {
  if (!goal) return gauge("g-goal", "Active GOAL", `<p class="gauge-value muted">No GOAL in progress</p><p class="gauge-sub">The roadmap shows what comes next.</p>`);
  const tasks = lists(s).tasks.filter((t) => t.goal === goal.id);
  const order = ["Done", "Integrated", "In Review", "In Progress", "Blocked", "Ready", "To Do"];
  tasks.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || naturalCompare(a.id, b.id));
  const done = Number(goal.done) || 0;
  const total = Number(goal.total) || 0;
  const strip = tasks.length
    ? `<div class="measure" role="img" aria-label="${esc(`${done} of ${total} tasks done`)}">${tasks
        .map((t) => `<span class="seg s-${statusSlug(t.status)}" title="${esc(`${t.id} ${t.title}: ${t.status}`)}"></span>`)
        .join("")}</div>`
    : `<div class="meter"><span style="width:${total ? Math.round((done / total) * 100) : 0}%"></span></div>`;
  return gauge(
    "g-goal",
    "Active GOAL",
    `<p class="gauge-value">${idEl(goal.id)} <span class="goal-name">${esc(goal.title)}</span></p>${strip}<p class="gauge-sub"><strong>${done}</strong> of ${total} tasks integrated or done</p>`,
  );
}

function mainGauge(project, main) {
  const branch = esc(project.mainBranch || "main");
  if (!main) return gauge("g-main", `Branch ${branch}`, `<p class="gauge-value muted">No commits yet</p>`);
  return gauge(
    "g-main",
    `Branch ${branch}`,
    `<p class="gauge-value">${idEl(main.sha)}</p><p class="gauge-sub subject" title="${esc(main.subject)}">${esc(main.subject)}</p><p class="gauge-sub">${timeEl(main.date)}</p>`,
  );
}

function reviewGauge(review) {
  if (!review) return gauge("g-review", "Code review", `<p class="gauge-value muted">No data</p>`);
  const n = Number(review.integratedSinceLast) || 0;
  const every = Number(review.every) || 0;
  const due = every > 0 && n >= every;
  const pct = every ? Math.min(100, Math.round((n / every) * 100)) : 0;
  const since = review.lastReview ? `since ${idEl(review.lastReview)}` : "since the start";
  return gauge(
    `g-review${due ? " lvl-warn" : ""}`,
    "Code review",
    `<p class="gauge-value"><strong>${n}</strong><span class="of">/ ${every}</span></p><div class="meter"><span style="width:${pct}%"></span></div><p class="gauge-sub">${due ? "Review due: " : ""}integrated ${since}</p>`,
  );
}

function level(pct, warn, serious) {
  if (pct >= serious) return "lvl-serious";
  if (pct >= warn) return "lvl-warn";
  return "";
}

function contextGauge(ctx) {
  if (!ctx || ctx.percent == null) return gauge("g-context", "PM context", `<p class="gauge-value muted">No reading yet</p>`);
  const pct = Number(ctx.percent);
  // Spec section 11: at 50% no new GOAL starts; at 65% the PM writes the handoff.
  const lvl = level(pct, 50, 65);
  const note = pct >= 65 ? "Handoff time" : pct >= 50 ? "No new GOAL" : "Room to work";
  return gauge(
    `g-context ${lvl}${ctx.stale ? " is-stale" : ""}`,
    "PM context",
    `<p class="gauge-value"><strong>${fmtPct(pct)}</strong></p><div class="meter ticks"><span style="width:${Math.min(100, pct)}%"></span><i style="left:50%"></i><i style="left:65%"></i></div><p class="gauge-sub">${note} ${staleMark(ctx)}</p>`,
  );
}

function usageGauge(u) {
  if (!u || (u.fiveHour == null && u.sevenDay == null)) return gauge("g-usage", "Plan usage", `<p class="gauge-value muted">No reading yet</p>`);
  const five = Number(u.fiveHour);
  const week = Number(u.sevenDay);
  // Spec section 11: above 85% no long task starts; above 95% the PM pauses.
  const lvl = level(Math.max(five || 0, week || 0), 85, 95);
  const reset = u.resetsAt ? `Resets ${timeEl(Number(u.resetsAt) * 1000)}` : "";
  return gauge(
    `g-usage ${lvl}${u.stale ? " is-stale" : ""}`,
    "Plan usage",
    `<div class="pair">${usagePart("5 hours", five)}${usagePart("Week", week)}</div><p class="gauge-sub">${reset} ${staleMark(u)}</p>`,
  );
}

function usagePart(label, pct) {
  const ok = Number.isFinite(pct);
  return `<p class="${ok ? level(pct, 85, 95) : ""}"><span class="pair-label">${label}</span><strong>${fmtPct(pct)}</strong><span class="meter"><span style="width:${ok ? Math.min(100, pct) : 0}%"></span></span></p>`;
}

function ownerGauge(s, count) {
  const n = Number(count) || 0;
  const questions = Number(s.header?.ownerQuestions) || 0;
  const { decisions, tasks } = lists(s);
  const open = decisions.filter((d) => d.blocking).length;
  const blocked = tasks.filter((t) => t.status === "Blocked" && !t.archived).length;
  const parts = [];
  if (open) parts.push(plural(open, "decision"));
  if (blocked) parts.push(plural(blocked, "blocked task"));
  const more = questions ? `<span class="gauge-sub quiet-count">${plural(questions, "open question")}, not blocking</span>` : "";
  const body = n
    ? `<span class="gauge-value"><strong>${n}</strong></span><span class="gauge-sub">${esc(parts.join(", ") || "items")} blocking</span>${more}`
    : `<span class="gauge-value muted">Nothing blocking</span><span class="gauge-sub">No decision or block stops the work</span>${more}`;
  return `<button type="button" class="gauge g-owner${n ? " lvl-owner" : ""}" data-goto="decisions" id="owner-gauge"><span class="gauge-label">Waiting for you</span>${body}</button>`;
}

// ---------- tabs ----------

function tabCount(s, id) {
  const l = lists(s);
  switch (id) {
    case "board": {
      const g = s.header?.activeGoal?.id;
      return g ? l.tasks.filter((t) => t.goal === g).length : null;
    }
    case "agents":
      return l.agents.filter((a) => a.state === "running").length || null;
    case "decisions":
      return l.decisions.filter((d) => d.blocking).length + l.tasks.filter((t) => t.status === "Blocked" && !t.archived).length || null;
    case "reports":
      return l.reports.length || null;
    default:
      return null;
  }
}

function renderTabs(s) {
  $("tabs").innerHTML = TABS.map((t) => {
    const on = t.id === ui.tab;
    const n = s ? tabCount(s, t.id) : null;
    const alert = t.id === "decisions" && n ? " alert" : "";
    return `<button type="button" role="tab" id="tab-${t.id}" class="tab${on ? " on" : ""}" aria-selected="${on}" aria-controls="view" data-tab="${t.id}">${esc(t.label)}${n != null ? `<span class="count${alert}">${n}</span>` : ""}</button>`;
  }).join("");
}

// ---------- roadmap ----------

function renderRoadmap(s) {
  const { milestones } = lists(s);
  if (!milestones.length) return empty("No milestones yet", "Milestones and their GOALs appear here once the PM plans them in <code>backlog/milestones/</code>.");
  const goals = goalIndex(s);
  const activeId = s.header?.activeGoal?.id;
  const live = milestones.filter((m) => !m.archived && !m.completed);
  const completed = milestones.filter((m) => !m.archived && m.completed);
  const archived = milestones.filter((m) => m.archived);
  let html = live.map((m) => milestoneBlock(m, goals, activeId)).join("");
  if (!live.length) html += empty(completed.length ? "Every milestone is completed" : "Every milestone is archived", "");
  if (completed.length) {
    html += details("completed-milestones", `Completed milestones <span class="count">${completed.length}</span>`, completed.map((m) => milestoneBlock(m, goals, activeId)).join(""), "archived");
  }
  if (archived.length) {
    html += details("archived-milestones", `Archived milestones <span class="count">${archived.length}</span>`, archived.map((m) => milestoneBlock(m, goals, activeId)).join(""), "archived");
  }
  return `<div class="roadmap">${html}</div>`;
}

function milestoneBlock(m, goals, activeId) {
  const list = m.goals || [];
  const doneGoals = list.filter((g) => g.status === "Done").length;
  const drafts = m.drafts || [];
  const rows = list.length
    ? `<ol class="goal-rows">${list.map((g) => goalRow(g, goals, activeId)).join("")}</ol>`
    : `<p class="quiet">No GOALs in this milestone yet.</p>`;
  const draftBlock = drafts.length
    ? details(`drafts-${m.id}`, `${plural(drafts.length, "draft")}`, `<ul class="drafts">${drafts.map((d) => `<li>${idEl(d.id)} ${esc(d.title)}</li>`).join("")}</ul>`, "drafts-box")
    : "";
  const loose = m.tasks || [];
  const looseBlock = loose.length
    ? `<div class="loose-tasks"><h3 class="loose-head">No GOAL <span class="count">${loose.length}</span></h3><ul class="loose-list">${loose
        .map((t) => `<li class="loose-row">${idEl(t.id)}<span class="loose-title">${esc(t.title)}</span><span class="status s-${statusSlug(t.status)}">${esc(t.status)}</span></li>`)
        .join("")}</ul></div>`
    : "";
  const noGoals = !list.length && !loose.length ? `<p class="quiet">No GOALs in this milestone yet.</p>` : "";
  return `<section class="milestone${m.archived ? " is-archived" : ""}${m.completed ? " is-completed" : ""}">
    <header class="ms-head"><h2>${esc(m.title || m.id || "No milestone")}</h2>${m.completed ? `<span class="badge b-done">completed</span>` : ""}<p class="ms-count">${list.length ? `${doneGoals} of ${plural(list.length, "GOAL")} done` : ""}</p>${m.description ? `<p class="ms-desc">${esc(m.description)}</p>` : ""}</header>
    ${list.length ? rows : noGoals}${looseBlock}${draftBlock}</section>`;
}

function goalRow(g, goals, activeId) {
  const done = Number(g.done) || 0;
  const total = Number(g.total) || 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const isDone = g.status === "Done";
  const cls = [g.id === activeId ? "is-active" : "", isDone ? "is-done" : "", g.proposed ? "is-proposed" : ""].join(" ");
  const deps = (g.dependencies || []).map((id) => {
    const dep = goals.get(id);
    const met = dep && dep.status === "Done";
    const name = dep ? `${id} ${dep.title}` : id;
    return `<span class="dep${met ? " met" : ""}" title="${esc(met ? `${name} is done` : `Waits for ${name}`)}">${met ? "after" : "waits for"} ${idEl(id)}${dep ? ` ${esc(shortTitle(dep.title))}` : ""}</span>`;
  });
  return `<li class="goal-row ${cls}">
    <span class="goal-id">${idEl(g.id)}</span>
    <div class="goal-main"><p class="goal-title">${esc(g.title)}${g.id === activeId ? ` <span class="badge b-active">active</span>` : ""}${g.proposed ? ` <span class="badge b-proposed" title="Proposed by the PM, not yet approved by the owner">proposed</span>` : ""}</p>${deps.length ? `<p class="deps">${deps.join("")}</p>` : ""}</div>
    <span class="status s-${statusSlug(g.status)}">${esc(g.status)}</span>
    <div class="goal-progress">${total ? `<div class="meter"><span style="width:${pct}%"></span></div><span class="frac">${done}/${total}</span>` : `<span class="quiet">no tasks yet</span>`}</div>
  </li>`;
}

function shortTitle(title) {
  const t = String(title || "");
  return t.length > 28 ? `${t.slice(0, 27)}…` : t;
}

// ---------- board ----------

function renderBoard(s) {
  const { tasks } = lists(s);
  const goal = s.header?.activeGoal;
  const showAll = ui.boardAll || !goal;
  const shown = showAll ? tasks : tasks.filter((t) => t.goal === goal.id);
  const statusOf = new Map(tasks.map((t) => [t.id, t.status]));
  const running = runningByTask(s);
  const toggle = `<div class="toolbar"><div class="seg-toggle" role="group" aria-label="Tasks shown">
      <button type="button" id="board-goal" data-board="goal" aria-pressed="${!showAll}"${goal ? "" : " disabled"}>${goal ? `Active GOAL ${idEl(goal.id)}` : "No active GOAL"}</button>
      <button type="button" id="board-all" data-board="all" aria-pressed="${showAll}">All tasks <span class="count">${tasks.length}</span></button>
    </div>${goal && !showAll ? `<p class="quiet">${esc(goal.title)}</p>` : ""}</div>`;
  if (!shown.length) {
    return toggle + empty(showAll ? "No tasks yet" : "This GOAL has no tasks yet", showAll ? "Tasks appear here when the architect breaks a GOAL into waves." : "The architect has not written the first wave yet.");
  }
  const extra = shown.filter((t) => !COLUMNS.includes(t.status));
  const cols = COLUMNS.map((name) => {
    const items = shown.filter((t) => t.status === name).sort((a, b) => naturalCompare(a.id, b.id));
    return `<section class="col c-${statusSlug(name)}" aria-label="${esc(name)}"><h2 class="col-head"><span class="status s-${statusSlug(name)}">${esc(name)}</span><span class="count">${items.length}</span></h2>${items.map((t) => taskCard(t, statusOf, running, showAll)).join("") || `<p class="col-empty">None</p>`}</section>`;
  }).join("");
  const other = extra.length
    ? `<p class="quiet other-status">Tasks with another status: ${extra.map((t) => `${idEl(t.id)} (${esc(t.status)})`).join(", ")}</p>`
    : "";
  return `${toggle}<div class="board">${cols}</div>${other}`;
}

function taskCard(t, statusOf, running, showGoal) {
  const acTotal = Number(t.acTotal) || 0;
  const acDone = Number(t.acDone) || 0;
  const agent = running.get(t.id);
  const who = (t.assignees || []).map((a) => `<span class="who">${esc(a)}</span>`).join(" ");
  const deps = (t.dependencies || []).map((id) => {
    const st = statusOf.get(id);
    const met = FINISHED.has(st);
    return `<span class="dep${met ? " met" : ""}" title="${esc(`${id}: ${st || "unknown status"}`)}">${met ? "after" : "waits for"} ${idEl(id)}</span>`;
  });
  return `<article class="card s-${statusSlug(t.status)}${t.archived ? " is-archived" : ""}">
    <p class="card-top">${idEl(t.id)}${showGoal && t.goal ? `<span class="card-goal">${esc(t.goal)}</span>` : ""}${t.archived ? `<span class="badge b-archived">archived</span>` : ""}</p>
    <h3 class="card-title">${esc(t.title)}</h3>
    ${acTotal ? `<div class="ac" title="${acDone} of ${acTotal} acceptance criteria met: the implementer checks each one when its named test passes; the architect re-checks them at review"><div class="meter"><span style="width:${Math.round((acDone / acTotal) * 100)}%"></span></div><span class="frac">criteria ${acDone}/${acTotal}</span></div>` : ""}
    ${who || agent ? `<p class="card-who">${who}${agent ? `<span class="working" title="Agent ${esc(agent.agentId)} running">working ${timeEl(agent.since, "since")}</span>${modelTag(agent.model, agent.modelPlanned)}` : ""}</p>` : ""}
    ${deps.length ? `<p class="deps">${deps.join("")}</p>` : ""}
  </article>`;
}

// ---------- agents ----------

// What an agent without a claimed task is doing: only implementers claim tasks.
function agentDuty(roleKey, goal, mission) {
  const g = goal ? ` ${idEl(goal.id)}` : "";
  const text = {
    arch: `Leading GOAL${g}: planning waves, reviewing, integrating`,
    qa: mission ? `Exploratory QA ${idEl(mission)}` : `Exploratory QA mission${g ? ` for${g}` : ""}`,
    rev: mission ? `Code review ${idEl(mission)}` : "Periodic code review",
    impl: "Starting: no task claimed yet",
  }[roleKey];
  return text ?? `<span class="quiet">No task claimed</span>`;
}

function renderAgents(s) {
  const { agents, tasks } = lists(s);
  const titles = new Map(tasks.map((t) => [t.id, t.title]));
  const running = agents.filter((a) => a.state === "running").sort((a, b) => (toMs(a.since) ?? 0) - (toMs(b.since) ?? 0));
  const recent = agents
    .filter((a) => a.state !== "running")
    .sort((a, b) => (toMs(b.until ?? b.since) ?? 0) - (toMs(a.until ?? a.since) ?? 0))
    .slice(0, RECENT_AGENTS);
  if (!agents.length) return empty("No agents have run yet", "Subagents appear here as soon as the PM or the architect starts one.");
  const cards = running.length
    ? `<div class="agent-grid">${running
        .map((a) => {
          const r = roleOf(a.type, a.actor);
          return `<article class="agent r-${r.key}"><p class="agent-head"><span class="pulse" aria-hidden="true"></span><strong>${esc(a.actor || r.label)}</strong><span class="agent-role">${esc(r.label)}</span>${modelTag(a.model, a.modelPlanned)}</p>
          <p class="agent-task">${a.task ? `${idEl(a.task)} ${esc(titles.get(a.task) || "")}` : agentDuty(r.key, s.header?.activeGoal, a.mission)}</p>
          <p class="agent-since">Running for <strong>${timeEl(a.since, "since")}</strong><span class="quiet"> since ${esc(clockTime(a.since))}</span></p></article>`;
        })
        .join("")}</div>`
    : `<p class="quiet block">No agent is running right now.</p>`;
  const table = recent.length
    ? `<table class="data"><thead><tr><th scope="col">Agent</th><th scope="col">Role</th><th scope="col">Model</th><th scope="col">Task</th><th scope="col">Started</th><th scope="col" class="num">Ran for</th><th scope="col">Finished</th></tr></thead><tbody>${recent
        .map((a) => {
          const r = roleOf(a.type, a.actor);
          const ran = toMs(a.until) != null && toMs(a.since) != null ? fmtDuration(toMs(a.until) - toMs(a.since)) : "–";
          return `<tr><td><span class="role-dot r-${r.key}"></span>${esc(a.actor || a.agentId)}</td><td>${esc(r.label)}</td><td>${modelTag(a.model, a.modelPlanned) || `<span class="quiet">unknown</span>`}</td><td>${a.task ? `${idEl(a.task)} <span class="quiet">${esc(shortTitle(titles.get(a.task) || ""))}</span>` : a.mission ? `${idEl(a.mission)} <span class="quiet">${r.key === "qa" ? "QA mission" : "code review"}</span>` : `<span class="quiet">none</span>`}</td><td>${esc(clockTime(a.since))} <span class="quiet">${esc(dayLabel(a.since))}</span></td><td class="num">${ran}</td><td>${a.until ? timeEl(a.until) : `<span class="quiet">${esc(a.state || "unknown")}</span>`}</td></tr>`;
        })
        .join("")}</tbody></table>`
    : `<p class="quiet block">No finished agents yet.</p>`;
  return `<section class="panel"><h2 class="section-title">Running <span class="count">${running.length}</span></h2>${cards}</section>
    <section class="panel"><h2 class="section-title">Recently finished</h2>${table}</section>`;
}

function dayLabel(iso) {
  const t = toMs(iso);
  if (t == null) return "";
  const d = new Date(t);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "today";
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

// ---------- decisions ----------

function renderDecisions(s) {
  const { decisions } = lists(s);
  if (!decisions.length) return empty("No decisions recorded", "Decisions land in <code>backlog/decisions/</code>; open ones wait here for you.");
  const byDate = (a, b) => (toMs(b.date) ?? 0) - (toMs(a.date) ?? 0);
  const blocking = decisions.filter((d) => d.blocking).sort(byDate);
  const questions = decisions.filter((d) => OWNER_STATUSES.has(d.status) && !d.blocking).sort(byDate);
  const settled = decisions.filter((d) => !OWNER_STATUSES.has(d.status)).sort(byDate);
  const head = blocking.length
    ? `<p class="callout owner">${plural(blocking.length, "decision")} ${blocking.length === 1 ? "is" : "are"} blocking the active GOAL. Answer the PM in the session; the page updates when the file changes.</p>`
    : `<p class="callout calm">No decision is blocking the work.</p>`;
  const group = (title, hint, list) =>
    list.length ? `<h2 class="list-head">${esc(title)} <span class="count">${list.length}</span></h2><p class="quiet group-hint">${esc(hint)}</p><ul class="decisions">${list.map(decisionRow).join("")}</ul>` : "";
  return `${head}${group("Blocking", "Open, and named by the active GOAL, its tasks or a blocked task.", blocking)}${group("Open questions", "Open, but nothing in progress depends on them.", questions)}${group("Settled", "Accepted, rejected or superseded.", settled)}`;
}

function decisionRow(d) {
  const owner = d.blocking;
  const title = d.path
    ? `<button type="button" class="link" data-report="${esc(d.path)}" data-title="${esc(d.title)}">${esc(d.title)}</button>`
    : `<span>${esc(d.title)}</span>`;
  const open = d.path && ui.report?.path === d.path;
  const label = owner ? "blocking" : OWNER_STATUSES.has(d.status) ? "open question" : d.status;
  return `<li class="decision${owner ? " is-owner" : ""}${open ? " is-open" : ""}"><span class="dec-id">${idEl(d.id)}</span><p class="dec-title">${title}</p><span class="badge d-${statusSlug(d.status)}">${esc(label)}</span><span class="dec-date">${timeEl(d.date)}</span></li>${open ? `<li class="dec-viewer">${viewer()}</li>` : ""}`;
}

// ---------- reports ----------

function renderReports(s) {
  const { reports } = lists(s);
  if (!reports.length) return empty("No reports yet", "Implementers, QA and the code reviewer write their reports in <code>.maestro/reports/</code>.");
  const known = new Set(REPORT_KINDS.map((k) => k.kind));
  const groups = [...REPORT_KINDS, { kind: null, label: "Other" }].map((k) => {
    const items = reports.filter((r) => (k.kind ? r.kind === k.kind : !known.has(r.kind))).sort((a, b) => (toMs(b.mtime) ?? 0) - (toMs(a.mtime) ?? 0));
    if (!items.length) return "";
    return `<h2 class="list-head">${esc(k.label)} <span class="count">${items.length}</span></h2><ul class="report-list">${items
      .map((r) => {
        const on = ui.report?.path === r.path;
        return `<li><button type="button" class="report-item${on ? " on" : ""}" aria-current="${on}" data-report="${esc(r.path)}" data-title="${esc(r.title)}">${idEl(r.id)}<span class="report-title">${esc(stripId(r.title, r.id))}</span><span class="report-time">${timeEl(r.mtime)}</span></button></li>`;
      })
      .join("")}</ul>`;
  });
  const selected = ui.report && reports.some((r) => r.path === ui.report.path);
  return `<div class="reports"><nav class="report-nav" aria-label="Reports" data-keep-scroll="report-nav">${groups.join("")}</nav><div class="report-pane">${selected ? viewer() : empty("Pick a report", "Its Markdown opens here as readable text.")}</div></div>`;
}

function stripId(title, id) {
  const t = String(title || "");
  return id && t.startsWith(`${id} `) ? t.slice(String(id).length + 1) : t;
}

/** Split a leading YAML front matter block into simple key: value fields (quotes removed) and the body. */
export function splitFront(src) {
  const text = String(src ?? "").replace(/\r\n?/g, "\n");
  const m = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);
  if (!m) return { fields: {}, body: text };
  const fields = {};
  for (const line of m[1].split("\n")) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (kv) fields[kv[1].toLowerCase()] = kv[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return { fields, body: text.slice(m[0].length) };
}

function viewer() {
  const r = ui.report;
  if (!r) return "";
  let body;
  if (r.status === "loading") body = `<p class="quiet">Loading ${esc(r.path)}</p>`;
  else if (r.status === "error" && !r.text) body = `<p class="callout error">Could not load ${esc(r.path)}: ${esc(r.error)}</p>`;
  else if (r.path.startsWith("backlog/decisions/")) {
    const { fields, body: text } = splitFront(r.text);
    const dl = ["title", "status", "date"]
      .filter((k) => fields[k])
      .map((k) => `<div><dt>${k[0].toUpperCase()}${k.slice(1)}</dt><dd>${k === "date" ? esc(fields[k].slice(0, 10)) : esc(fields[k])}</dd></div>`)
      .join("");
    body = `${dl ? `<dl class="stats dec-fields">${dl}</dl>` : ""}<div class="md">${md(text)}</div>${r.status === "error" ? `<p class="quiet">Last refresh failed: ${esc(r.error)}</p>` : ""}`;
  } else body = `<div class="md">${md(r.text)}</div>${r.status === "error" ? `<p class="quiet">Last refresh failed: ${esc(r.error)}</p>` : ""}`;
  return `<article class="viewer" aria-label="${esc(r.title || r.path)}"><p class="viewer-path">${esc(r.path)}</p>${body}</article>`;
}

/** Markdown-lite: headings, lists, checkboxes, code blocks, quotes, tables, emphasis. Escapes everything. */
export function md(src) {
  const lines = String(src ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let para = [];
  let list = null;
  let i = 0;
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`); // reports put one fact per line
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.type}>${list.items.map((it) => `<li${it.cls ? ` class="${it.cls}"` : ""}>${it.html}</li>`).join("")}</${list.type}>`);
    list = null;
  };
  const flush = () => {
    flushPara();
    flushList();
  };
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) {
      out.push(`<pre class="md-front">${esc(lines.slice(1, end).join("\n"))}</pre>`);
      i = end + 1;
    }
  }
  for (; i < lines.length; i++) {
    const line = lines[i];
    let m;
    if ((m = /^\s*(`{3,}|~{3,})\s*([\w+-]*)/.exec(line))) {
      flush();
      const fence = m[1];
      const code = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith(fence); i++) code.push(lines[i]);
      out.push(`<pre class="md-code"${m[2] ? ` data-lang="${esc(m[2])}"` : ""}><code>${esc(code.join("\n"))}</code></pre>`);
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    if (/^\s*<!--.*-->\s*$/.test(line)) continue;
    if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) {
      flush();
      const lvl = Math.min(6, m[1].length + 2);
      out.push(`<h${lvl} class="md-h md-h${m[1].length}">${inline(m[2])}</h${lvl}>`);
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      out.push("<hr>");
      continue;
    }
    if ((m = /^\s*>\s?(.*)$/.exec(line))) {
      flush();
      const quote = [m[1]];
      while (i + 1 < lines.length && (m = /^\s*>\s?(.*)$/.exec(lines[i + 1]))) {
        quote.push(m[1]);
        i++;
      }
      out.push(`<blockquote>${inline(quote.join(" "))}</blockquote>`);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flush();
      const rows = [line];
      while (i + 1 < lines.length && /^\s*\|.*\|\s*$/.test(lines[i + 1])) rows.push(lines[++i]);
      out.push(table(rows));
      continue;
    }
    if ((m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line))) {
      flushPara();
      const type = /\d/.test(m[2]) ? "ol" : "ul";
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      let text = m[3];
      let check = "";
      const box = /^\[([ xX])\]\s+(.*)$/.exec(text);
      if (box) {
        const done = box[1] !== " ";
        check = `<span class="md-check${done ? " done" : ""}" role="img" aria-label="${done ? "checked" : "not checked"}"></span>`;
        text = box[2];
      }
      const cls = [m[1].length >= 2 ? "nested" : "", box ? "task" : ""].filter(Boolean).join(" ");
      list.items.push({ html: check + inline(text), cls });
      continue;
    }
    if (list && /^\s{2,}\S/.test(line)) {
      list.items[list.items.length - 1].html += ` ${inline(line.trim())}`;
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return out.join("\n");
}

function table(rows) {
  const cells = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const body = rows.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r));
  if (!body.length) return "";
  const [head, ...rest] = body;
  return `<div class="md-table"><table><thead><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rest
    .map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div>`;
}

function inline(raw) {
  return String(raw)
    .split(/(`[^`]+`)/)
    .map((part, k) => {
      if (k % 2) return `<code>${esc(part.slice(1, -1))}</code>`;
      return esc(part)
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<em>$2</em>")
        .replace(/(^|[^_\w])_([^_\s][^_]*?)_(?!\w)/g, "$1<em>$2</em>")
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 <span class="md-url">($2)</span>');
    })
    .join("");
}

// ---------- costs ----------

function renderCosts(s) {
  const c = s.costs || {};
  const tasks = Array.isArray(c.tasks) ? c.tasks : [];
  const goals = Array.isArray(c.goals) ? c.goals : [];
  const unpriced = new Set(Array.isArray(c.unpriced) ? c.unpriced : []);
  if (!tasks.length && !goals.length) {
    return empty("No costs yet", "A GOAL's full cost appears once the PM starts it (<code>goal.start</code>); the architect also records tokens, wall time, rework and owner interventions per task when it is integrated (<code>maestro measure</code>).");
  }
  const note = `<div class="estimate-note"><p><strong>USD is a list-price estimate</strong>, not a bill: tokens × list price per million tokens${c.pricesSource ? `, prices from <span class="src">${esc(c.pricesSource)}</span>` : ""}. Tokens, wall time, rework and interventions are measured.</p><p>The full cost of a GOAL counts everything that ran between its start and its close: the PM session in that window and every agent started in it, with each agent's tokens as of its last stop.</p>${
    unpriced.size
      ? `<p class="unpriced-note"><span class="flag">unpriced</span> No list price for ${[...unpriced].map((m) => `<code>${esc(m)}</code>`).join(", ")}: its tokens are counted, its cost is not, and totals that include it show no USD.</p>`
      : ""
  }</div>`;
  const reworkByGoal = new Map();
  for (const t of tasks) {
    const g = reworkByGoal.get(t.goal) || { rework: 0, owner: 0 };
    g.rework += Number(t.reworkCycles) || 0;
    g.owner += Number(t.ownerInterventions) || 0;
    reworkByGoal.set(t.goal, g);
  }
  const goalBlocks = goals.length
    ? `<div class="goal-costs">${goals.map((g) => goalCost(g, reworkByGoal.get(g.goal), unpriced)).join("")}</div>`
    : `<p class="quiet block">No GOAL totals yet.</p>`;
  return `${note}
    <section class="panel"><h2 class="section-title">Per GOAL</h2>${goalBlocks}</section>
    ${tasks.length ? `<section class="panel"><h2 class="section-title">Per task</h2>${costChart(tasks, unpriced)}${costTable(tasks, unpriced)}</section>` : ""}`;
}

function usdCell(usd, models, unpriced) {
  const hasUnpriced = Object.keys(models || {}).some((m) => unpriced.has(m));
  if (usd == null) return `<span class="flag" title="Includes a model with no list price">unpriced</span>`;
  return `${fmtUsd(usd)}${hasUnpriced ? ` <span class="flag" title="Excludes tokens of a model with no list price">partial</span>` : ""}`;
}

function modelLabel(id, unpriced) {
  return `<span class="model" title="${esc(id)}">${esc(modelName(id))}</span>${unpriced.has(id) ? ` <span class="flag">unpriced</span>` : ""}`;
}

// Roles of the full GOAL cost, in the order the work flows (keys match costs.goals[].breakdown[].role).
const COST_ROLES = [
  ["pm", "PM", "pm"],
  ["architect", "Architect", "arch"],
  ["implementer", "Implementers", "impl"],
  ["qa", "QA", "qa"],
  ["reviewer", "Reviewer", "rev"],
  ["other", "Other", "sys"],
];

function goalCost(g, extra, unpriced) {
  const full = Array.isArray(g.breakdown) ? fullGoalCost(g, unpriced) : "";
  const models = Object.entries(g.models || {});
  const tasks = Number(g.tasks) || 0;
  const rows = models
    .map(([id, u]) => `<tr><th scope="row">${modelLabel(id, unpriced)}</th>${tokenCells(u)}</tr>`)
    .join("");
  const measured = tasks
    ? `<dl class="stats">
      <div><dt>Est. USD</dt><dd class="usd">${usdCell(g.usd, g.models, unpriced)}</dd></div>
      <div><dt>Tasks measured</dt><dd>${tasks}</dd></div>
      <div><dt>Wall time</dt><dd>${fmtDuration(g.wallMs)}</dd></div>
      <div><dt>Tokens</dt><dd>${fmtTokens(totalTokens(g.models))}</dd></div>
      ${extra ? `<div><dt>Rework cycles</dt><dd>${extra.rework}</dd></div><div><dt title="Owner interventions">Interventions</dt><dd>${extra.owner}</dd></div>` : ""}
    </dl>
    ${models.length ? `<table class="data compact"><thead><tr><th scope="col">Model</th>${tokenHeads()}</tr></thead><tbody>${rows}</tbody></table>` : `<p class="quiet">No token data.</p>`}`
    : `<p class="quiet">No task measured yet: the architect measures each task when it is integrated.</p>`;
  return `<article class="goal-cost${full ? " has-full" : ""}">
    <header><h3>${idEl(g.goal)} ${esc(g.title)}</h3>${g.window ? goalWindowText(g.window) : ""}</header>
    ${full}
    ${full ? `<h4 class="cost-sub">Measured tasks <span class="quiet">implementer work recorded with <code>maestro measure</code>, already included above</span></h4>` : ""}
    ${measured}
  </article>`;
}

function goalWindowText(w) {
  const from = `${esc(clockTime(w.from))} <span class="quiet">${esc(dayLabel(w.from))}</span>`;
  const end = w.open
    ? `<span class="open-badge">open</span> running for ${timeEl(w.from, "since")}`
    : `closed ${esc(clockTime(w.to))} <span class="quiet">${esc(dayLabel(w.to))}</span>, took ${fmtDuration(toMs(w.to) - toMs(w.from))}`;
  return `<p class="goal-window" title="${esc(`${absTime(w.from)} → ${w.open ? "now" : absTime(w.to)}`)}">Started ${from} · ${end}</p>`;
}

function fullGoalCost(g, unpriced) {
  const byRole = new Map(g.breakdown.map((r) => [r.role, r]));
  const total = g.total || {};
  const agents = g.breakdown.reduce((n, r) => n + (r.role === "pm" ? 0 : Number(r.agents) || 0), 0);
  const running = g.breakdown.reduce((n, r) => n + (Number(r.running) || 0), 0);
  const rows = COST_ROLES.filter(([key]) => byRole.has(key) && (key !== "other" || byRole.get(key).agents))
    .map(([key, label, dot]) => {
      const r = byRole.get(key);
      const has = Object.keys(r.models || {}).length > 0;
      const count = key === "pm" ? `${Number(r.agents) || 0}<span class="quiet"> ${(Number(r.agents) || 0) === 1 ? "session" : "sessions"}</span>` : String(Number(r.agents) || 0);
      const run = Number(r.running) || 0;
      const usd = has ? usdCell(r.usd, r.models, unpriced) : run ? `<span class="quiet">pending</span>` : "–";
      return `<tr><th scope="row"><span class="role-dot r-${dot}"></span>${esc(label)}${run ? ` <span class="run-count" title="Still running: counted when it finishes">${run} running</span>` : ""}</th><td class="num">${count}</td>${
        has ? tokenCells(totalOf(r.models)) : `<td colspan="${TOKEN_COLUMNS.length}" class="quiet">${esc(r.note || (run ? "running, tokens counted when it finishes" : "none in this GOAL"))}</td>`
      }<td class="num usd">${usd}</td></tr>`;
    })
    .join("");
  const notes = running ? `<p class="cost-note">${plural(running, "agent")} still running: counted when ${running === 1 ? "it finishes" : "they finish"}.</p>` : "";
  return `<div class="full-cost">
    <dl class="stats">
      <div><dt>Full cost, est. USD</dt><dd class="usd big">${usdCell(total.usd, total.models, unpriced)}</dd></div>
      <div><dt>Agents</dt><dd>${agents}</dd></div>
      <div><dt>Tokens</dt><dd>${fmtTokens(totalTokens(total.models))}</dd></div>
    </dl>
    <table class="data compact roles"><thead><tr><th scope="col">Role</th><th scope="col" class="num">Agents</th>${tokenHeads()}<th scope="col" class="num">Est. USD</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><th scope="row">Total</th><td class="num">${agents}</td>${tokenCells(totalOf(total.models))}<td class="num usd">${usdCell(total.usd, total.models, unpriced)}</td></tr></tfoot></table>
    ${notes}
  </div>`;
}

/** Tokens of every model summed into one usage record. */
function totalOf(models) {
  const sum = {};
  for (const u of Object.values(models || {})) for (const [f] of TOKEN_FIELDS) sum[f] = (sum[f] || 0) + (Number(u?.[f]) || 0);
  return sum;
}

function costChart(tasks, unpriced) {
  const usdMode = ui.costMetric === "usd";
  const value = (t) => (usdMode ? t.usd : totalTokens(t.models));
  const rows = [...tasks].sort((a, b) => (value(b) ?? -1) - (value(a) ?? -1));
  const max = Math.max(0, ...rows.map((t) => value(t) ?? 0));
  const bars = rows
    .map((t) => {
      const v = value(t);
      const label = usdMode ? (v == null ? "unpriced" : fmtUsd(v)) : fmtTokens(v);
      const pct = v == null || !max ? 0 : Math.max(0.5, (v / max) * 100);
      const tip = [
        `${t.task} ${t.title || ""}`,
        `Est. USD: ${t.usd == null ? "unpriced" : fmtUsd(t.usd)}`,
        `Tokens: ${fmtTokens(totalTokens(t.models))}`,
        ...Object.entries(t.models || {}).map(([m, u]) => `  ${modelName(m)}: ${fmtTokens(totalTokens({ m: u }))}${unpriced.has(m) ? " (unpriced)" : ""}`),
        `Wall time: ${fmtDuration(t.wallMs)}`,
        ...(t.sharedWith?.length ? [`Batch with ${t.sharedWith.join(", ")}: the implementer's cost is split evenly`] : []),
      ].join("\n");
      return `<div class="bar-row" tabindex="0" data-tip="${esc(tip)}"><span class="bar-label">${idEl(t.task)}<span class="bar-title">${esc(t.title || "")}</span></span><span class="bar-track">${
        v == null ? `<span class="bar-none">unpriced, see table</span>` : `<span class="bar" style="width:${pct}%"></span><span class="bar-value">${esc(label)}</span>`
      }</span></div>`;
    })
    .join("");
  return `<figure class="chart">
    <figcaption><span class="chart-title">${usdMode ? "Estimated USD per task" : "Tokens per task, all models, cache included"}</span>
      <span class="seg-toggle small" role="group" aria-label="Chart measure"><button type="button" id="metric-usd" data-metric="usd" aria-pressed="${usdMode}">USD estimate</button><button type="button" id="metric-tokens" data-metric="tokens" aria-pressed="${!usdMode}">Tokens</button></span></figcaption>
    <div class="bars">${bars}</div></figure>`;
}

const sharedNote = (t) =>
  t.sharedWith?.length
    ? `<span class="cell-note" title="One implementer worked on these tasks together: its cost is split evenly among them.">Batch with ${t.sharedWith.map(esc).join(", ")}: cost split evenly</span>`
    : "";

function costTable(tasks, unpriced) {
  const sorted = [...tasks].sort((a, b) => naturalCompare(a.goal, b.goal) || naturalCompare(a.task, b.task));
  const body = sorted
    .map((t) => {
      const models = Object.entries(t.models || {});
      const span = Math.max(1, models.length);
      const first = `<td rowspan="${span}">${idEl(t.task)} <span class="cell-title">${esc(t.title || "")}</span>${sharedNote(t)}</td><td rowspan="${span}">${t.goal ? idEl(t.goal) : ""}</td><td rowspan="${span}" class="num">${fmtDuration(t.wallMs)}</td><td rowspan="${span}" class="num${t.reworkCycles ? " hot" : ""}">${Number(t.reworkCycles) || 0}</td><td rowspan="${span}" class="num${t.ownerInterventions ? " hot" : ""}">${Number(t.ownerInterventions) || 0}</td>`;
      const usd = `<td rowspan="${span}" class="num usd">${usdCell(t.usd, t.models, unpriced)}</td>`;
      if (!models.length) return `<tr class="group-start">${first}<td colspan="5" class="quiet">no token data</td>${usd}</tr>`;
      return models
        .map(([id, u], k) => `<tr${k === 0 ? ' class="group-start"' : ""}>${k === 0 ? first : ""}<td>${modelLabel(id, unpriced)}</td>${tokenCells(u)}${k === 0 ? usd : ""}</tr>`)
        .join("");
    })
    .join("");
  return `<div class="table-wrap"><table class="data costs"><thead><tr><th scope="col">Task</th><th scope="col">GOAL</th><th scope="col" class="num">Wall time</th><th scope="col" class="num">Rework</th><th scope="col" class="num" title="Owner interventions">Interventions</th><th scope="col">Model</th>${tokenHeads()}<th scope="col" class="num">Est. USD</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

// ---------- event feed ----------

function describeEvent(e) {
  const d = e.data && typeof e.data === "object" ? e.data : {};
  const task = e.task ? idEl(e.task) : "";
  switch (e.type) {
    case "task.status":
      return `${task} ${esc(d.from || "?")} <span class="arrow" aria-label="to">→</span> <strong>${esc(d.to || "?")}</strong>`;
    case "task.claim":
      return `claimed ${task}`;
    case "task.claim_denied":
      return `claim on ${task} denied${d.reason ? `: ${esc(d.reason)}` : ""}`;
    case "task.release":
      return `released ${task}${d.reason ? `: ${esc(d.reason)}` : ""}`;
    case "task.measure":
      return `measured ${task}${d.wallMs != null ? `, ${fmtDuration(d.wallMs)}` : ""}`;
    case "agent.start":
      return `started ${esc(roleOf(d.agentType, e.actor).label.toLowerCase())} <span class="quiet">${esc(e.agentId || "")}</span>`;
    case "agent.stop":
      return `${esc(roleOf(d.agentType, e.actor).label.toLowerCase())} finished <span class="quiet">${esc(e.agentId || "")}</span>`;
    case "decision.recorded":
      return `recorded ${d.id ? idEl(d.id) : "a decision"}${d.status ? ` (${esc(d.status)})` : ""}${task ? ` on ${task}` : ""}`;
    case "decision.ruling":
      return `ruled on ${task || "a doubt"}${d.question ? `: <q>${esc(d.question)}</q>` : ""}${d.ruling ? ` ${esc(d.ruling)}` : ""}`;
    case "context.band":
      return `PM context at ${fmtPct(d.percent)}`;
    case "usage.sample":
      return `usage 5h ${fmtPct(d.fiveHour)}, week ${fmtPct(d.sevenDay)}`;
    case "limit.hit":
      return `<strong>usage limit hit</strong>${d.error ? ` ${esc(d.error)}` : ""}`;
    case "session.compact":
      return `context compacted${d.phase ? ` (${esc(d.phase)})` : ""}`;
    case "goal.start":
      return `started GOAL ${idEl(e.goal || "")}`;
    case "goal.done":
      return `closed GOAL ${idEl(e.goal || "")}`;
    default:
      return `${esc(String(e.type || "event"))}${task ? ` ${task}` : e.goal ? ` ${idEl(e.goal)}` : ""}${dataSummary(d)}`;
  }
}

/** Short readable summary of an event's data: "key: value" pairs, each value and the whole line truncated. */
export function dataSummary(d, max = 90) {
  const parts = [];
  for (const [k, v] of Object.entries(d || {})) {
    if (v == null || v === "") continue;
    const text = typeof v === "object" ? JSON.stringify(v) : String(v);
    parts.push(`${k}: ${text.length > 40 ? `${text.slice(0, 39)}…` : text}`);
  }
  if (!parts.length) return "";
  let line = parts.join(", ");
  if (line.length > max) line = `${line.slice(0, max - 1)}…`;
  return ` <span class="ev-data">${esc(line)}</span>`;
}

function renderFeed(s) {
  const events = lists(s).events.slice(0, FEED_LIMIT);
  const items = events.length
    ? `<ol class="events">${events
        .map((e) => {
          const r = roleOf(e.data?.agentType, e.actor);
          const actor = e.actor || (e.type?.startsWith("agent.") ? "hook" : "");
          return `<li class="ev t-${statusSlug(e.type)}"><span class="ev-time">${timeEl(e.ts)}</span><p class="ev-text">${actor ? `<span class="actor r-${r.key}">${esc(actor)}</span> ` : ""}${describeEvent(e)}</p></li>`;
        })
        .join("")}</ol>`
    : `<p class="quiet">No events yet. Claims, status changes and agent runs show up here as they happen.</p>`;
  $("feed").innerHTML = `<h2 class="feed-head">Recent events</h2>${items}`;
}

// ---------- render ----------

const VIEWS = { roadmap: renderRoadmap, board: renderBoard, agents: renderAgents, decisions: renderDecisions, reports: renderReports, costs: renderCosts };

function render() {
  const s = ui.state;
  const scroll = window.scrollY;
  const inner = [...document.querySelectorAll("[data-keep-scroll]")].map((el) => [el.dataset.keepScroll, el.scrollTop]);
  const focusId = document.activeElement?.id;
  renderTabs(s);
  const view = $("view");
  view.setAttribute("aria-labelledby", `tab-${ui.tab}`);
  view.className = `view v-${ui.tab}`;
  if (!s) {
    $("gauges").innerHTML = "";
    view.innerHTML = ui.fetchError ? `<p class="callout error">Cannot load the project state: ${esc(ui.fetchError)}. Is <code>maestro dashboard</code> still running?</p>` : `<p class="quiet block">Loading the project state</p>`;
    $("feed").innerHTML = "";
    return;
  }
  renderHeader(s);
  const banner = ui.fetchError ? `<p class="callout error">Last refresh failed (${esc(ui.fetchError)}); showing data from ${esc(relTime(ui.fetchedAt))}.</p>` : "";
  view.innerHTML = banner + VIEWS[ui.tab](s);
  renderFeed(s);
  fitBoard();
  for (const [key, top] of inner) {
    const el = document.querySelector(`[data-keep-scroll="${CSS.escape(key)}"]`);
    if (el) el.scrollTop = top;
  }
  window.scrollTo(0, scroll);
  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  tick();
}

// Board columns reach the bottom of the window without making the page scroll: the free height is
// the viewport below the board minus the layout's bottom padding (CSS alone cannot know the header height).
function fitBoard() {
  const layout = document.querySelector(".layout");
  const pad = layout ? parseFloat(getComputedStyle(layout).paddingBottom) || 0 : 0;
  const room = (el) => Math.floor(window.innerHeight - (el.getBoundingClientRect().top + window.scrollY) - pad);
  const board = document.querySelector(".board");
  if (board) board.style.minHeight = `${Math.max(220, room(board))}px`;
  // The event feed scrolls inside its own box and ends at the window bottom, so it never lengthens the page.
  const feed = $("feed");
  if (feed && getComputedStyle(feed).position === "sticky") feed.style.maxHeight = `${Math.max(200, room(feed))}px`;
}
window.addEventListener("resize", fitBoard);

function tick() {
  const now = Date.now();
  for (const el of document.querySelectorAll("time[data-rel]")) el.textContent = relTime(Number(el.dataset.rel), now);
  for (const el of document.querySelectorAll("time[data-since]")) el.textContent = fmtSince(now - Number(el.dataset.since));
  setLive(ui.live);
}

function setLive(stateName) {
  ui.live = stateName;
  const el = $("conn");
  const labels = { connecting: "Connecting", live: "Live", reconnecting: "Reconnecting", offline: "Offline, retrying" };
  el.className = `conn is-${stateName}`;
  const updated = ui.fetchedAt ? ` · updated ${relTime(ui.fetchedAt)}` : "";
  el.querySelector(".conn-text").textContent = labels[stateName] || stateName;
  el.title = `Live updates: ${labels[stateName] || stateName}${updated}`;
  let sub = el.querySelector(".conn-sub");
  if (!sub) {
    sub = document.createElement("span");
    sub.className = "conn-sub";
    el.append(sub);
  }
  sub.textContent = ui.fetchedAt ? `updated ${relTime(ui.fetchedAt)}` : "";
}

// ---------- data ----------

let inflight = null;
let again = false;

async function refresh() {
  if (inflight) {
    again = true;
    return;
  }
  inflight = (async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      ui.state = await res.json();
      ui.fetchedAt = Date.now();
      ui.fetchError = null;
    } catch (err) {
      ui.fetchError = err.message || String(err);
    }
    render();
    if (ui.report?.path) loadReport(ui.report.path, ui.report.title, true);
  })();
  await inflight;
  inflight = null;
  if (again) {
    again = false;
    refresh();
  }
}

async function loadReport(path, title, quiet = false) {
  if (!quiet || !ui.report || ui.report.path !== path) {
    ui.report = { path, title, status: "loading", text: "" };
    render();
  }
  let next;
  try {
    const res = await fetch(`/api/report?path=${encodeURIComponent(path)}`, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status === 400 ? "the server does not serve this path" : `HTTP ${res.status}`);
    next = { path, title, status: "ok", text: await res.text() };
  } catch (err) {
    next = { path, title, status: "error", error: err.message || String(err), text: quiet ? ui.report?.text || "" : "" };
  }
  if (ui.report?.path !== path) return; // the user picked another one meanwhile
  const same = ui.report.status === next.status && ui.report.text === next.text;
  ui.report = next;
  if (!same) render();
}

function connect() {
  if (typeof EventSource === "undefined") return setLive("offline");
  const es = new EventSource("/api/stream");
  let wasDown = false;
  es.addEventListener("open", () => {
    setLive("live");
    if (wasDown) refresh(); // catch up on changes missed while disconnected
    wasDown = false;
  });
  es.addEventListener("changed", () => refresh());
  es.addEventListener("error", () => {
    wasDown = true;
    if (es.readyState === EventSource.CLOSED) {
      setLive("offline");
      setTimeout(connect, 5000);
    } else {
      setLive("reconnecting");
    }
  });
}

// ---------- navigation ----------

function readHash() {
  const raw = decodeURIComponent(location.hash.replace(/^#/, ""));
  const [tab, ...rest] = raw.split("/");
  const arg = rest.join("/");
  ui.tab = TABS.some((t) => t.id === tab) ? tab : "roadmap";
  if (ui.tab === "board") ui.boardAll = arg === "all";
  if ((ui.tab === "reports" || ui.tab === "decisions") && arg && ui.report?.path !== arg) {
    loadReport(arg, "");
  }
}

function writeHash() {
  let h = ui.tab;
  if (ui.tab === "board" && ui.boardAll) h += "/all";
  if ((ui.tab === "reports" || ui.tab === "decisions") && ui.report?.path) h += `/${ui.report.path}`;
  if (location.hash.slice(1) !== h) history.replaceState(null, "", `#${h}`);
}

function go(tab) {
  if (tab === ui.tab) return;
  ui.tab = tab;
  const h = `${tab}${tab === "board" && ui.boardAll ? "/all" : ""}${(tab === "reports" || tab === "decisions") && ui.report?.path && isPathFor(tab, ui.report.path) ? `/${ui.report.path}` : ""}`;
  history.pushState(null, "", `#${h}`);
  render();
  // A new view starts at its top, just under the sticky tabs; refreshes keep the scroll position instead.
  const top = $("masthead").offsetHeight;
  if (window.scrollY > top) window.scrollTo(0, top);
}

function isPathFor(tab, path) {
  return tab === "decisions" ? path.startsWith("backlog/decisions/") : path.startsWith(".maestro/reports/");
}

document.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-tab], [data-goto], [data-board], [data-metric], [data-report]");
  if (!el || el.disabled) return;
  if (el.dataset.tab) go(el.dataset.tab);
  else if (el.dataset.goto) go(el.dataset.goto);
  else if (el.dataset.board) {
    ui.boardAll = el.dataset.board === "all";
    writeHash();
    render();
  } else if (el.dataset.metric) {
    ui.costMetric = el.dataset.metric;
    render();
  } else if (el.dataset.report) {
    const path = el.dataset.report;
    if (ui.tab === "decisions" && ui.report?.path === path) {
      ui.report = null; // a second click folds the decision text away
      writeHash();
      render();
      return;
    }
    loadReport(path, el.dataset.title || path).then(writeHash);
    writeHash();
  }
});

// Arrow keys move between tabs (WAI-ARIA tabs pattern).
$("tabs").addEventListener("keydown", (ev) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(ev.key)) return;
  ev.preventDefault();
  const i = TABS.findIndex((t) => t.id === ui.tab);
  const step = { ArrowRight: i + 1, ArrowLeft: i + TABS.length - 1, Home: 0, End: TABS.length - 1 }[ev.key];
  const next = TABS[step % TABS.length].id;
  go(next);
  $(`tab-${next}`)?.focus();
});

document.addEventListener(
  "toggle",
  (ev) => {
    const key = ev.target?.dataset?.key;
    if (!key) return;
    if (ev.target.open) ui.open.add(key);
    else ui.open.delete(key);
  },
  true,
);

// Chart tooltip: one floating element, filled with textContent only.
const tip = $("tip");
function showTip(el) {
  tip.textContent = el.dataset.tip;
  tip.hidden = false;
  const r = el.querySelector(".bar-track")?.getBoundingClientRect() || el.getBoundingClientRect();
  const top = r.bottom + window.scrollY + 6;
  const left = Math.min(r.left + window.scrollX + 12, window.scrollX + document.documentElement.clientWidth - tip.offsetWidth - 12);
  tip.style.top = `${top}px`;
  tip.style.left = `${left}px`;
}
function hideTip() {
  tip.hidden = true;
}
document.addEventListener("mouseover", (ev) => {
  const el = ev.target.closest("[data-tip]");
  if (el) showTip(el);
  else hideTip();
});
document.addEventListener("focusin", (ev) => {
  const el = ev.target.closest?.("[data-tip]");
  if (el) showTip(el);
  else hideTip();
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") hideTip();
});

window.addEventListener("hashchange", () => {
  readHash();
  render();
});

// ---------- start ----------

readHash();
render();
refresh();
connect();
setInterval(tick, 15000);
