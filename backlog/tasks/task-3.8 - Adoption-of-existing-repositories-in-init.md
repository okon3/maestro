---
id: TASK-3.8
title: Adoption of existing repositories in init
status: Integrated
assignee: []
created_date: '2026-11-06T14:41:00Z'
updated_date: '2026-11-06T14:48:00Z'
labels: []
dependencies:
  - TASK-3.4
references:
  - scope:plugins/maestro/skills/init/**
  - scope:plugins/maestro/scripts/init.mjs
  - scope:plugins/maestro/scripts/lib/adopt.mjs
  - scope:plugins/maestro/templates/**
  - scope:plugins/maestro/test/templates*
  - scope:plugins/maestro/test/adopt*
parent_task_id: TASK-3
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Approved by the owner on 2026-11-06. Turn the manual Agriturismo adoption into a guided init step: the PM proposes, the owner approves, on a separate branch with a diff. Reference case: E:/Projects/Agriturismo branch maestro-setup (commit 492ef1c) vs master.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 init detects checks from package.json scripts, CI files and lockfiles and pre-fills the Checks section for the owner to confirm (test: adopt_detects_checks)
- [x] #2 init lists conflicting rules for the PM to review: other multi-agent strategies in AGENTS.md/CLAUDE.md, rules that make every commit update PLAN.md, mandatory QA per feature, .gitignore entries hiding .claude/ (test: adopt_flags_conflicts)
- [x] #3 The init skill guides migrating a long PLAN.md: history to docs/history/, open roadmap items to Backlog drafts by milestone, next GOAL as proposed, open questions as decisions with status open, PLAN.md kept short
- [x] #4 Backlog definition_of_done defaults include 'named test per acceptance criterion passes' and 'architect review approved' (idempotent)
- [x] #5 Adoption runs on a branch maestro-setup and ends with a diff for the owner; nothing outside the Maestro markers is changed without approval
<!-- AC:END -->
