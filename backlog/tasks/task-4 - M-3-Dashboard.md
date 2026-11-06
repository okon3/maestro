---
id: TASK-4
title: M-3 Dashboard
status: To Do
assignee: []
created_date: '2026-11-06T13:55:00Z'
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
<!-- AC:END -->
