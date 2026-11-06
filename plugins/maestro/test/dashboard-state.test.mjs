import { test } from "node:test";
import assert from "node:assert/strict";
import { buildState, loadState, parseFrontmatter, parseTaskFile, toIso } from "../scripts/dashboard/state.mjs";
import { PRICES, costUsd, priceFor } from "../scripts/dashboard/prices.mjs";
import { tempProject } from "./dashboard-helpers.mjs";

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

  // Header: active goal, owner waiting = 1 open decision + 1 blocked task.
  assert.deepEqual(s.header.activeGoal, { id: "TASK-1", title: "The goal", done: 1, total: 3 });
  assert.equal(s.header.ownerWaiting, 2);
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
  assert.deepEqual(by.a1, { agentId: "a1", type: "maestro:implementer", actor: "impl-1", task: "TASK-1.1", state: "finished", since: "2026-11-06T14:00:00Z", until: "2026-11-06T14:10:00Z" });
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

test("state_counts_review", () => {
  const status = (ts, to) => ({ ts, type: "task.status", task: "TASK-1.1", data: { from: "In Review", to } });
  const events = [
    status("2026-11-06T10:00:00Z", "Integrated"),
    status("2026-11-06T11:00:00Z", "Integrated"),
    status("2026-11-06T13:00:00Z", "In Review"), // not integrated
    status("2026-11-06T15:00:00Z", "Integrated"),
    status("2026-11-06T16:00:00Z", "Integrated"),
    status("2026-11-06T16:30:00Z", "Done"),
  ];
  const tags = [
    { name: "cr/CR-1", date: "2026-11-05T00:00:00.000Z" },
    { name: "cr/CR-2", date: "2026-11-06T12:00:00.000Z" },
    { name: "done/TASK-3", date: "2026-11-06T16:00:00.000Z" },
  ];
  const after = buildState({ events, git: { tags }, config: { reviewEveryTasks: 4 } }, NOW);
  assert.deepEqual(after.header.review, { integratedSinceLast: 2, every: 4, lastTag: "cr/CR-2" });
  const none = buildState({ events, git: { tags: [] } }, NOW);
  assert.deepEqual(none.header.review, { integratedSinceLast: 4, every: 15, lastTag: null });

  // End to end: the tag date comes from git (the tag is on the commit made at 14:00; 13:00 event is before it, 15:00 after).
  const { dir } = tempProject();
  const s = loadState(dir, { now: NOW });
  assert.equal(s.header.review.lastTag, "cr/CR-1");
  assert.equal(s.header.review.integratedSinceLast, 1);
  assert.equal(s.git.tags.find((t) => t.name === "cr/CR-1").date, "2026-11-06T14:00:00.000Z");
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
