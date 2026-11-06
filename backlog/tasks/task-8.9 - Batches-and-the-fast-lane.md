---
id: TASK-8.9
title: Batches and the fast lane
status: Done
assignee: []
created_date: '2026-11-06T21:49:00Z'
updated_date: '2026-11-06T22:21:00Z'
labels: []
dependencies: []
parent_task_id: TASK-8
ordinal: 22000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-19: the PM may launch one implementer for a single-task fix with no material choice, with owner approval; the periodic review counts tasks. Batches become explicit: one implementer, several small tasks, one measure that names all of them. Friction #22.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 PM skill has the fast lane; review cadence counts tasks; batch measure supported and shown in the dashboard
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Integrated (branch commits 82fd4c5..c34c75e): QA and review in parallel at GOAL end with one fix wave; PM stays on main, architect in its own goal worktree; branch and worktree cleanup at GOAL close; review cadence by integrated tasks; architect batches; PM fast lane (decision-19). CLI follow-ups (worktree --checkout/--base, batch --rework) sent to TASK-8.10 agent.
<!-- SECTION:NOTES:END -->
