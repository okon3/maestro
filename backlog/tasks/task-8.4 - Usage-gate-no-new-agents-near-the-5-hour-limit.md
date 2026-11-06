---
id: TASK-8.4
title: 'Usage gate: no new agents near the 5-hour limit'
status: To Do
assignee: []
created_date: '2026-11-06T21:49:00Z'
updated_date: '2026-11-06T21:49:00Z'
labels: []
dependencies: []
parent_task_id: TASK-8
priority: high
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Moved from TASK-5.5 (archived; timeline there). maestro claim refuses above the top band or during a pause; a PreToolUse gate on Agent blocks launches above the top band; the architect checks usage before each launch; denser sampling above ~80%. Friction #19.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Claims and agent launches refused above the top band or during a pause, with tests
<!-- AC:END -->
