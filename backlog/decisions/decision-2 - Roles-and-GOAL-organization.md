---
id: decision-2
title: Roles and GOAL organization
date: '2026-11-06T13:56:00Z'
status: accepted
---
## Context

The design needs clear ownership between owner, PM, architect, implementers, QA and reviewer (D3, Q3).

## Decision

Roles: owner (responsible for the project), PM (main session), architect (GOAL lead), 2 implementers, black-box exploratory QA, periodic code reviewer. The architect decomposes the GOAL in waves, spawns and coordinates the implementers, reviews, resolves conflicts and integrates into master; it must stay active until its implementers return. The PM spawns QA and reviewer independently. One GOAL at a time; parallelism is between the two implementers (own worktrees, integration branch per GOAL). Parallel independent GOALs are postponed until after the pilot.

## Consequences

The PM does not write code or integrate. Level-2 completions reach the architect only while it is running (research/hooks-prototypes.md, section 4).
