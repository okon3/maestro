---
id: TASK-7
title: Full GOAL cost view
status: Done
assignee:
  - '@impl-1'
created_date: '2026-11-06T15:58:00Z'
updated_date: '2026-11-06T16:08:00Z'
labels: []
dependencies: []
references:
  - scope:plugins/maestro/scripts/lib/context.mjs
  - scope:plugins/maestro/scripts/hooks/context-watch.mjs
  - scope:plugins/maestro/scripts/dashboard/**
  - scope:plugins/maestro/test/**
  - scope:docs/dashboard-contract.md
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Requested by the owner on 2026-11-06 during the pilot: per GOAL, the cost of everything that ran in it, from the PM to the end (PM session, architect, implementers, QA, reviewer), not only the measured implementer tasks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given a PM transcript and a GOAL window, usageSummary with {from,to} sums only assistant messages inside the window (test: usage_summary_respects_window)
- [x] #2 The context-watch hook records each main-session transcript in .maestro/runtime/pm-sessions.json (test: context_hook_records_pm_sessions)
- [x] #3 Given goal.start/goal.done events, agent.start/stop with usage (a resumed agent counted once, latest stop) and PM sessions, costs.goals[].breakdown gives tokens and USD per role (pm, architect, implementer, qa, reviewer, other) with running agents counted as pending, and a total (test: state_builds_goal_breakdown)
- [x] #4 The Costs view shows per GOAL the full cost with the split by role and a note on pending running agents; the per-task table stays
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Costs view shows the full cost per GOAL split by role (PM, architect, implementers, QA, reviewer) over the GOAL window (from goal.approved/goal.start to goal.done), plus the measured tasks. 66 tests. Also: feed fitted to the window.
<!-- SECTION:FINAL_SUMMARY:END -->
