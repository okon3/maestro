---
id: TASK-8.7
title: Work killed by a usage limit is saved
status: To Do
assignee: []
created_date: '2026-11-06T21:49:00Z'
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
- [ ] #1 After a limit, uncommitted worktree changes end up on wip/<task> without manual steps
<!-- AC:END -->
