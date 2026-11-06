# Maestro: plan

## Vision

A standalone Claude Code plugin, published from `okon3/maestro`. It runs an autonomous software team for any project:

- the **owner** decides;
- the **PM** (main session) plans with him;
- an **architect** leads one GOAL at a time with **two implementers** in their own worktrees;
- an **exploratory QA** (black box) and a **periodic code reviewer** give independent checks.

Projects install the plugin from the GitHub marketplace and keep only their data (tracker, decisions, reports, handoff) and their own `AGENTS.md`.

Design and source of truth: `team-workflow/flusso-team-agenti.html`.

## Constraints

- Works without Paseo; Paseo is optional.
- Tracker: Backlog.md, a global prerequisite pinned to 1.55.3.
- Models: Sonnet by default, Opus for hard tasks, never Fable.
- Deploy and push only on explicit owner request.
- State lives in git so work can resume on any PC; runtime state stays out of git.
- Measured, not guessed: the plugin records per-task cost and time (decision-17).

## Roadmap: milestone v1

| GOAL | Tracker | Status | Outcome |
| --- | --- | --- | --- |
| M-1 Experiments | TASK-1 | Done | Backlog.md chosen; hooks, context, compaction, nesting and usage verified |
| M-0 Project setup | TASK-2 | Done | Rules, tracker, decisions and spec v3 for this repo |
| M-2 Minimal plugin | TASK-3 | Queued | Plugin runs a GOAL end to end; Agriturismo migrated |
| M-3 Dashboard | TASK-4 | Queued | Local read-only dashboard per project |
| M-4 Pilot on Agriturismo 7C | TASK-5 | Queued | 7C delivered with Maestro, compared with 7B |
| M-5 Evaluation harness | TASK-6 | Proposed | Repeatable measurement of Maestro iterations |

## Index

- Decisions: `backlog/decisions/` (decision-1 to decision-18, 2026-11-06).
- Research: `research/` (Claude Code, Paseo, trackers, bake-off, hook prototypes).
- History: `archive/` (wayfinder map superseded on 2026-11-06, original handoff), `prompts/` (orchestrator v1–v4).
