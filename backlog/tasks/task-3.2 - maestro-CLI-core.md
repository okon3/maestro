---
id: TASK-3.2
title: maestro CLI core
status: Ready
assignee: []
created_date: '2026-11-06T14:07:00Z'
labels: []
dependencies:
  - TASK-3.1
references:
  - scope:plugins/maestro/scripts/cli.mjs
  - scope:plugins/maestro/scripts/lib/git.mjs
  - scope:plugins/maestro/scripts/lib/backlog.mjs
  - scope:plugins/maestro/bin/**
  - scope:plugins/maestro/test/cli*
parent_task_id: TASK-3
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wave 1. Implement the maestro command (docs/plugin-contracts.md section 6) except the internals of context and usage parsing, which come from lib/context.mjs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given two concurrent 'maestro claim T --actor a' and '--actor b' on a Ready task, when both run, then exactly one exits 0 and logs task.claim, the other exits 2 and logs task.claim_denied (test: claim_is_exclusive_under_concurrency)
- [ ] #2 Given a task In Progress assigned to someone else, when claim runs, then it exits 2 without editing the task (test: claim_refuses_non_ready_task)
- [ ] #3 Given no goal branch, when 'maestro worktree impl-1 --goal TASK-3' runs, then goal/TASK-3 is created from mainBranch and .claude/worktrees/impl-1 is on branch impl-1 from it (test: worktree_branches_from_goal)
- [ ] #4 Given backlog missing or at another version, when doctor runs, then it exits 2 and prints the npm install command with the pinned version (test: doctor_reports_backlog_version)
- [ ] #5 maestro event appends a valid event; measure writes task.measure using lib/context.mjs usageSummary (tests: event_appends_line, measure_sums_agent_usage)
- [ ] #6 bin/maestro (sh) and bin/maestro.cmd launch scripts/cli.mjs from Git Bash and PowerShell
<!-- AC:END -->
