---
id: TASK-8.7
title: Work killed by a usage limit is saved
status: Done
assignee: []
created_date: '2026-11-06T21:49:00Z'
updated_date: '2026-11-06T22:07:00Z'
labels: []
dependencies: []
parent_task_id: TASK-8
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On limit.hit, work in progress in implementer worktrees is committed to wip/<task> (hook or resume step), and the resume skill checks it explicitly. Friction #20.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 After a limit, uncommitted worktree changes end up on wip/<task> without manual steps
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Integrated in 010a2c5 (branch commits 39d2b35, 1a8e318): claim gate and PreToolUse usage-gate hook at the top band or while paused, maestro usage --check, maestro pause --on/--off, maestro salvage (impl-* worktrees to wip/<task>), interruption marker from StopFailure rate_limit, 2-minute dashboard sampling from 80%, skills and architect follow the bands before every launch. 98 tests after merge.
<!-- SECTION:NOTES:END -->
