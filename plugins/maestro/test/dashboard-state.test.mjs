import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildState, loadState, parseFrontmatter, parseTaskFile, pmUsageReader, toIso } from "../scripts/dashboard/state.mjs";
import { PRICES, costUsd, priceFor } from "../scripts/dashboard/prices.mjs";
import { tempProject } from "./dashboard-helpers.mjs";
import { assistant, writeTranscript } from "./fixtures/transcript.mjs";

const NOW = new Date("2026-11-06T15:30:00Z");

test("frontmatter_parser_handles_backlog_shapes", () => {
  const { data, body } = parseFrontmatter(
    `---\r\nid: TASK-1\r\ntitle: "A: b"\r\nlabels: [x, 'y z', "w"]\r\nassignee:\r\n  - '@impl-1'\r\n  - '@impl-2'\r\ndependencies: []\r\nparentTaskId: TASK-9\r\nordinal: 7000\r\nunknown_key: whatever\r\nweird line without colon\r\n---\r\nBody\r\n`,
  );
  assert.equal(data.id, "TASK-1");
  assert.equal(data.title, "A: b");
  assert.deepEqual(data.labels, ["x", "y z", "w"]);
  assert.deepEqual(data.assignee, ["@impl-1", "@impl-2"]);
  assert.deepEqual(data.dependencies, []);
  assert.equal(data.parent_task_id, "TASK-9");
  assert.equal(data.ordinal, 7000);
  assert.equal(body.trim(), "Body");
  assert.deepEqual(parseFrontmatter("no frontmatter").data, {});
  assert.equal(parseTaskFile("---\ntitle: no id\n---\n"), null);
  assert.equal(toIso("2026-11-06 15:04"), "2026-11-06T15:04:00.000Z");
  assert.equal(toIso("2026-11-06"), "2026-11-06T00:00:00.000Z");
  assert.equal(toIso("garbage"), null);
});

test("state_builds_contract_shape", () => {
  const { dir } = tempProject();
  const s = loadState(dir, { now: NOW });

  assert.deepEqual(Object.keys(s).sort(), ["agents", "costs", "decisions", "events", "generatedAt", "git", "header", "milestones", "project", "reports", "tasks", "warnings"]);
  assert.equal(s.generatedAt, NOW.toISOString());
  assert.equal(s.project.mainBranch, "master");
  assert.equal(s.project.language, "en");
  assert.equal(s.header.main.subject, "Initial commit");
  assert.match(s.header.main.sha, /^[0-9a-f]{7,}$/);
  assert.equal(s.git.branch, "master");

  // Milestones -> goals -> drafts, archived goals and milestones included.
  const m0 = s.milestones.find((m) => m.id === "m-0");
  assert.equal(m0.title, "v1 plugin");
  assert.equal(m0.description, "First release.");
  assert.deepEqual(m0.goals.map((g) => g.id).sort(), ["TASK-0", "TASK-1"]);
  const goal = m0.goals.find((g) => g.id === "TASK-1");
  assert.deepEqual({ done: goal.done, total: goal.total, dependencies: goal.dependencies, proposed: goal.proposed, archived: goal.archived }, { done: 1, total: 3, dependencies: ["TASK-0"], proposed: false, archived: false });
  assert.equal(m0.goals.find((g) => g.id === "TASK-0").archived, true);
  assert.deepEqual(m0.drafts, [{ id: "draft-1", title: "An idea" }]);
  assert.equal(s.milestones.find((m) => m.id === "m-9").archived, true);

  // Tasks (goals are not in this list), with dependencies, scope and AC counts; both key spellings.
  assert.deepEqual(s.tasks.map((t) => t.id).sort(), ["TASK-0.1", "TASK-1.1", "TASK-1.2", "TASK-1.3"]);
  const t2 = s.tasks.find((t) => t.id === "TASK-1.2");
  assert.equal(t2.title, 'Second: "quoted" task');
  assert.deepEqual({ goal: t2.goal, assignees: t2.assignees, dependencies: t2.dependencies, scope: t2.scope, acDone: t2.acDone, acTotal: t2.acTotal }, { goal: "TASK-1", assignees: ["@impl-2"], dependencies: ["TASK-1.1"], scope: ["src/b/**", "test/b*"], acDone: 1, acTotal: 3 });
  assert.equal(t2.updatedAt, "2026-11-06T14:20:00.000Z");
  const t3 = s.tasks.find((t) => t.id === "TASK-1.3");
  assert.equal(t3.goal, "TASK-1");
  assert.deepEqual(t3.dependencies, ["TASK-1.1", "TASK-1.2"]);
  assert.equal(s.tasks.find((t) => t.id === "TASK-0.1").archived, true);

  // Header: active goal; waiting = the blocked task; the open decision is not referenced, so it is a question.
  assert.deepEqual(s.header.activeGoal, { id: "TASK-1", title: "The goal", done: 1, total: 3 });
  assert.equal(s.header.ownerWaiting, 1);
  assert.equal(s.header.ownerQuestions, 1);
  assert.deepEqual(s.decisions.map((d) => [d.id, d.status]), [["decision-1", "open"], ["decision-2", "accepted"]]);
  assert.deepEqual(s.reports.map((r) => [r.kind, r.id, r.path, r.title]).sort(), [
    ["qa", "QA-1", ".maestro/reports/qa/QA-1.md", "QA 1: exploratory"],
    ["task", "TASK-1.1", ".maestro/reports/task/TASK-1.1.md", "Plain first line report"],
  ]);
  assert.equal(s.header.context, null);
  assert.equal(s.header.usage, null);
  assert.equal(s.events.length, 6);
  assert.equal(s.events[0].type, "task.measure"); // newest first

  // One bad file never breaks the state: it is reported.
  assert.equal(s.warnings.length, 1);
  assert.match(s.warnings[0], /broken\.md/);
});

