---
id: decision-21
title: No long-lived git tags
date: '2026-11-06T22:22:00Z'
status: accepted
---
## Context

Maestro tagged every QA snapshot (`qa/QA-n`), every code review range end (`cr/CR-n`) and every closed GOAL (`done/<id>`), and nobody deleted them: Agriturismo had 5 after two GOALs. Only the dashboard read a tag (the last `cr/CR-n`, to count tasks integrated since the last review).

## Decision

No long-lived tags (owner, 2026-11-06). The commit of each QA snapshot, review range and GOAL closure is recorded in its event (`qa.start`, `review.start`/`review.done`, `goal.done`) and in its report. A skill may use a temporary tag while a QA or review runs, and deletes it when that report closes. The review cadence counts integrated tasks since the last `review.done` event. Existing `qa/*`, `cr/*` and `done/*` tags are deleted locally.

## Consequences

Skills (triage-qa, periodic-review, pm close), the dashboard cadence and the contracts change in GOAL M-6. History stays readable through `goal.done` events, reports and merge commits on the main branch.
