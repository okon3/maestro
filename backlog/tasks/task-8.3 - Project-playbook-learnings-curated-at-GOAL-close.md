---
id: TASK-8.3
title: 'Project playbook: learnings curated at GOAL close'
status: Done
assignee: []
created_date: '2026-11-06T21:49:00Z'
updated_date: '2026-11-06T22:31:00Z'
labels: []
dependencies: []
parent_task_id: TASK-8
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Moved from TASK-5.4 (archived; full design there). LEARNINGS field in reports, learning.proposed events, PM curation and pruning at GOAL close with a cap per role, briefs carry the role's section; Maestro friction only with frameworkFeedback: true. Friction #15, #16.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Playbook flow implemented in agents, PM skill and briefs, with a size cap and frameworkFeedback opt-in
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Integrated (branch commits a19c448..bdfe00a): project-language rule in every agent and skill; LEARNINGS field, learning.proposed/learning.curated events, PM curation at GOAL close with a cap per role, playbook sections in briefs, .maestro/playbook.md from init, frameworkFeedback opt-in (default false). 111 tests.
<!-- SECTION:NOTES:END -->