test("state_reads_runtime_snapshots_and_staleness", () => {
  const raw = { ts: "2026-11-06T15:20:00Z", percent: 48.2, fiveHour: 62, sevenDay: 31, resetsAt: 1793988600 };
  const fresh = buildState({ runtime: { context: raw, usage: raw } }, NOW);
  assert.deepEqual(fresh.header.context, { percent: 48.2, ts: "2026-11-06T15:20:00.000Z", stale: false });
  assert.deepEqual(fresh.header.usage, { fiveHour: 62, sevenDay: 31, resetsAt: 1793988600, ts: "2026-11-06T15:20:00.000Z", stale: false });
  const old = buildState({ runtime: { context: { ...raw, ts: "2026-11-06T14:00:00Z" } } }, NOW);
  assert.equal(old.header.context.stale, true);
});

const measure = (ts, task, models, extra = {}) => ({ ts, type: "task.measure", task, data: { usage: { models, wallMs: 100 }, wallMs: 100, ...extra } });
const parent = (id, p) => ({ id, title: id, status: "Done", labels: [], dependencies: [], scope: [], parent: p, assignees: [], acDone: 0, acTotal: 0, archived: false });

test("state_computes_costs", () => {
  const sonnet = { input: 1e6, output: 1e6, cacheRead: 1e6, cacheWrite: 1e6 };
  const s = buildState(
    {
      tasks: [parent("TASK-1.1", "TASK-1"), parent("TASK-1.2", "TASK-1"), parent("TASK-1.3", "TASK-1")],
      events: [
        measure("2026-11-06T10:00:00Z", "TASK-1.1", { "claude-sonnet-5-5": sonnet }),
        measure("2026-11-06T10:05:00Z", "TASK-1.1", { "claude-sonnet-5-5": { input: 1e6 } }, { reworkCycles: 1 }),
        measure("2026-11-06T10:10:00Z", "TASK-1.2", { "claude-opus-5-5": { output: 500000 }, "claude-mystery-1": { input: 5 } }),
        measure("2026-11-06T10:15:00Z", "TASK-1.3", { "claude-haiku-5-5": { input: 1e6, output: 1e6 } }),
      ],
    },
    NOW,
  );
  const t = Object.fromEntries(s.costs.tasks.map((x) => [x.task, x]));
  // 1.1: sonnet 2 + 10 + 0.1 + 2.5 = 14.6, plus a second measure of 1M input tokens (2.0): tokens are summed.
  assert.deepEqual(t["TASK-1.1"].models["claude-sonnet-5-5"], { input: 2e6, output: 1e6, cacheRead: 1e6, cacheWrite: 1e6 });
  assert.equal(t["TASK-1.1"].usd, 16.6);
  assert.equal(t["TASK-1.1"].wallMs, 200);
  assert.equal(t["TASK-1.1"].reworkCycles, 1);
  assert.equal(t["TASK-1.1"].goal, "TASK-1");
  // 1.2 has an unpriced model: usd covers the priced models only (opus 500k output = 10), the model is listed.
  assert.equal(t["TASK-1.2"].usd, 10);
  assert.equal(t["TASK-1.3"].usd, 0.6); // haiku 0.10 + 0.50
  assert.deepEqual(s.costs.unpriced, ["claude-mystery-1"]);
  // Goal: sums tokens, wall time and the priced USD (16.6 + 10 + 0.6).
  assert.equal(s.costs.goals.length, 1);
  assert.equal(s.costs.goals[0].tasks, 3);
  assert.equal(s.costs.goals[0].wallMs, 400);
  assert.equal(s.costs.goals[0].usd, 27.2);
  assert.equal(s.costs.goals[0].models["claude-opus-5-5"].output, 500000);
  assert.equal(s.costs.estimate, true);
  assert.match(s.costs.pricesSource, /^https:\/\/.+ \(\d{4}-\d{2}-\d{2}\)$/);

  // Without the unpriced task the goal total is a number.
  const ok = buildState({ tasks: [parent("TASK-1.1", "TASK-1")], events: [measure("2026-11-06T10:00:00Z", "TASK-1.1", { "claude-sonnet-5-5": sonnet })] }, NOW);
  assert.equal(ok.costs.goals[0].usd, 14.6);
  assert.deepEqual(ok.costs.unpriced, []);

  // Config prices override the list prices (by model id) and can price an unknown model.
  const over = buildState(
    { config: { prices: { "claude-mystery-1": { input: 1, output: 1, cacheRead: 1, cacheWrite: 1 } } }, tasks: [parent("TASK-1.1", "TASK-1")], events: [measure("2026-11-06T10:00:00Z", "TASK-1.1", { "claude-mystery-1": { input: 2e6 } })] },
    NOW,
  );
  assert.equal(over.costs.tasks[0].usd, 2);
  assert.deepEqual(over.costs.unpriced, []);

  // Price table: every entry is complete and carries its source.
  for (const p of Object.values(PRICES)) {
    assert.ok(["input", "output", "cacheRead", "cacheWrite"].every((k) => p[k] > 0));
    assert.match(p.source, /^https:\/\//);
    assert.match(p.asOf, /^\d{4}-\d{2}-\d{2}$/);
  }
  assert.equal(priceFor("claude-sonnet-9-9"), PRICES["claude-sonnet-5-5"]); // family match
  assert.equal(priceFor("gpt-5"), null);
  assert.equal(costUsd("gpt-5", { input: 1 }), null);
});

test("state_pairs_agents", () => {
  const ev = (ts, type, extra) => ({ ts, type, ...extra });
  const s = buildState(
    {
      events: [
        ev("2026-11-06T10:00:00Z", "agent.start", { agentId: "old", data: { agentType: "maestro:architect" } }), // no stop, > 12 h before NOW
        ev("2026-11-06T14:00:00Z", "agent.start", { agentId: "a1", data: { agentType: "maestro:implementer" } }),
        ev("2026-11-06T14:00:05Z", "task.claim", { actor: "impl-1", task: "TASK-1.1" }),
        ev("2026-11-06T14:00:20Z", "agent.start", { agentId: "a2", data: { agentType: "maestro:implementer" } }),
        ev("2026-11-06T14:00:30Z", "task.claim", { actor: "impl-2", task: "TASK-1.2" }),
        ev("2026-11-06T14:10:00Z", "agent.stop", { agentId: "a1", data: { agentType: "maestro:implementer" } }),
        ev("2026-11-06T15:00:00Z", "agent.start", { agentId: "a3", data: { agentType: "maestro:qa-explorer" } }),
        ev("2026-11-06T15:10:00Z", "task.claim", { actor: "late", task: "TASK-9" }), // outside the 2 minute window
        ev("2026-11-06T15:20:00Z", "agent.stop", { agentId: "ghost" }), // stop without start: ignored
      ],
    },
    new Date("2026-11-07T01:30:00Z"),
  );
  const by = Object.fromEntries(s.agents.map((a) => [a.agentId, a]));
  assert.deepEqual(s.agents.map((a) => a.agentId), ["a3", "a2", "a1", "old"]); // newest first
  assert.deepEqual(by.a1, { agentId: "a1", type: "maestro:implementer", actor: "impl-1", task: "TASK-1.1", mission: null, model: "sonnet", modelPlanned: true, state: "finished", since: "2026-11-06T14:00:00Z", until: "2026-11-06T14:10:00Z" });
  assert.deepEqual([by.a2.actor, by.a2.task, by.a2.state, by.a2.until], ["impl-2", "TASK-1.2", "running", null]);
  // Non-implementer roles never take claims; they are named after their agent type.
  assert.deepEqual([by.a3.actor, by.a3.task, by.a3.state], ["qa-explorer", null, "running"]);
  assert.equal(by.old.actor, "architect");
  assert.equal(by.old.state, "finished"); // started more than 12 hours ago, never stopped
  assert.equal(by.old.until, null);
});

test("state_pairs_agents_prefers_measured_links", () => {
  const s = buildState(
    {
      events: [
        { ts: "2026-11-06T14:00:00Z", type: "agent.start", agentId: "arch", data: { agentType: "maestro:architect" } },
        { ts: "2026-11-06T14:00:30Z", type: "agent.start", agentId: "i1", data: { agentType: "maestro:implementer" } },
        { ts: "2026-11-06T14:00:40Z", type: "task.claim", actor: "impl-1", task: "TASK-1.1" },
        { ts: "2026-11-06T14:01:00Z", type: "agent.start", agentId: "i2", data: { agentType: "maestro:implementer" } },
        { ts: "2026-11-06T14:01:05Z", type: "task.claim", actor: "impl-2", task: "TASK-1.2" },
        { ts: "2026-11-06T14:09:00Z", type: "task.measure", task: "TASK-1.2", data: { agentIds: ["i1"] } },
      ],
    },
    new Date("2026-11-06T14:10:00Z"),
  );
  const by = Object.fromEntries(s.agents.map((a) => [a.agentId, a]));
  assert.deepEqual([by.arch.actor, by.arch.task], ["architect", null]); // the architect never takes an implementer's claim
  assert.deepEqual([by.i1.actor, by.i1.task], ["impl-2", "TASK-1.2"]); // task.measure wins over the time heuristic
});

test("state_counts_review_from_last_review_done_event", () => {
  const status = (ts, to) => ({ ts, type: "task.status", task: "TASK-1.1", data: { from: "In Review", to } });
  const done = (ts, review) => ({ ts, type: "review.done", data: { review, to: "abc1234" } });
  const events = [
    status("2026-11-06T10:00:00Z", "Integrated"),
    done("2026-11-06T10:30:00Z", "CR-1"),
    status("2026-11-06T11:00:00Z", "Integrated"),
    status("2026-11-06T13:00:00Z", "In Review"), // not integrated
    done("2026-11-06T14:00:00Z", "CR-2"),
    status("2026-11-06T15:00:00Z", "Integrated"),
    status("2026-11-06T16:00:00Z", "Integrated"),
    status("2026-11-06T16:30:00Z", "Done"),
  ];
  // A newer cr/ tag must not override the event.
  const tags = [{ name: "cr/CR-9", date: "2026-11-06T16:10:00.000Z" }];
  const s = buildState({ events, git: { tags }, config: { reviewEveryTasks: 4 } }, NOW);
  assert.deepEqual(s.header.review, { integratedSinceLast: 2, every: 4, lastReview: "CR-2" });
  const none = buildState({ events: events.filter((e) => e.type !== "review.done"), git: { tags: [] } }, NOW);
  assert.deepEqual(none.header.review, { integratedSinceLast: 4, every: 15, lastReview: null });
});

test("state_counts_review_falls_back_to_cr_tag", () => {
  const status = (ts, to) => ({ ts, type: "task.status", task: "TASK-1.1", data: { from: "In Review", to } });
  const events = [
    status("2026-11-06T10:00:00Z", "Integrated"),
    status("2026-11-06T15:00:00Z", "Integrated"),
    status("2026-11-06T16:00:00Z", "Integrated"),
  ];
  const tags = [
    { name: "cr/CR-1", date: "2026-11-05T00:00:00.000Z" },
    { name: "cr/CR-2", date: "2026-11-06T12:00:00.000Z" },
  ];
  const s = buildState({ events, git: { tags }, config: { reviewEveryTasks: 4 } }, NOW);
  assert.deepEqual(s.header.review, { integratedSinceLast: 2, every: 4, lastReview: "CR-2" });

  // End to end: the tag date comes from git (the tag is on the commit made at 14:00; 13:00 event is before it, 15:00 after).
  const { dir } = tempProject();
  const e2e = loadState(dir, { now: NOW });
  assert.equal(e2e.header.review.lastReview, "CR-1");
  assert.equal(e2e.header.review.integratedSinceLast, 1);
  assert.equal(e2e.git.tags.find((t) => t.name === "cr/CR-1").date, "2026-11-06T14:00:00.000Z");
});

test("state_pairs_simultaneous_agents_by_binding", () => {
  // Two implementers start in the same millisecond; claims arrive in the opposite order.
  const s = buildState(
    {
      events: [
        { ts: "2026-11-06T15:43:58.576Z", type: "agent.start", agentId: "A", data: { agentType: "maestro:implementer" } },
        { ts: "2026-11-06T15:43:58.577Z", type: "agent.start", agentId: "B", data: { agentType: "maestro:implementer" } },
        { ts: "2026-11-06T15:44:03.600Z", type: "agent.bind", agentId: "B", actor: "impl-2", task: "TASK-1.2" },
        { ts: "2026-11-06T15:44:03.681Z", type: "task.claim", actor: "impl-2", task: "TASK-1.2" },
        { ts: "2026-11-06T15:44:05.900Z", type: "agent.bind", agentId: "A", actor: "impl-1", task: "TASK-1.1" },
        { ts: "2026-11-06T15:44:05.998Z", type: "task.claim", actor: "impl-1", task: "TASK-1.1" },
      ],
    },
    new Date("2026-11-06T15:50:00Z"),
  );
  const by = Object.fromEntries(s.agents.map((a) => [a.agentId, [a.actor, a.task]]));
  assert.deepEqual(by, { A: ["impl-1", "TASK-1.1"], B: ["impl-2", "TASK-1.2"] });
});

test("state_pairs_finished_agent_by_release", () => {
  // No bindings (older plugin): the agent that stops right after a release owns that task.
  const s = buildState(
    {
      events: [
        { ts: "2026-11-06T15:43:58.576Z", type: "agent.start", agentId: "A", data: { agentType: "maestro:implementer" } },
        { ts: "2026-11-06T15:43:58.577Z", type: "agent.start", agentId: "B", data: { agentType: "maestro:implementer" } },
        { ts: "2026-11-06T15:44:03.681Z", type: "task.claim", actor: "impl-2", task: "TASK-1.2" },
        { ts: "2026-11-06T15:44:05.998Z", type: "task.claim", actor: "impl-1", task: "TASK-1.1" },
        { ts: "2026-11-06T15:48:21.422Z", type: "task.release", actor: "impl-2", task: "TASK-1.2" },
        { ts: "2026-11-06T15:48:33.386Z", type: "agent.stop", agentId: "B", data: { agentType: "maestro:implementer" } },
      ],
    },
    new Date("2026-11-06T15:50:00Z"),
  );
  const by = Object.fromEntries(s.agents.map((a) => [a.agentId, [a.actor, a.task, a.state]]));
  assert.deepEqual(by, { A: ["impl-1", "TASK-1.1", "running"], B: ["impl-2", "TASK-1.2", "finished"] });
});

test("state_shows_resumed_agent_as_running", () => {
  const s = buildState(
    {
      events: [
        { ts: "2026-11-06T15:43:58Z", type: "agent.start", agentId: "A", data: { agentType: "maestro:implementer" } },
        { ts: "2026-11-06T15:44:05Z", type: "agent.bind", agentId: "A", actor: "impl-1", task: "TASK-1.1" },
        { ts: "2026-11-06T15:52:25Z", type: "agent.stop", agentId: "A", data: { agentType: "maestro:implementer" } },
        { ts: "2026-11-06T15:52:48Z", type: "agent.start", agentId: "A", data: { agentType: "maestro:implementer" } }, // resumed
      ],
    },
    new Date("2026-11-06T15:55:00Z"),
  );
  const a = s.agents[0];
  assert.deepEqual([a.actor, a.task, a.state, a.since, a.until], ["impl-1", "TASK-1.1", "running", "2026-11-06T15:43:58Z", null]);
});

test("state_builds_goal_breakdown", () => {
  const start = (ts, agentId, agentType) => ({ ts, type: "agent.start", actor: "hook", agentId, data: { agentType } });
  const stop = (ts, agentId, agentType, models) => ({ ts, type: "agent.stop", actor: "hook", agentId, data: { agentType, usage: { models, wallMs: 1 } } });
  const goalTask = { ...parent("TASK-2", null), title: "Second goal", labels: ["goal"], status: "In Progress" };
  const events = [
    { ts: "2026-11-06T09:00:00Z", type: "goal.start", goal: "TASK-1" },
    start("2026-11-06T08:59:00Z", "early", "maestro:implementer"), // before the window: not counted
    stop("2026-11-06T09:01:00Z", "early", "maestro:implementer", { "claude-opus-5-5": { output: 1e6 } }),
    start("2026-11-06T09:01:00Z", "arch", "maestro:architect"),
    stop("2026-11-06T09:20:00Z", "arch", "maestro:architect", { "claude-opus-5-5": { output: 1e6 } }),
    start("2026-11-06T09:05:00Z", "impl1", "maestro:implementer"),
    stop("2026-11-06T09:30:00Z", "impl1", "maestro:implementer", { "claude-sonnet-5-5": { input: 1e6 } }),
    start("2026-11-06T09:06:00Z", "gp", "general-purpose"),
    stop("2026-11-06T09:07:00Z", "gp", "general-purpose", { "claude-haiku-5-5": { output: 1e6 } }),
    measure("2026-11-06T09:31:00Z", "TASK-1.1", { "claude-sonnet-5-5": { input: 1e6 } }),
    // The architect is resumed: its second stop carries the cumulative usage, the first one is not added.
    start("2026-11-06T09:40:00Z", "arch", "maestro:architect"),
    stop("2026-11-06T09:50:00Z", "arch", "maestro:architect", { "claude-opus-5-5": { output: 1.5e6 } }),
    start("2026-11-06T09:45:00Z", "qa", "maestro:qa-explorer"),
    stop("2026-11-06T09:50:00Z", "qa", "maestro:qa-explorer", { "claude-haiku-5-5": { input: 1e6 } }),
    start("2026-11-06T09:55:00Z", "cr", "maestro:code-reviewer"),
    stop("2026-11-06T10:05:00Z", "cr", "maestro:code-reviewer", { "claude-sonnet-5-5": { output: 1e5 } }), // stops after goal.done: still counted
    { ts: "2026-11-06T10:00:00Z", type: "goal.done", goal: "TASK-1" },
    start("2026-11-06T10:00:00Z", "late", "maestro:implementer"), // the window end is exclusive
    // A second GOAL, still open, with no measured task: one agent running, one resumed and running again.
    { ts: "2026-11-06T14:00:00Z", type: "goal.start", goal: "task-2" },
    start("2026-11-06T14:10:00Z", "impl3", "maestro:implementer"),
    stop("2026-11-06T14:20:00Z", "impl3", "maestro:implementer", { "claude-sonnet-5-5": { input: 1e6 } }),
    start("2026-11-06T14:30:00Z", "impl3", "maestro:implementer"),
    start("2026-11-06T15:00:00Z", "impl4", "maestro:implementer"),
    // A GOAL from older data: task measures, no goal.start.
    measure("2026-11-06T15:01:00Z", "TASK-3.1", { "claude-sonnet-5-5": { input: 1e6 } }),
  ];
  const calls = [];
  const pmUsage = ({ from, to }) => {
    calls.push([new Date(from).toISOString(), new Date(to).toISOString()]);
    return { sessions: 1, models: { "claude-opus-5-5": { input: 1e6 } } };
  };
  const now = new Date("2026-11-06T15:30:42Z");
  const tasks = [parent("TASK-1.1", "TASK-1"), goalTask, parent("TASK-3.1", "TASK-3")];
  const s = buildState({ tasks, events, pmUsage }, now);
  const goals = Object.fromEntries(s.costs.goals.map((g) => [g.goal, g]));
  const roles = (g) => Object.fromEntries(g.breakdown.map((r) => [r.role, [r.agents, r.running, r.usd]]));

  // Newest GOAL window first, then GOALs known only from task measures.
  assert.deepEqual(s.costs.goals.map((g) => g.goal), ["TASK-2", "TASK-1", "TASK-3"]);

  // Closed GOAL: split by role. pm 1M opus input = 4; architect 1.5M opus output = 30 (latest stop only);
  // implementer 1M sonnet input = 2; qa 1M haiku input = 0.1; reviewer 100k sonnet output = 1; other 1M haiku output = 0.5.
  const g1 = goals["TASK-1"];
  assert.deepEqual(g1.breakdown.map((r) => r.role), ["pm", "architect", "implementer", "qa", "reviewer", "other"]);
  assert.deepEqual(roles(g1), {
    pm: [1, 0, 4],
    architect: [1, 0, 30],
    implementer: [1, 0, 2],
    qa: [1, 0, 0.1],
    reviewer: [1, 0, 1],
    other: [1, 0, 0.5],
  });
  assert.deepEqual(g1.breakdown[1].models, { "claude-opus-5-5": { input: 0, output: 1.5e6, cacheRead: 0, cacheWrite: 0 } });
  assert.equal(g1.total.usd, 37.6);
  assert.deepEqual(g1.total.models["claude-opus-5-5"], { input: 1e6, output: 1.5e6, cacheRead: 0, cacheWrite: 0 });
  assert.deepEqual(g1.window, { from: "2026-11-06T09:00:00.000Z", to: "2026-11-06T10:00:00.000Z", open: false });
  // The per-task fields from task.measure are unchanged.
  assert.deepEqual([g1.title, g1.tasks, g1.usd, g1.wallMs], ["TASK-1", 1, 2, 100]);

  // Open GOAL without task measures: listed with its tracker title; running agents are pending. A resumed agent
  // keeps the tokens of its earlier stop while it runs again (lower bound: 1M sonnet input = $2), so totals never drop.
  const g2 = goals["TASK-2"];
  assert.deepEqual([g2.title, g2.tasks, g2.usd, g2.wallMs], ["Second goal", 0, null, 0]);
  assert.deepEqual(g2.window, { from: "2026-11-06T14:00:00.000Z", to: null, open: true });
  assert.deepEqual(roles(g2).implementer, [2, 2, 2]);
  assert.deepEqual(g2.breakdown.find((r) => r.role === "implementer").models, { "claude-sonnet-5-5": { input: 1e6, output: 0, cacheRead: 0, cacheWrite: 0 } });
  assert.equal(g2.total.usd, 6); // the PM (4) and the resumed implementer's earlier stop (2)

  // The PM reader got each window; the open one ends on the current minute (cacheable).
  assert.deepEqual([...calls].sort(), [
    ["2026-11-06T09:00:00.000Z", "2026-11-06T10:00:00.000Z"],
    ["2026-11-06T14:00:00.000Z", "2026-11-06T15:30:00.000Z"],
  ]);

  // Older data: no goal.start, so no breakdown, but the measured GOAL is still there.
  assert.equal(goals["TASK-3"].tasks, 1);
  assert.equal(goals["TASK-3"].breakdown, undefined);

  // No PM session known: pm has no agents and a note; the rest is unchanged.
  for (const pm of [undefined, () => null]) {
    const n = buildState({ tasks, events, pmUsage: pm }, now).costs.goals.find((g) => g.goal === "TASK-1");
    const row = n.breakdown[0];
    assert.deepEqual([row.role, row.agents, row.usd], ["pm", 0, null]);
    assert.match(row.note, /PM session/);
    assert.equal(n.total.usd, 33.6);
  }
});

test("state_reads_pm_sessions_for_goal_cost", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "maestro-pm-")));
  assert.equal(pmUsageReader(dir), null); // no pm-sessions.json yet
  const transcript = writeTranscript([
    assistant("before", { input: 1e6 }, { timestamp: "2026-11-06T08:00:00.000Z" }),
    assistant("in", { input: 1e6 }, { timestamp: "2026-11-06T09:30:00.000Z", model: "claude-opus-5-5" }),
  ]);
  mkdirSync(join(dir, ".maestro", "runtime"), { recursive: true });
  writeFileSync(
    join(dir, ".maestro", "runtime", "pm-sessions.json"),
    JSON.stringify({ sessions: [{ sessionId: "s1", transcriptPath: transcript }, { sessionId: "gone", transcriptPath: join(dir, "missing.jsonl") }] }),
  );
  const read = pmUsageReader(dir);
  const window = { from: Date.parse("2026-11-06T09:00:00Z"), to: Date.parse("2026-11-06T10:00:00Z") };
  assert.deepEqual(read(window), { sessions: 1, models: { "claude-opus-5-5": { input: 1e6, output: 0, cacheRead: 0, cacheWrite: 0 } } });
  // Through loadState: the PM row of a GOAL window uses the recorded sessions.
  writeFileSync(
    join(dir, ".maestro", "events.jsonl"),
    [{ ts: "2026-11-06T09:00:00Z", type: "goal.start", goal: "TASK-1" }, { ts: "2026-11-06T10:00:00Z", type: "goal.done", goal: "TASK-1" }].map((e) => JSON.stringify(e)).join("\n") + "\n",
  );
  const g = loadState(dir, { now: NOW }).costs.goals[0];
  assert.deepEqual([g.goal, g.breakdown[0].role, g.breakdown[0].agents, g.breakdown[0].usd, g.total.usd], ["TASK-1", "pm", 1, 4, 4]);
});

