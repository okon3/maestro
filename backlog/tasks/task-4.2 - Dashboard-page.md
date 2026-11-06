---
id: TASK-4.2
title: Dashboard page
status: Ready
assignee: []
created_date: '2026-11-06T15:04:00Z'
labels: []
dependencies: []
references:
  - scope:plugins/maestro/scripts/dashboard/public/**
  - scope:plugins/maestro/test/fixtures/dashboard-state.json
parent_task_id: TASK-4
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wave 1 of M-3. Implement the page of docs/dashboard-contract.md against a fixture state; QA follows with the real server.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Header shows project, active GOAL with progress, main commit, review counter, PM context and 5h/weekly usage with stale markers, and owner-waiting count
- [ ] #2 Tabs Roadmap, Board, Agents, Decisions, Reports, Costs render the fixture with no console errors; Reports opens a Markdown file as readable text
- [ ] #3 Costs shows per GOAL and per task tokens by model, wall time, rework and interventions, and USD clearly labelled as a list-price estimate
- [ ] #4 Live refresh: on an SSE 'changed' event the page refetches /api/state and re-renders without losing the selected tab
- [ ] #5 No external requests (no CDN); works at 1440x900; readable in a light theme with an accessible contrast
<!-- AC:END -->
