---
id: TASK-5.5
title: 'Usage gate: no new agents near the 5-hour limit'
status: To Do
assignee: []
created_date: '2026-11-06T18:11:00Z'
updated_date: '2026-11-06T21:49:00Z'
labels: []
dependencies: []
parent_task_id: TASK-5
priority: high
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
7C pilot, 2026-11-06: the 5-hour window hit 100% at 17:08 UTC with work in flight. Timeline: 88% at 16:40 (PM still launched an Opus code review at 91% and resumed the architect with 8 fix tasks), architect launched 2 implementers at ~95%, 97-98% at 17:02-17:03, PM started maestro:pause and messaged the architect, but an implementer kept claiming new tasks (TASK-1.11, 1.14) until the limit. Causes: bands are only a PM instruction checked at wave boundaries; the architect has no usage rule; samples are ~10 min apart; a pause cannot reach implementers inside a foreground wait. Fix: maestro claim refuses new claims above the top band or while a pause is active (pause flag in .maestro/runtime); a PreToolUse gate on Agent blocks new agents above the top band with a fresh sample; the architect checks usage before each launch and above the lower band only finishes in-flight work; denser sampling above ~80%; long agents (Opus reviewer, fix waves) count as long tasks above the lower band.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 maestro claim refuses above the top band or during a pause, with a clear message
- [ ] #2 Agent launches are blocked above the top band by a hook
- [ ] #3 Architect usage rule and denser sampling near the bands
- [ ] #4 Tests cover the gates; spec updated
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Moved to TASK-8.4 (GOAL M-6) on 2026-11-06; archived here.
<!-- SECTION:NOTES:END -->