test("frontmatter_parser_reads_block_scalar_titles", () => {
  const folded = parseFrontmatter("---\nid: TASK-1.10\ntitle: >-\n  Difetto: quote sulla stanza\n  di una 5x4\nstatus: Done\n---\n");
  assert.equal(folded.data.title, "Difetto: quote sulla stanza di una 5x4");
  assert.equal(folded.data.status, "Done");
  const literal = parseFrontmatter("---\nnote: |\n  line one\n  line two\n\nlabels:\n  - goal\n---\n");
  assert.equal(literal.data.note, "line one\nline two");
  assert.deepEqual(literal.data.labels, ["goal"]);
});

test("costs_split_an_agent_shared_by_several_tasks", () => {
  const stop = (ts, agentId, models, wallMs) => ({ ts, type: "agent.stop", agentId, data: { agentType: "maestro:implementer", usage: { models, wallMs } } });
  const m = (ts, task, agentIds, models, wallMs) => ({ ts, type: "task.measure", task, data: { agentIds, usage: { models, wallMs }, wallMs } });
  const sonnet = (input) => ({ "claude-sonnet-5-5": { input, output: 0, cacheRead: 0, cacheWrite: 0 } });
  const s = buildState(
    {
      tasks: ["TASK-1.1", "TASK-1.2", "TASK-1.3", "TASK-1.4", "TASK-1.5"].map((id) => parent(id, "TASK-1")),
      events: [
        // One implementer (b1) did a batch of three tasks: each measure recorded the agent's full usage.
        stop("2026-11-06T10:00:00Z", "b1", sonnet(3e6), 300),
        m("2026-11-06T10:01:00Z", "TASK-1.1", ["b1"], sonnet(3e6), 300),
        m("2026-11-06T10:01:00Z", "TASK-1.2", ["b1"], sonnet(3e6), 300),
        m("2026-11-06T10:01:00Z", "TASK-1.3", ["b1"], sonnet(3e6), 300),
        // TASK-1.4: an agent killed by a usage limit (k1, no agent.stop) plus b2, which also did TASK-1.5.
        stop("2026-11-06T11:00:00Z", "b2", sonnet(2e6), 200),
        m("2026-11-06T11:01:00Z", "TASK-1.4", ["k1", "b2"], sonnet(2.5e6), 260),
        m("2026-11-06T11:01:00Z", "TASK-1.5", ["b2"], sonnet(2e6), 200),
        // Re-measuring the same agent for the same task counts it once.
        m("2026-11-06T11:02:00Z", "TASK-1.5", ["b2"], sonnet(2e6), 200),
      ],
    },
    NOW,
  );
  const t = Object.fromEntries(s.costs.tasks.map((x) => [x.task, x]));
  for (const id of ["TASK-1.1", "TASK-1.2", "TASK-1.3"]) {
    assert.equal(t[id].models["claude-sonnet-5-5"].input, 1e6);
    assert.equal(t[id].wallMs, 100);
  }
  assert.deepEqual(t["TASK-1.1"].sharedWith, ["TASK-1.2", "TASK-1.3"]);
  // 1.4: half of b2 (1M) plus what the measure holds beyond b2 for k1 (0.5M).
  assert.equal(t["TASK-1.4"].models["claude-sonnet-5-5"].input, 1.5e6);
  assert.equal(t["TASK-1.4"].wallMs, 160);
  assert.equal(t["TASK-1.5"].models["claude-sonnet-5-5"].input, 1e6);
  assert.deepEqual(t["TASK-1.5"].sharedWith, ["TASK-1.4"]);
  // The GOAL's measured total is what the agents used: 3M + 2M + 0.5M.
  assert.equal(s.costs.goals[0].models["claude-sonnet-5-5"].input, 5.5e6);
});

