---
id: 11
title: Decide how maestro adapts to an existing repository
type: grilling
status: open
assignee:
blocked_by: []
created: 2026-09-18
closed:
---

## Question

What does "drop-in, adapts and registers the repo conventions" mean
concretely?

Decide: which facts are captured (checks, conventions, tracker and its labels,
branching and commit rules, docs duty, verification doctrine, serial
constraints); how they are discovered (read `CLAUDE.md`, `CONTRIBUTING.md`, CI
config and lockfiles; interview; both, in which order); where they are stored
(a binding file like `.claude/orchestrate.md`, sections in `CLAUDE.md`, both);
how staleness is detected and refreshed; what happens when the repo already
runs another workflow (`orchestrate`'s SPEC warns about collisions with
embedded v1 workflows).

## Context pointers

- `orchestrate` binding schema:
  `plugins/orchestrate/skills/orchestrate/references/project-binding.md`.
- codegenesis `cg-init` classifies the repo (empty / minimal / unclear /
  existing) and interviews: `plugins/codegenesis/skills/cg-init/SKILL.md`.
- v4 §2 "Initialize or resume" and §5 "Authoritative state".
