---
id: TASK-8.2
title: Agents write in the project's language
status: Done
assignee: []
created_date: '2026-11-06T21:49:00Z'
updated_date: '2026-11-06T22:31:00Z'
labels: []
dependencies: []
parent_task_id: TASK-8
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Moved from TASK-5.3 (archived). Agents write tracker notes, reports and decisions in the project's language as stated in AGENTS.md (English if not stated); commands, event types and report labels stay in English. Friction #3.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Agents and skills write prose in the project's language, fixed labels in English
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Integrated (branch commits a19c448..bdfe00a): project-language rule in every agent and skill; LEARNINGS field, learning.proposed/learning.curated events, PM curation at GOAL close with a cap per role, playbook sections in briefs, .maestro/playbook.md from init, frameworkFeedback opt-in (default false). 111 tests.
<!-- SECTION:NOTES:END -->