test("agents_killed_by_a_usage_limit_are_not_running", () => {
  const sonnet = (input) => ({ "claude-sonnet-5-5": { input, output: 0, cacheRead: 0, cacheWrite: 0 } });
  const s = buildState(
    {
      tasks: [parent("TASK-1.1", "TASK-1"), parent("TASK-1.2", "TASK-1")],
      events: [
        { ts: "2026-11-06T13:00:00Z", type: "goal.start", goal: "TASK-1", actor: "pm", data: {} },
        { ts: "2026-11-06T13:01:00Z", type: "agent.start", agentId: "k1", data: { agentType: "maestro:implementer" } },
        { ts: "2026-11-06T13:02:00Z", type: "agent.bind", agentId: "k1", actor: "impl-1", task: "TASK-1.1", data: {} },
        { ts: "2026-11-06T13:03:00Z", type: "agent.start", agentId: "r1", data: { agentType: "maestro:architect" } },
        { ts: "2026-11-06T13:10:00Z", type: "limit.hit", actor: "hook", data: { error: "rate_limit" } },
        // r1 is resumed after the limit: it runs again. k1 never comes back; b2 finishes TASK-1.1.
        { ts: "2026-11-06T15:00:00Z", type: "agent.start", agentId: "r1", data: { agentType: "maestro:architect" } },
        { ts: "2026-11-06T15:01:00Z", type: "agent.start", agentId: "b2", data: { agentType: "maestro:implementer" } },
        { ts: "2026-11-06T15:20:00Z", type: "agent.stop", agentId: "b2", data: { agentType: "maestro:implementer", usage: { models: sonnet(2e6), wallMs: 100 } } },
        { ts: "2026-11-06T15:21:00Z", type: "task.measure", task: "TASK-1.1", data: { agentIds: ["k1", "b2"], usage: { models: sonnet(3e6), wallMs: 160 }, wallMs: 160 } },
      ],
    },
    NOW,
  );
  const by = Object.fromEntries(s.agents.map((a) => [a.agentId, a]));
  assert.equal(by.k1.state, "finished");
  assert.equal(by.k1.until, "2026-11-06T13:10:00Z");
  assert.equal(by.r1.state, "running");
  // The killed agent's share of the measure (3M - 2M) is in the implementer row of the full GOAL cost.
  const impl = s.costs.goals[0].breakdown.find((r) => r.role === "implementer");
  assert.equal(impl.models["claude-sonnet-5-5"].input, 3e6);
  assert.equal(impl.running, 0);
});

