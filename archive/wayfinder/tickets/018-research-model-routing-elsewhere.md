---
id: 18
title: "Research: model routing, cascades and role-based model assignment elsewhere"
type: research
status: closed
assignee: Luca Regazzi
blocked_by: []
created: 2026-09-18
closed: 2026-09-18
---

## Question

How do other systems decide which model handles which step, and what evidence
exists on the cost/quality trade-offs?

Cover: learned routers (RouteLLM, Martian, OpenRouter auto-router, Not
Diamond, Unify), cascades (FrugalGPT, cheap-first-then-escalate with
verification), role-based assignment in coding agents (Aider architect/editor
mode and its published leaderboard results, OpenHands, Claude Code agent
`model`/`effort` frontmatter, Cursor or Devin tiers if public),
planner–executor splits in the literature, and routing by error detectability
or task features. For each: routing signal, training data needed, reported
savings and quality deltas, failure modes (miscalibration, overfitting to the
benchmark, extra latency), what it takes to operate. Close with which
approaches are realistic for a single team's plugin with hundreds (not
millions) of tasks per year, and what data maestro's cost logging should
capture from day one to keep learned routing possible later.

## Resolution

Full report: [Model routing, cascades and role-based model assignment elsewhere](../research/18-model-routing-elsewhere.md).

- **Learned routing is closed to maestro, permanently.** RouteLLM needed
  about 65k preference pairs plus 120k judge-labelled samples; a team
  producing hundreds of tasks a year is three orders of magnitude short.
- **Router marketing outruns router measurement.** RouterArena finds every
  router below oracle, with worst cases at baseline accuracy for 378% of the
  cost; OpenRouter's Auto Router publishes no accuracy or savings numbers.
- **Cascades lose to pre-routing.** A lightweight pre-generation router beat
  cascades on 4 of 5 datasets (arXiv 2605.06350), mostly by never paying the
  cheap model's generation. Cascades only work behind an external check:
  self-reported uncertainty does not track correctness. Anthropic's measured
  acceptable case: run at `low` effort, re-run failures at default, about 93%
  pass rate for about half the cost. Confine cascading to the test-covered
  lane.
- **Role asymmetry is the real finding.** Heterogeneous teams reach up to
  +44% accuracy over budget-equivalent homogeneous pairs at 12x lower
  per-task cost, but reversing the role assignment costs 36% accuracy (arXiv
  2606.20629). PEAR: a weak planner hurts far more than a weak executor.
- **The executor costs about 6x the planner per task** and reads about 200x
  more input: a strong hub is a small share of the bill.
- **Aider's architect/editor advantage has evaporated** on the current
  polyglot leaderboard; it was a workaround for edit-format brittleness.
- **Published evidence on the hub is one-sided: strong model at the top,
  always.** Anthropic's own systems never invert it and the Managed Agents
  API rejects an agent more capable than its advisor. Scaffolding amplifies
  a capable model; it does not rescue a weak one.
- **"Sonnet hub + Fable spec" is the advisor pattern, and it is measured**:
  Sonnet 4.6 with an Opus 4.6 advisor scored 74.8% vs 72.1% on SWE-bench
  Multilingual at −11.9% cost per task. Fragile term: the consult rate, both
  under-consulting (executor stops detecting it is stuck) and over-consulting
  (2.6x the advisor alone). **The baseline to beat is the strong model alone
  at `low` effort**: on SWE-bench Pro, Fable 5.1 at `low` solved 88.6% at
  $0.54 per task versus Sonnet 5 at 77.4% and $0.84.
- **Unverified claim to avoid**: the "96% of score at 46% of cost" BrowseComp
  figure; the primary page says the economics reversed on the full set.
- **Proposed per-task record schema** (section "Minimal record schema"):
  identity, routing decision with `routing_rule_version` and
  `routing_reason`, task features as declared at dispatch, outcome including
  `advisor_consults` even when zero, cost split by cache read/write with
  `price_list_version`. Purpose: quarterly human review, not learning.
