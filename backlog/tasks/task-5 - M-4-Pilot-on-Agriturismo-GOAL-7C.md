---
id: TASK-5
title: M-4 Pilot on Agriturismo GOAL 7C
status: In Progress
assignee: []
created_date: '2026-11-06T13:55:00Z'
updated_date: '2026-11-06T21:44:00Z'
labels:
  - goal
milestone: m-0
dependencies:
  - TASK-4
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Outcome: GOAL 7C of Agriturismo delivered with Maestro (architect + 2 implementers, QA, periodic review), and a review of time, defects and friction compared with 7B under the old rules. Approved in outline on 2026-11-06. Exclusions: deploy (only on owner request), parallel GOALs. Authority: as approved for 7C in Agriturismo.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 7C integrated in Agriturismo master with QA and code review passed
- [x] #2 Per-task records collected and compared with 7B (time, tokens, owner interventions, defects found after integration)
- [ ] #3 Friction list turned into Maestro tasks or decisions
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-06: owner asked to start the pilot. Plugin in Agriturismo updated to 63f275e. PM launched as Paseo agent aa65f76a-22bb-4f23-8e21-e38c3af0b486 (Opus 5.5, auto mode, workspace wks_b01f811104f24337); it presents 7C to the owner for approval and keeps .maestro/reports/pilot-friction.md in Agriturismo.

2026-11-06 ~17:10: handoff to a new Maestro PM session. Pilot status and fixes in .maestro/handoff.md.

2026-11-06: friction (owner): implementers spend 22-40% of wall time and ~25-31% of input tokens on agent-browser self-smoke (7C.1: 41 browser calls, ~7 of 17 min; 7C.3: 20 calls; 7C.4: 36 calls so far), with no code fixes resulting. Causes: Agriturismo AGENTS.md:44 (self-smoke headed for every visible task), implementer.md step 3.3, and QA-type criteria written by the architect as full scenarios. Owner: plugin steps 1 and 3 stay as they are for now; remove Agriturismo rules that conflict with Maestro (AGENTS.md:44, and the 'run npm from the repo root' part of :42, which breaks worktree isolation) after 7C closes, since the main checkout is on goal/TASK-1 with the architect at work.

2026-11-06: owner asked whether the architect should launch implementers in the foreground. Lab test bg-nesting-2 confirms it must: background children of a subagent report to the main session. Cost seen in 7C wave 2: TASK-1.3 finished 16:08 but waited 13 min in review for TASK-1.4 (16:21); TASK-1.5 (wave 3, ~11 min) started only at 16:23. Levers: pair tasks of similar size in a wave; longer term, run the architect as its own session (e.g. Paseo agent) so it can launch implementers in the background and react to each.

2026-11-06: M-4 review written: research/m4-pilot-review.html. 7C vs 7B: active time 1h55 vs 1h27, cost $53.16 vs ~$30.5 (API prices), 0 critical/major in both, review found 3 issues QA could not. Architect is 35% of 7C cost. Friction grouped into done items, TASK-5.2-5.5 and new proposals; three decisions for the owner (packaging, fast lane for small fixes, architect cost).
<!-- SECTION:NOTES:END -->
