---
id: TASK-8.8
title: Automatic task and QA reports
status: To Do
assignee: []
created_date: '2026-11-06T21:49:00Z'
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
- [ ] #1 Task reports are written by the CLI; QA report files always exist after a mission
<!-- AC:END -->
