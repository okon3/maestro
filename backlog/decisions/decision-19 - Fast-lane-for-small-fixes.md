---
id: decision-19
title: Fast lane for small fixes
date: '2026-11-06T21:48:00Z'
status: accepted
---
## Context

In the 7C pilot a one-line defect fix (Agriturismo TASK-2) had to become a full GOAL with approval, goal branch, architect and implementer: about 19 minutes and $3, with the architect alone at $1.79 (friction #22, M-4 review in research/m4-pilot-review.html).

## Decision

The owner approved a fast lane (2026-11-06). With the owner's approval, the PM launches one implementer directly for a fix that is a single task with no material choice. The rest of the flow is unchanged: own worktree, named test per criterion, project checks, review by the PM, integration on the main branch. The periodic code review counts integrated tasks, not GOALs, so fast-lane fixes do not trigger a review each.

## Consequences

The PM skill gains a fast-lane procedure and the review cadence counts tasks. Anything with a material choice, more than one task or shared contracts still goes through a GOAL with an architect. Implemented in GOAL M-6.
