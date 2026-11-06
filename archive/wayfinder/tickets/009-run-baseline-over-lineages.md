---
id: 9
title: Run the baseline over the three lineages
type: task
status: open
assignee:
blocked_by: [7, 8]
created: 2026-09-18
closed:
---

## Question

Run the v0 test set against each lineage with the agreed repetitions,
aggregate, and publish the baseline report as a linked asset. Beyond the
numbers, record the observed failure modes per lineage (where cost
concentrates, where accuracy breaks, how often the human is interrupted): they
feed the trunk, routing and enforcement decisions.

If the budget allows, run the strongest lineage in at least two hub-model
variants (economical hub vs strong hub): ticket 15 needs that contrast.

Include a **control arm**: a bare Claude Code session with no orchestrator, on
the same model and an equalised budget. Research 4 shows single agents match
or beat multi-agent systems at equal token spend, so without this arm the
baseline cannot show that orchestration pays for itself.

Research 18 adds a second control: the strongest available model alone at
`low` effort, since it beat cheaper models on both accuracy and cost per task
on SWE-bench Pro. Hub-model variants should be read against that line.