const mk = (id, extra = {}) => ({ ...parent(id, null), ...extra });
const dec = (id, status = "open") => ({ id, title: id, status, date: null, path: null });

test("waiting_separates_blocking_items_from_open_questions", () => {
  const s = buildState(
    {
      tasks: [
        mk("TASK-1", { labels: ["goal"], status: "In Progress", decisionRefs: ["decision-7"] }),
        mk("TASK-1.1", { parent: "TASK-1", status: "Blocked", decisionRefs: ["decision-8"] }),
        mk("TASK-1.2", { parent: "TASK-1", status: "Ready", decisionRefs: ["decision-9"] }),
        mk("TASK-2", { labels: ["goal"], status: "To Do", decisionRefs: ["decision-2"] }),
      ],
      decisions: [dec("decision-2"), dec("decision-4"), dec("decision-7"), dec("decision-8", "proposed"), dec("decision-9", "accepted")],
    },
    NOW,
  );
  const by = Object.fromEntries(s.decisions.map((d) => [d.id, d.blocking]));
  assert.deepEqual(by, { "decision-2": false, "decision-4": false, "decision-7": true, "decision-8": true, "decision-9": false });
  assert.equal(s.header.ownerWaiting, 3); // blocked task + decision-7 + decision-8
  assert.equal(s.header.ownerQuestions, 2); // decision-2, decision-4
});

