---
id: TASK-3.7
title: Lessons from comparable frameworks
status: Integrated
assignee: []
created_date: '2026-11-06T14:41:00Z'
updated_date: '2026-11-06T14:48:00Z'
labels: []
dependencies:
  - TASK-3.4
references:
  - scope:plugins/maestro/agents/**
  - scope:plugins/maestro/skills/{pm
  - start-goal
  - triage-qa
  - periodic-review
  - decision}/**
  - scope:plugins/maestro/scripts/hooks/**
  - scope:plugins/maestro/hooks/hooks.json
  - scope:plugins/maestro/test/hooks*
  - scope:docs/plugin-contracts.md
parent_task_id: TASK-3
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Approved by the owner on 2026-11-06. Adopt ideas 1-9 from research/comparable-frameworks.md section 5 (items 2,3,4,5,6,8,10,12 plus the Backlog DoD item, which belongs to the init task).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Implementer final STATE is one of done | done_with_concerns | needs_context | blocked | spec_stale; the architect reviews only done/done_with_concerns and handles the others explicitly
- [x] #2 Minor ambiguities decided by a worker are logged as decision.ruling events (maestro event) and listed in the report; the contract lists the type
- [x] #3 Intent-gap halt: when review finds the task was read two ways, the architect stops that task, keeps the branch, and returns blocked with the two readings
- [x] #4 Second recovery attempt escalates the model one tier (sonnet -> opus), never to Fable; recorded in task notes
- [x] #5 qa-explorer and code-reviewer cannot edit code (tools/disallowedTools) and the reviewer works on its snapshot worktree
- [x] #6 Implementer preflight checks its worktree HEAD contains the goal branch tip it was launched from; otherwise stops (test or explicit step)
- [x] #7 Architect planning rule: shared files (package manifests, shared types, config) are owned by one task per wave
- [x] #8 A PreToolUse hook denies subagents reading .env, *.pem, *.key, id_rsa* and paths listed in config secretPaths; the main session is not blocked (test: secret_guard_blocks_subagent_reads)
<!-- AC:END -->
