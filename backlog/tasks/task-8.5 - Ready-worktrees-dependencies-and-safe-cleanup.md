---
id: TASK-8.5
title: 'Ready worktrees: dependencies and safe cleanup'
status: Done
assignee: []
created_date: '2026-11-06T21:49:00Z'
updated_date: '2026-11-06T22:04:00Z'
labels: []
dependencies: []
parent_task_id: TASK-8
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
maestro worktree links or installs node_modules (configurable post-create step) so implementers and QA snapshots skip npm ci; cleanup unlinks safely and reports processes holding the folder; implementers stop preview servers they start. Friction #7, #9, #15, #23.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A new worktree runs the project checks without npm ci, and removal never deletes the main node_modules
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Integrated (branch commits a1f4704, 635dd1d): worktreeSetup {link, run} in config, junction/symlink links recorded per worktree, --detach snapshots for QA and review, --remove with link-safe order and clear failure causes, init proposes node_modules link, implementer and triage-qa instructions. 84 tests after merge.
<!-- SECTION:NOTES:END -->