test("task_files_report_the_decisions_they_mention", () => {
  const t = parseTaskFile("---\nid: TASK-3\ntitle: x\nlabels: [goal]\n---\n\nSee decision-7 and Decision-3, again decision-7. Not decision-x.\n");
  assert.deepEqual(t.decisionRefs, ["decision-7", "decision-3"]);
});

test("milestone_with_all_goals_done_and_only_drafts_is_completed", () => {
  const s = buildState(
    {
      milestones: [{ id: "m-1", title: "One" }, { id: "m-2", title: "Two" }, { id: "m-3", title: "Empty" }],
      tasks: [
        mk("TASK-1", { labels: ["goal"], status: "Done", milestone: "m-1" }),
        mk("TASK-2", { labels: ["goal"], status: "In Progress", milestone: "m-2" }),
        mk("TASK-3", { labels: ["goal"], status: "Done", milestone: "m-2" }),
      ],
      drafts: [{ id: "draft-1", title: "d", milestone: "m-1" }, { id: "draft-2", title: "d", milestone: "m-3" }],
    },
    NOW,
  );
  const done = Object.fromEntries(s.milestones.map((m) => [m.id, m.completed]));
  assert.deepEqual(done, { "m-1": true, "m-2": false, "m-3": false });
  assert.equal(s.milestones[0].drafts.length, 1);
});

