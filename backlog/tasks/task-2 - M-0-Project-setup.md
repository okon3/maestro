---
id: TASK-2
title: M-0 Project setup
status: In Progress
assignee: []
created_date: '2026-11-06T13:54:00Z'
updated_date: '2026-11-06T13:56:00Z'
labels:
  - goal
milestone: m-0
dependencies: []
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Outcome: Maestro is a managed project with its rules, an up-to-date spec and a GOAL queue in the tracker. Approved by the owner on 2026-11-06. Exclusions: no plugin code, no change to Agriturismo, no push, no global installs beyond Backlog.md 1.55.3. Authority: local commits in this repo.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 .gitignore and .gitattributes in place (runtime and worktrees ignored, events.jsonl merge=union)
- [x] #2 AGENTS.md with roles, authority, language and tracker conventions; CLAUDE.md points to it
- [x] #3 Backlog.md initialized without agent instructions, statuses configured, remote operations off
- [x] #4 Milestone v1 with GOALs M-1 (Done) and M-0, M-2, M-3, M-4 queued with outcome, criteria and exclusions
- [x] #5 Owner decisions recorded in backlog/decisions/
- [x] #6 PLAN.md short: vision, constraints, roadmap, index
- [ ] #7 HTML design updated to v3 as source of truth (stale parts fixed, roadmap updated)
- [x] #8 Wayfinder map archived with a ticket-by-ticket supersession note
- [ ] #9 All work in local commits; git status clean
<!-- AC:END -->
