---
id: TASK-3
title: M-2 Minimal plugin
status: Done
assignee: []
created_date: '2026-11-06T13:55:00Z'
updated_date: '2026-11-06T14:56:00Z'
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
- [x] #1 claude plugin validate passes for the plugin and the marketplace
- [x] #2 Agents architect, implementer, qa-explorer, code-reviewer; PM skill absorbing orchestrator v4 (authority, decisions, retries <=2, critique cycles <=2)
- [x] #3 Skills start-goal, pause, resume, triage-qa, periodic-review, decision
- [x] #4 Hooks: event log, context and usage thresholds, compaction re-injection, Backlog.md presence/version check with install hint
- [x] #5 bin/ commands: claim/lock (one CLAIMED under concurrency) and worktree from the GOAL branch
- [x] #6 Per-task measurement record: tokens, wall time, owner interventions, rework (option B)
- [x] #7 Toy GOAL in a lab repo runs unattended from PM to integration, with events logged and guided compaction re-injecting the handoff
- [x] #8 Agriturismo installs the plugin from the GitHub marketplace; PLAN.md migrated (history archived, future GOALs in Backlog.md); AGENTS.md updated
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-06: owner authorized pushes to okon3/maestro and changes in Agriturismo to install the plugin and revise its configuration (decision-18).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Maestro plugin published on okon3/maestro (marketplace okon3, plugin maestro): 4 agents, 9 skills (pm, start-goal, pause, resume, triage-qa, periodic-review, decision, init with adoption), 8 hook scripts (events, context bands, compaction re-injection, agent usage, limit hits, secret guard), maestro CLI (doctor, claim/release with lock, worktree from goal branch, event, measure, usage probe, context, status), templates, 46 tests. Two headless lab runs (e2e-1: full GOAL with QA and review, 10 min, 2.80 USD list; e2e-2: parallel implementers 4 ms apart, guided compaction verified). Agriturismo adopted Maestro (master 619c5d8). Deviation on AC4: the Backlog.md version check and usage thresholds run through 'maestro doctor' / 'maestro usage --probe' called by the PM skills, not inside hooks (hooks stay fast); context thresholds are hooks.
<!-- SECTION:FINAL_SUMMARY:END -->