test("tasks_without_a_goal_are_listed_under_their_milestone", () => {
  const s = buildState(
    {
      milestones: [{ id: "m-1", title: "One" }],
      tasks: [
        mk("TASK-1", { labels: ["goal"], milestone: "m-1" }),
        mk("TASK-1.1", { parent: "TASK-1", milestone: "m-1" }),
        mk("TASK-5", { title: "Debt", status: "To Do", milestone: "m-1" }),
        mk("TASK-6", { title: "Loose", status: "Ready" }),
        mk("TASK-7", { title: "Gone", archived: true }),
      ],
    },
    NOW,
  );
  const m1 = s.milestones.find((m) => m.id === "m-1");
  assert.deepEqual(m1.tasks, [{ id: "TASK-5", title: "Debt", status: "To Do" }]);
  const none = s.milestones.find((m) => m.id === null);
  assert.deepEqual(none.tasks.map((t) => t.id), ["TASK-6"]);
  assert.equal(none.completed, false);
});

test("agents_report_their_model_measured_then_recorded_then_planned", () => {
  const u = (m, n) => ({ models: { [m]: { input: n, output: 0, cacheRead: 0, cacheWrite: 0 }, "claude-haiku-4-5": { input: 1, output: 0, cacheRead: 0, cacheWrite: 0 } } });
  const s = buildState(
    {
      tasks: [mk("TASK-1.1", { parent: "TASK-1", plannedModel: "opus" }), mk("TASK-1.2", { parent: "TASK-1" })],
      events: [
        { ts: "2026-11-06T14:00:00Z", type: "agent.start", agentId: "f1", data: { agentType: "maestro:implementer" } },
        { ts: "2026-11-06T14:00:10Z", type: "agent.bind", agentId: "f1", actor: "impl-1", task: "TASK-1.1", data: { model: "claude-sonnet-5-5" } },
        { ts: "2026-11-06T14:10:00Z", type: "agent.stop", agentId: "f1", data: { agentType: "maestro:implementer", usage: u("claude-opus-5-5", 100) } },
        { ts: "2026-11-06T15:00:00Z", type: "agent.start", agentId: "r1", data: { agentType: "maestro:implementer" } },
        { ts: "2026-11-06T15:00:10Z", type: "agent.bind", agentId: "r1", actor: "impl-2", task: "TASK-1.2", data: { model: "claude-sonnet-5-5" } },
        { ts: "2026-11-06T15:05:00Z", type: "agent.start", agentId: "p1", data: { agentType: "maestro:implementer" } },
        { ts: "2026-11-06T15:05:10Z", type: "agent.bind", agentId: "p1", actor: "impl-1", task: "TASK-1.1", data: {} },
        { ts: "2026-11-06T15:06:00Z", type: "agent.start", agentId: "a1", data: { agentType: "maestro:architect" } },
        { ts: "2026-11-06T15:07:00Z", type: "agent.start", agentId: "q1", data: { agentType: "maestro:qa-explorer" } },
      ],
    },
    NOW,
  );
  const m = Object.fromEntries(s.agents.map((a) => [a.agentId, [a.model, a.modelPlanned]]));
  assert.deepEqual(m, { f1: ["claude-opus-5-5", false], r1: ["claude-sonnet-5-5", false], p1: ["opus", true], a1: ["opus", true], q1: [null, false] });
});

