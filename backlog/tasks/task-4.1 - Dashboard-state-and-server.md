---
id: TASK-4.1
title: Dashboard state and server
status: Ready
assignee: []
created_date: '2026-11-06T15:04:00Z'
labels: []
dependencies: []
references:
  - scope:plugins/maestro/scripts/dashboard/state.mjs
  - scope:plugins/maestro/scripts/dashboard/server.mjs
  - scope:plugins/maestro/scripts/dashboard/prices.mjs
  - scope:plugins/maestro/scripts/cli.mjs
  - scope:plugins/maestro/scripts/hooks/context-watch.mjs
  - scope:plugins/maestro/skills/dashboard/**
  - scope:plugins/maestro/test/dashboard*
  - scope:plugins/maestro/test/hooks*
parent_task_id: TASK-4
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wave 1 of M-3. Implement docs/dashboard-contract.md except public/.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given a temp project with tasks, archived tasks, drafts, milestones, decisions, events and reports, loadState returns the contract shape with milestones->goals->drafts, tasks with dependencies and scope, active GOAL and ownerWaiting (test: state_builds_contract_shape)
- [ ] #2 Given task.measure events and prices, costs per task and per GOAL sum tokens by model and USD; unknown models are listed in unpriced with usd null (test: state_computes_costs)
- [ ] #3 Given agent.start/stop and task.claim events, agents are paired with state running/finished, actor and task (test: state_pairs_agents)
- [ ] #4 Given integrated task.status events after the latest cr tag, the review counter counts only those (test: state_counts_review)
- [ ] #5 The server serves /, /api/state, /api/stream (changed after a file write within 2 s) and /api/report (rejects paths outside reports and decisions) on 127.0.0.1 (test: server_serves_and_streams)
- [ ] #6 maestro dashboard starts or reuses a server and --stop stops it; the context-watch hook writes .maestro/runtime/context.json in the main session (tests: dashboard_command_reuses_server, context_hook_writes_runtime)
<!-- AC:END -->
