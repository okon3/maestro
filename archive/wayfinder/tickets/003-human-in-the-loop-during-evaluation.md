---
id: 3
title: Decide how the human side is handled during evaluation
type: grilling
status: open
assignee:
blocked_by: [1, 4]
created: 2026-09-18
closed:
---

## Question

All three lineages stop for the user: goal approval, product questions, the
end-of-task gate. In an automated run, who answers, and how is that cost
counted?

Options to weigh: a scripted user persona (an LLM given a hidden intent
document and a fixed answering policy, as in user-simulator benchmarks), a
canned FAQ with a "proceed" default, evaluating only the AFK segment from
approved goal to done, or a live human for a small subset. Decide which, how
the persona's answers stay consistent across iterations, and how questions
asked are scored (a cost, a quality signal, or both).

## Context pointers

- Research ticket 4 should report how τ-bench-style user simulation works and
  its known biases.
- `orchestrate` asks after every completed task by design ("After every
  completed task, stop and ask"); v4 asks at GOAL approval and for
  consequential decisions.
- Research 4, "Handling the human in the loop": simulated users inflate
  success by about 14 points and no benchmark scores approval-gate behaviour;
  its recommendation is AFK segment plus a frozen canned-answer table plus a
  small live-human calibration subset (`research/04-agent-eval-landscape.md`).