test("task_files_report_the_model_planned_in_their_notes", () => {
  assert.equal(parseTaskFile("---\nid: TASK-3.1\ntitle: x\n---\n\nModello: Opus, effort medium.\n").plannedModel, "opus");
  assert.equal(parseTaskFile("---\nid: TASK-3.1\ntitle: x\n---\n\nmodel: sonnet\n").plannedModel, "sonnet");
  assert.equal(parseTaskFile("---\nid: TASK-3.1\ntitle: x\n---\n\nno hint\n").plannedModel, null);
});

test("qa_and_review_agents_carry_the_mission_of_the_nearest_earlier_start_event", () => {
  const s = buildState(
    {
      events: [
        { ts: "2026-11-06T10:00:00Z", type: "qa.start", actor: "pm", data: { qa: "QA-1" } },
        { ts: "2026-11-06T10:01:00Z", type: "agent.start", agentId: "q1", data: { agentType: "maestro:qa-explorer" } },
        { ts: "2026-11-06T11:00:00Z", type: "qa.start", actor: "pm", data: { qa: "QA-2" } },
        { ts: "2026-11-06T11:00:30Z", type: "review.start", actor: "pm", data: { review: "CR-1" } },
        { ts: "2026-11-06T11:01:00Z", type: "agent.start", agentId: "q2", data: { agentType: "maestro:qa-explorer" } },
        { ts: "2026-11-06T11:02:00Z", type: "agent.start", agentId: "c1", data: { agentType: "maestro:code-reviewer" } },
        { ts: "2026-11-06T11:03:00Z", type: "agent.start", agentId: "a1", data: { agentType: "maestro:architect" } },
      ],
    },
    NOW,
  );
  const m = Object.fromEntries(s.agents.map((a) => [a.agentId, a.mission]));
  assert.deepEqual(m, { q1: "QA-1", q2: "QA-2", c1: "CR-1", a1: null });
});

test("running_agent_shows_the_model_it_was_launched_with", () => {
  const events = [
    { ts: "2026-11-06T15:00:00Z", type: "agent.start", agentId: "i9", data: { agentType: "maestro:implementer" } },
    { ts: "2026-11-06T15:01:00Z", type: "agent.bind", agentId: "i9", actor: "impl-1", task: "TASK-1.1", data: {} },
  ];
  const tasks = [{ ...parent("TASK-1.1", "TASK-1"), status: "In Progress", plannedModel: "sonnet" }];
  const launched = buildState({ tasks, events, agentModel: (id) => (id === "i9" ? "claude-opus-5-5" : null) }, NOW).agents[0];
  assert.deepEqual([launched.model, launched.modelPlanned], ["claude-opus-5-5", false]);
  const planned = buildState({ tasks, events }, NOW).agents[0];
  assert.equal(planned.modelPlanned, true);
});
