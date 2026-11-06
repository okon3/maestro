---
id: TASK-5.2
title: 'Agriturismo AGENTS.md: remove rules Maestro already states'
status: To Do
assignee: []
created_date: '2026-11-06T16:35:00Z'
labels: []
dependencies: []
parent_task_id: TASK-5
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Apply after 7C closes (main checkout is on goal/TASK-1 while the architect works). Owner decisions 2026-11-06. Remove duplicates: line 38 (commits per logical block), 43 (standard checks, already in ## Checks), 44 (implementer self-smoke and end-of-GOAL QA), 46 (QA desktop viewport; move 'headed' into the QA line of ## Checks), 47 (tracker and PLAN.md ownership), tail of 115 ('in dedicated commits per logical block'; keep 'allowed'). Conflicts: 42 adapt (rerun npm with the needed permissions in the same working directory, drop 'from the root'; keep 'do not look for other Node copies'); 45 remove (Maestro triage rule wins: minor/cosmetic defects become tasks but do not block the GOAL); 48 keep (project language Italian; plugin to follow it, see sibling task). One commit in Agriturismo on master.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Duplicates removed and conflicts resolved as decided, in one local commit on Agriturismo master
<!-- AC:END -->
