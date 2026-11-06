---
id: 5
title: "Research: what Claude Code exposes today for measuring cost, time and behaviour"
type: research
status: closed
assignee: Luca Regazzi
blocked_by: []
created: 2026-09-18
closed: 2026-09-18
---

## Question

Without Mods, what can an evaluation harness capture from a Claude Code run,
how reliably, and by which mechanism?

Inventory: transcript JSONL (per-message `usage`, `isSidechain`, subagent
transcripts, model per message), headless `claude -p --output-format json`
fields (cost, usage, duration, turns), OpenTelemetry export (metrics and
events, exporters, what is attributed per subagent), hook event payloads
(`SubagentStop`, `Stop`, `PostToolUse`, `--include-hook-events`), `/cost` and
`/stats`, `total_tokens` and `duration_ms` in Agent tool results. Note
version-specific caveats for Claude Code 2.1.276. Close with a recommended
capture strategy for the harness: which mechanism for which metric, and the
gaps.

## Context pointers

- `orchestrate`'s `context-guard.mjs` already parses the transcript `usage`
  block per `tool_use_id`: a working example of transcript attribution.

## Resolution

Full report: [Claude Code measurement surface for the maestro eval harness](../research/05-claude-code-measurement-surface.md).

- **Everything maestro wants is capturable on 2.1.276 without function
  hooks**: USD per model, wall-clock, agents spawned, interruptions, tool
  calls, retries, model actually used.
- **Transcript tree (verified locally).** Subagent transcripts live at
  `~/.claude/projects/<slug>/<session>/subagents/agent-<id>.jsonl` with a
  `.meta.json` sidecar (`agentType`, `toolUseId`, `parentAgentId`,
  `spawnDepth`): the complete agent tree. The main transcript holds no
  sidechain entries. An undocumented `{"type":"cost-state"}` entry persists
  `totalCostUSD`, per-model `modelUsage` with `costUSD`, total, API and tool
  durations, lines added and removed: the `/usage` numbers with zero
  instrumentation.
- **Per-subagent behaviour is free in the Agent tool result**:
  `toolUseResult.{resolvedModel, totalTokens, totalDurationMs,
  totalToolUseCount, usage, toolStats}`.
- **Headless result JSON** carries `total_cost_usd`, `modelUsage` (the only
  field that counts subagents and splits by model), `duration_ms`,
  `duration_api_ms`, `num_turns`, `permission_denials` and an undocumented
  `subagent_stats.spawned`. Traps: `result.usage` excludes subagents,
  per-message `output_tokens` is a placeholder, parallel tool calls share one
  `message.id`.
- **Flags.** `--max-budget-usd` and `--include-hook-events` exist;
  `--max-turns` is absent on 2.1.276 (cap turns via per-agent `maxTurns`).
  Unknown flags exit 0, so flags cannot be probed by trial.
- **OTEL** is the behavioural channel: `claude_code.cost.usage` and
  `token.usage` attributed by `model`, `query_source` and `agent.name`, plus
  `tool_result` events with `duration_ms`. Console exporter works offline;
  no file exporter; custom agent and plugin names are redacted.
- **Classic hooks** expose 32 events including `SubagentStart` and
  `SubagentStop` (with `agent_id`, `agent_type`), `PostToolUseFailure`,
  `PostToolBatch`. `context-guard.mjs` is the right attribution template.
- **`claude plugin eval` ships today** (case.yaml + graders,
  `--ablation with-without`, `--runs`, `--max-cost-usd`, `--json`, HTML
  report). Reconciled with ticket 6: `claude plugin test` exists only behind
  `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` and is hidden from help, which is why
  this report did not see it.
- **Recommendation**: run behavioural graders through `claude plugin eval`
  and build a custom harness only for the cost and telemetry side it does not
  record; at least 3 runs per case, since agent-tree size varies a lot.
