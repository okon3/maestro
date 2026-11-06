---
id: decision-1
title: Maestro is a standalone personal plugin published on GitHub
date: '2026-11-06T13:56:00Z'
status: accepted
---
## Context

Maestro held orchestrator prompts v1-v4; a wayfinder map (2026-09-18) aimed at consolidating three lineages (prompt v4, Iconsulting `orchestrate`, `codegenesis`) after a full evaluation. The team-workflow design (2026-11-06) chose a different route.

## Decision

Maestro becomes a standalone personal Claude Code plugin, published in its own marketplace in `okon3/maestro` on GitHub. Projects install it from that GitHub marketplace. It replaces orchestrator v1-v4 (Q7). It does not consolidate `orchestrate` or `codegenesis`; they are sources of ideas only. The wayfinder map is superseded (owner, 2026-11-06).

## Consequences

Plugin code lives only here; projects keep data and their own AGENTS.md. Publishing a version means pushing to `okon3/maestro`, which needs owner authorization. Wayfinder material is in `archive/wayfinder/`.
