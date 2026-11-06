---
id: TASK-8.12
title: 'No long-lived tags: commits recorded in events'
status: Done
assignee: []
created_date: '2026-11-06T22:22:00Z'
updated_date: '2026-11-06T22:29:00Z'
labels: []
dependencies: []
parent_task_id: TASK-8
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-21. QA, review and GOAL close record their commit in events and reports; temporary qa/cr tags deleted at report close; no done/<id> tag; dashboard and periodic-review cadence count tasks integrated since the last review.done event; contracts and spec updated. Delete existing tags in this repo and, after its active GOAL closes, in Agriturismo.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No skill leaves a tag behind; cadence from events; tests; spec and contracts updated
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Integrated (branch commits 14cec36..0512392): qa.start/review.start/review.done/goal.done carry commits, no tags created, dashboard cadence from the last review.done (cr/ tag fallback), QA missions and review launched in the background at GOAL end. 109 tests.
<!-- SECTION:NOTES:END -->
