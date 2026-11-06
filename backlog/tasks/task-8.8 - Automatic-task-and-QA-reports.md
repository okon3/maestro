---
id: TASK-8.8
title: Automatic task and QA reports
status: Done
assignee: []
created_date: '2026-11-06T21:49:00Z'
updated_date: '2026-11-06T22:26:00Z'
labels: []
dependencies: []
parent_task_id: TASK-8
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
maestro measure (or a report command) writes .maestro/reports/task/<id>.md from the implementer's final report; qa-explorer is explicitly allowed to write its report file and triage-qa checks it exists. Friction #12, #14.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Task reports are written by the CLI; QA report files always exist after a mission
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Integrated (branch commits a586aa5..3bd5be9): measure writes task reports from the transcript (no overwrite without --force), batch measure with per-task rework, worktree --checkout/--base, status from the tracker with proposed GOALs, event vocabulary with unknown-type warning, doctor plugin-version check, init event log/reports/eol rules, architect --add-ref and caller scope, qa-explorer report file. 108 tests.
<!-- SECTION:NOTES:END -->
