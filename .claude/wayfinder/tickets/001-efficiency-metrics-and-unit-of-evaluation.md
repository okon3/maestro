---
id: 1
title: Define the efficiency metrics and the unit of evaluation
type: grilling
status: open
assignee:
blocked_by: []
created: 2026-09-18
closed:
---

## Question

"Efficient" is a balance of accuracy and cost. Which concrete dimensions is an
orchestrator iteration measured on, how is each observed, and what is the unit
a measurement attaches to?

Decide:

- **Accuracy dimensions**: acceptance criteria met (binary or graded, judged
  how), defects found by an independent review, regressions in the fixture's
  existing tests, scope creep, quality of the tracker or plan state left behind.
- **Cost dimensions**: tokens per model converted to USD, wall-clock time,
  human interventions (questions asked, corrections requested), retries and
  correction rounds, agents spawned.
- **Unit**: one task, one goal with several tasks, or one whole session; where
  a run starts and ends.
- **Comparison rule**: Pareto front, a weighted score, or "accuracy at a fixed
  budget"; what counts as an improvement between iterations. Sample size and
  variance stay in the fog until the baseline exists.

## Context pointers

- v4 §1 lists the cost components: `orchestrator-prompt-v4.md`.
- `orchestrate` logs `T<id>: impl <subagent_tokens>, critic <subagent_tokens>, <n> rounds`
  per task: `plugins/orchestrate/skills/orchestrate/SKILL.md`, "Verifying" step 6.
- codegenesis uses a priori USD estimates per micro-task, not measurements:
  `plugins/codegenesis/skills/cg-setup/templates/cost-estimation-config.md`.
- `skill-creator` benchmark schema: pass_rate, time, tokens, mean ± stddev
  (`references/schemas.md`).
- Research 4 (`research/04-agent-eval-landscape.md`): grade end state, not
  trajectory; MAST's 14 failure modes are candidate accuracy sub-dimensions;
  the comparison rule must equalise cost against a bare session, since single
  agents match multi-agent systems at equal token budget.
- Research 5 (`research/05-claude-code-measurement-surface.md`): cost per
  model including subagents comes from headless `modelUsage` or the
  transcript `cost-state` entry; agents spawned from `subagent_stats`;
  per-agent tokens, duration and tool counts from the Agent tool result;
  interruptions from `permission_denials` and hook events. Pick metrics that
  these fields can feed without new instrumentation.
