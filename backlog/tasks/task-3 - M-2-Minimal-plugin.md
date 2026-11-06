---
id: TASK-3
title: M-2 Minimal plugin
status: To Do
assignee: []
created_date: '2026-11-06T13:55:00Z'
updated_date: '2026-11-06T14:04:00Z'
labels:
  - goal
milestone: m-0
dependencies:
  - TASK-2
references:
  - team-workflow/flusso-team-agenti.html
  - prompts/orchestrator-prompt-v4.md
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Outcome: a validated Maestro plugin, published in this repo's marketplace on GitHub, runs a GOAL end to end (PM -> architect -> 2 implementers -> integration), and Agriturismo uses it instead of its SOL/Luna/Terra rules. Approved in outline on 2026-11-06; the architect details tasks in waves at GOAL start. Exclusions: dashboard (M-3), separate test author (A3), parallel GOALs (Q3), Paseo dependency. Authority: local commits here; publishing (push to okon3/maestro) and local commits in E:/Projects/Agriturismo to be confirmed by the owner when the GOAL starts; no deploy.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 claude plugin validate passes for the plugin and the marketplace
- [ ] #2 Agents architect, implementer, qa-explorer, code-reviewer; PM skill absorbing orchestrator v4 (authority, decisions, retries <=2, critique cycles <=2)
- [ ] #3 Skills start-goal, pause, resume, triage-qa, periodic-review, decision
- [ ] #4 Hooks: event log, context and usage thresholds, compaction re-injection, Backlog.md presence/version check with install hint
- [ ] #5 bin/ commands: claim/lock (one CLAIMED under concurrency) and worktree from the GOAL branch
- [ ] #6 Per-task measurement record: tokens, wall time, owner interventions, rework (option B)
- [ ] #7 Toy GOAL in a lab repo runs unattended from PM to integration, with events logged and guided compaction re-injecting the handoff
- [ ] #8 Agriturismo installs the plugin from the GitHub marketplace; PLAN.md migrated (history archived, future GOALs in Backlog.md); AGENTS.md updated
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-06: owner authorized pushes to okon3/maestro and changes in Agriturismo to install the plugin and revise its configuration (decision-18).
<!-- SECTION:NOTES:END -->
