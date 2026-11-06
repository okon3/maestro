---
id: TASK-4
title: M-3 Dashboard
status: In Progress
assignee: []
created_date: '2026-11-06T13:55:00Z'
updated_date: '2026-11-06T15:03:00Z'
labels:
  - goal
milestone: m-0
dependencies:
  - TASK-3
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Outcome: a local read-only dashboard, code in the plugin, launched per project (/maestro:dashboard). Approved in outline on 2026-11-06 (dashboard before the pilot). Exclusions: any write action, Paseo panel. Authority: local commits here; publishing as for M-2.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Node server with no dependencies serving one page on localhost for the current project
- [ ] #2 Views Roadmap (milestones -> GOALs -> tasks with dependencies), Board, Agents (who, what, since when), Decisions, Reports
- [ ] #3 Header shows active GOAL, master commit, code-review counter, PM context % and 5h/weekly usage
- [ ] #4 Live refresh from backlog task list --json --watch and the event log
- [ ] #5 Costs view: per task and per GOAL tokens by model, wall time, rework cycles and owner interventions from task.measure events, with a list-price USD estimate clearly labelled as an estimate
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Approved by the owner on 2026-11-06 with the added costs view.
<!-- SECTION:NOTES:END -->
