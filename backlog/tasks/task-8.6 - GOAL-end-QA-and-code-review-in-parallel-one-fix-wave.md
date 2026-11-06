---
id: TASK-8.6
title: 'GOAL end: QA and code review in parallel, one fix wave'
status: Done
assignee: []
created_date: '2026-11-06T21:49:00Z'
updated_date: '2026-11-06T22:21:00Z'
labels: []
dependencies: []
parent_task_id: TASK-8
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
At GOAL end the PM runs exploratory QA and the periodic review together, then resumes the architect once with all findings. The PM stays on the main branch: start-goal creates the goal branch without switching. Friction #17, #18.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 PM, triage-qa, periodic-review and start-goal skills follow the parallel flow; the PM checkout stays on the main branch
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Integrated (branch commits 82fd4c5..c34c75e): QA and review in parallel at GOAL end with one fix wave; PM stays on main, architect in its own goal worktree; branch and worktree cleanup at GOAL close; review cadence by integrated tasks; architect batches; PM fast lane (decision-19). CLI follow-ups (worktree --checkout/--base, batch --rework) sent to TASK-8.10 agent.
<!-- SECTION:NOTES:END -->
