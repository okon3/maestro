---
id: TASK-5.1
title: 'Init: rules audit for one source of truth'
status: Done
assignee: []
created_date: '2026-11-06T16:21:00Z'
updated_date: '2026-11-06T16:21:00Z'
labels: []
dependencies: []
references:
  - scope:plugins/maestro/skills/init/SKILL.md
  - scope:team-workflow/flusso-team-agenti.html
parent_task_id: TASK-5
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-11-06, from the 7C pilot): project AGENTS.md must not repeat rules Maestro already states. maestro:init, on adoption, on install over existing rules and on block refresh, classifies project rules as duplicate (removed with one approval), conflict (owner chooses, one by one) or project rule (kept).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 init skill has a rules audit used on adoption, on install over existing rules and on refresh
- [x] #2 Spec section 2 states the one-source-of-truth rule
<!-- AC:END -->
