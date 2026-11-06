---
id: decision-8
title: Loop protection, context and usage watch
date: '2026-11-06T13:56:00Z'
status: accepted
---
## Context

Q8; prototypes in research/hooks-prototypes.md.

## Decision

No per-agent caps, but loop protection with maxTurns. The PM watches its own context (computed from the transcript, window size as explicit config) and the 5-hour and weekly usage (probe on `rate_limit_event` from `claude -p --output-format stream-json`, undocumented, with fallbacks). Thresholds: context 50% no new GOAL, 65% write the handoff; usage 85% no long tasks, 95% clean pause.

## Consequences

Neither hooks nor the model can run /clear or /compact; auto-compaction can only be anticipated and guided.
