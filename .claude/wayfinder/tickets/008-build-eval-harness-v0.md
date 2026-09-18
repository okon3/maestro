---
id: 8
title: Build the eval harness v0
type: task
status: open
assignee:
blocked_by: [1, 3, 5, 6]
created: 2026-09-18
closed:
---

## Question

Build the minimal runner that executes one iteration (v4 prompt, `orchestrate`
plugin, or codegenesis) on one eval case in an isolated checkout, applies the
human-side policy from ticket 3, captures the metrics from ticket 1 with the
mechanisms from ticket 5, and writes one result record per run. Prove it by
running one case end to end on one lineage.

Minimal tooling; reuse `skill-creator`'s aggregation and viewer if they fit.
Resolution records: where the harness lives, how to invoke it, the result
record schema, and the gaps it leaves.

## Context pointers

- Research 4 proposes three designs (A `claude plugin eval` on the AFK
  segment, B own headless runner with OTel cost capture, C historical MR
  replay) and recommends C for signal with A as the gate
  (`research/04-agent-eval-landscape.md`).
- Research 6: with `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` a mod captures
  per-agent usage at `turn.complete` and `cost.usd` from `$.session.usage()`;
  flag-gated, so the harness needs a classic fallback
  (`research/06-claude-mods.md`).
- Research 5 (`research/05-claude-code-measurement-surface.md`): `claude
  plugin eval` already runs multi-run, ablation-capable, cost-capped evals
  with JSON output; the custom part should be limited to harvesting the
  transcript tree (`subagents/*.jsonl` + `.meta.json`), the persisted
  `cost-state` entry and headless `modelUsage` / `subagent_stats`. Its "Run
  procedure sketch" is a ready starting point. `--max-turns` is absent on
  2.1.276.
