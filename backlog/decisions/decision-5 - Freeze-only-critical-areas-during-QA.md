---
id: decision-5
title: Freeze only critical areas during QA
date: '2026-11-06T13:56:00Z'
status: accepted
---
## Context

QA and review run on snapshots while work continues (D4).

## Decision

During QA an area is frozen only if it is critical (persistence, migrations, file formats). Elsewhere QA and review work on tagged snapshots (`qa/QA-n`, `cr/CR-n`); at triage each finding's area is compared between the tag and master to check validity.

## Consequences

Fixes from a report start only after the report is closed.
