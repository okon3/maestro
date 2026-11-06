---
id: TASK-3.3
title: Context, usage and hooks
status: Integrated
assignee:
  - '@impl-2'
created_date: '2026-11-06T14:07:00Z'
updated_date: '2026-11-06T14:14:00Z'
labels: []
dependencies:
  - TASK-3.1
references:
  - scope:plugins/maestro/scripts/lib/context.mjs
  - scope:plugins/maestro/scripts/hooks/**
  - scope:plugins/maestro/hooks/**
  - scope:plugins/maestro/test/context*
  - scope:plugins/maestro/test/hooks*
parent_task_id: TASK-3
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wave 1. Implement lib/context.mjs and the hook scripts (docs/plugin-contracts.md sections 5 and 7, module API). Facts from research/hooks-prototypes.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given a transcript whose last main-chain assistant usage is input 10, cache_read 20, cache_creation 30, when contextUsage runs with window 1000, then contextTokens is 60 and percent 6; sidechain and <synthetic> lines are ignored (test: context_uses_last_main_chain_usage)
- [x] #2 Given a compact_boundary after the last assistant message, then postCompactNoUsageYet is true with preCompactTokens (test: context_after_compaction)
- [x] #3 Given streamed duplicates of one message id, usageSummary counts it once per model (test: usage_dedupes_streamed_messages)
- [x] #4 Given context crossing 50 then staying above it, the context hook injects one warning only, and nothing inside subagents (test: context_warning_once_per_band)
- [x] #5 SessionStart with source compact injects .maestro/handoff.md capped at 9000 chars; with no .maestro/config.json every hook is a no-op exit 0 (tests: session_start_reinjects_handoff, hooks_noop_without_config)
- [x] #6 SubagentStop logs agent.stop with usage from agent_transcript_path; StopFailure logs limit.hit; a thrown error still exits 0 and writes runtime/hook-errors.log (tests: subagent_stop_logs_usage, hooks_never_throw)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Integrated by the architect. 21 tests; measured 144 s, Sonnet. To verify in a live session: compaction-agent detection in agent-events (empty agent_type or 'compact' in path) and StopFailure 'error' field.
<!-- SECTION:NOTES:END -->
