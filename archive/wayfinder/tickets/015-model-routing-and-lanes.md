---
id: 15
title: Decide model routing and lane structure
type: grilling
status: open
assignee:
blocked_by: [9, 18]
created: 2026-09-18
closed:
---

## Question

Given where the baseline shows cost and failures concentrating, settle the
model tiering of maestro:

- **Hub tier**: does the hub run on an economical model (Sonnet) with strong
  models bought only in bursts (spec, brief for non-routine tasks, review), or
  on Opus as `orchestrate` does today? The ceiling of a Sonnet hub delegating
  to Sonnet workers is set by whoever wrote the spec and the brief, not by the
  executor: test the hypothesis "Sonnet hub + Fable spec ≥ Opus hub" on the
  harness rather than by intuition.
- **Routing signal**: which observable features decide the lane for a task, so
  the choice is auditable: v4's capability table (reasoning demands,
  interacting constraints, error consequences, detectability),
  `orchestrate`'s single question ("how much does the outcome depend on
  judgment the brief cannot capture"), or brief completeness as the mechanical
  signal (all seven parts filled → routine lane; a gap → analysis or a deeper
  lane).
- **Pre-route vs escalate**: where a cheap-first cascade is acceptable
  (failure is cheap and detectable, e.g. implementation covered by tests) and
  where the task must be pre-routed high (architecture, security, ambiguous
  specs) because a wrong answer is expensive or undetectable. v4 §1 forbids
  "cheaper-model failure first" as a general rule.
- **Instruction shaping per tier**: what a brief must contain for an
  economical lane (explicit how, examples, verification commands) versus a
  strong lane (decision boundaries, room for judgment); whether lanes stay
  fixed agent definitions with `model` and `effort` in frontmatter.
- **Recording**: how downgrade evidence, escalation steps and the per-task
  cost line are logged so the routing rule can be reviewed later (input to
  the adaptive-routing fog).

## Context pointers

- v4 §1 "Capability before cost" and §7 "Delegation".
- `orchestrate` SKILL.md: "The cast", "Routing is one question",
  "Escalation — a task has a budget".
- Research ticket 18 surveys routers, cascades and role-based model
  assignment elsewhere.
- Research 18 (`research/18-model-routing-elsewhere.md`) reframes the hub
  question: published evidence never puts a weaker model at the top; the
  executor costs about 6x the planner, so a strong hub is cheap; "Sonnet hub
  + Fable spec" is the measured advisor pattern (+2.7 points, −11.9% cost)
  whose fragile term is the consult rate. The real baseline to beat is the
  strong model alone at `low` effort. Learned routers are ruled out by data
  volume; cascades only in the test-covered lane, behind an external check.
  Its per-task record schema is the candidate for the "Recording" bullet.
