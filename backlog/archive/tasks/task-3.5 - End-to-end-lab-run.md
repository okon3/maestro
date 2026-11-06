---
id: TASK-3.5
title: End-to-end lab run
status: Done
assignee:
  - '@architect'
created_date: '2026-11-06T14:30:00Z'
updated_date: '2026-11-06T14:56:00Z'
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
- [x] #1 The toy GOAL reaches main with its criteria met and no owner intervention
- [x] #2 events.jsonl shows goal.start, task.claim, agent.start/stop with usage, task.measure for every task, qa events
- [x] #3 maestro is reachable from agents (bin on PATH) or the fallback path works
- [x] #4 Guided compaction re-injects the handoff (headless /compact on the PM session)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Run e2e-1 (2026-11-06, 10 min wall, list cost 2.80 USD; PM Opus, architect Opus, implementers Sonnet): GOAL closed with QA-1 and CR-1, 3 tasks measured, maestro on PATH and Backlog status hook working. Gaps: TASK-1.1 not claimed (brief omitted it), tasks ran sequentially (parallel path not exercised), compaction not tested. Fixes in 6568f8f. A second run (e2e-2) with two parallel tasks and a guided /compact is needed for AC 2 and 4.

Run e2e-2 (4 min wall, list cost 1.25 USD): two implementers launched 4 ms apart in separate worktrees, both claimed, both measured; GOAL closed with done/TASK-1 tag. Guided /compact on the PM session: PreCompact and SessionStart(compact) logged; the PM line and handoff were re-injected (verified by asking the resumed session). Fixes from both runs committed.
<!-- SECTION:NOTES:END -->
