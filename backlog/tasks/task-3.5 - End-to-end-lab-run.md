---
id: TASK-3.5
title: End-to-end lab run
status: In Progress
assignee:
  - '@architect'
created_date: '2026-11-06T14:30:00Z'
labels: []
dependencies:
  - TASK-3.4
references:
  - scope:E:/Projects/maestro-lab/e2e-1
parent_task_id: TASK-3
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wave 3. Run a toy GOAL headless with --plugin-dir in a lab repo (PM -> architect -> 2 implementers -> integration -> QA -> close) and fix what breaks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The toy GOAL reaches main with its criteria met and no owner intervention
- [ ] #2 events.jsonl shows goal.start, task.claim, agent.start/stop with usage, task.measure for every task, qa events
- [ ] #3 maestro is reachable from agents (bin on PATH) or the fallback path works
- [ ] #4 Guided compaction re-injects the handoff (headless /compact on the PM session)
<!-- AC:END -->
