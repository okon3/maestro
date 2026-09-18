---
id: 13
title: "Decide the enforcement layer: prose, classic hooks, or mods"
type: grilling
status: open
assignee:
blocked_by: [5, 6]
created: 2026-09-18
closed:
---

## Question

Which protocol rules must be enforced deterministically instead of stated in
prose, and by which mechanism?

Candidates for enforcement: workers never commit, lanes spawn only from a
written brief, context thresholds and handoff, per-task cost logging, the hub
lock, tracker writes by the hub only. Mechanisms: classic JSON hooks (as
`orchestrate` does today), Claude Mods when available, or none. Decide the
fallback when mods are unavailable (degrade to hooks, or require mods), and
whether the harness's telemetry rides the same mechanism as the plugin's own
cost logging.

## Context pointers

- Research 6 (`research/06-claude-mods.md`): a user-tier mod can deny
  `agent.spawn` and rewrite its model; the feature is flag-gated and
  server-rolled, so a classic-hook fallback is mandatory; enterprise
  `sec-default` skips the user tier on `agent.spawn`, so spawn interception
  fails in managed orgs while `tool.call` and `turn.*` survive; throwing hooks
  are silently skipped, so enforcing hooks must be fail-closed.
- `orchestrate` hooks today: `deny-agent-commit`, `require-brief`,
  `context-guard`, `release-lock` (`plugins/orchestrate/hooks/`).
