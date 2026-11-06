---
id: decision-13
title: Decision governance and retry limits
date: '2026-11-06T13:56:00Z'
status: accepted
---
## Context

Carried over from orchestrator v4 (sections 3, 9 and 10).

## Decision

Nobody chooses at random. Local reversible details: the worker, noted in its report. Technical choices within an approved direction: the architect, with an ADR. Material choices (new technologies or dependencies, database, cache, new architectural components, data formats, persistence, external services, security, costs, scope): the owner via the PM, with 2-3 options and a recommendation; blocked tasks wait while other work continues. At most two recovery attempts after the initial failure per unresolved problem and at most two critique cycles per result, counted across agents and sessions.

## Consequences

None beyond the decision itself.
