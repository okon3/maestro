---
id: 16
title: "Decide the authoritative state: plan file or tracker"
type: grilling
status: open
assignee:
blocked_by: [10, 11]
created: 2026-09-18
closed:
---

## Question

v4 makes native GitHub or GitLab issues the single authoritative state;
`orchestrate` keeps `PLAN.md` on disk and sketches pointing goals at issues.
Which does maestro use; how goals, tasks, decisions and recovery counters map
onto it (labels, sub-issues, comments, files); how the choice degrades on a
repo with no tracker; and how it stays consistent with the drop-in adaptation
decided in ticket 11.

## Context pointers

- v4 §5 "Authoritative state" and its label semantics (Proposed, Queued,
  Ready, In Progress, Blocked, Done).
- `orchestrate` SPEC, "Evolution — goal backend" note.
