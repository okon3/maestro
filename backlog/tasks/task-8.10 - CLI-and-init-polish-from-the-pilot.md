---
id: TASK-8.10
title: CLI and init polish from the pilot
status: Done
assignee: []
created_date: '2026-11-06T21:49:00Z'
updated_date: '2026-11-06T22:26:00Z'
labels: []
dependencies: []
parent_task_id: TASK-8
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
init creates events.jsonl, reports/ and eol rules for backlog/ and .maestro/; maestro status lists proposed GOALs; the event vocabulary is documented and unknown types warn; maestro doctor reports a plugin version that changed mid-session with what changed; the architect uses --add-ref for scope and includes the composer of changed props in scope. Friction #1, #2, #4, #5, #8, #11, #13, #21.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each listed item implemented or explicitly dropped with a reason
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Integrated (branch commits a586aa5..3bd5be9): measure writes task reports from the transcript (no overwrite without --force), batch measure with per-task rework, worktree --checkout/--base, status from the tracker with proposed GOALs, event vocabulary with unknown-type warning, doctor plugin-version check, init event log/reports/eol rules, architect --add-ref and caller scope, qa-explorer report file. 108 tests.
<!-- SECTION:NOTES:END -->
