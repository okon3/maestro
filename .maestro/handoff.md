# Maestro handoff

Rewritten by the PM at pauses, context bands and shift changes. Last update: 2026-11-06 ~22:55 local, by the second Maestro PM session.

## Now

- **GOAL M-4 (pilot on Agriturismo 7C): Done and archived.**
  - Review: `research/m4-pilot-review.html`.
  - 7C against 7B:
    - active time 1 h 55 min against 1 h 27 min;
    - cost $53.16 against about $30.5, at API prices;
    - 0 critical or major defects in both;
    - the code review found 3 issues that QA cannot see.
  - The architect was 35% of the cost.
- **Owner decisions (2026-11-06):**
  - follow-up work goes in GOAL **M-6** (TASK-8, approved, To Do, 11 subtasks; TASK-8.4 usage gate is high priority);
  - decision-19: fast lane for small fixes;
  - decision-20: architect on Opus at **medium** effort. Already applied in `agents/architect.md` (`cde1ba0`).
- **Published this session** on `okon3/maestro`:
  - `/maestro:init` rules audit, so project rules never repeat Maestro's (TASK-5.1);
  - dashboard: a batch implementer is counted once, with its cost split among its tasks;
  - dashboard: folded YAML titles are read correctly;
  - dashboard: agents killed by a usage limit are no longer "running" and are counted in the cost by role.
- **Agriturismo:**
  - on plugin `bbee867`;
  - dashboard at http://127.0.0.1:4517/ restarted on that version;
  - GOAL 7C (TASK-1) and 7C-fix (TASK-2) closed by the pilot PM;
  - no GOAL in progress.
- **Verified in the lab** (`maestro-lab/bg-nesting-2`, `research/claude-code-capabilities.md`): background agents launched by a subagent report to the main session. That is why the architect must launch implementers in the foreground.

## Running agents

- The Agriturismo PM (Paseo `aa65f76a-22bb-4f23-8e21-e38c3af0b486`) is idle after closing TASK-2. Send it prompts only when the owner asks.

## Waiting for the owner

- Whether to start M-6 now. TASK-8.4 (usage gate) should come first, so that the next Agriturismo GOAL cannot run into the limit again.
- 7B deploy in Agriturismo is still pending (the owner runs `npm run deploy`).

## Next action

1. When the owner says go, start M-6 in waves:
   - wave 1: 8.4 usage gate, 8.5 ready worktrees, 8.6 parallel GOAL end;
   - then the rest.
   - TASK-8.1 (Agriturismo `AGENTS.md`) can run any time no Agriturismo GOAL is active.
2. Spec: add the fast lane (decision-19) to `team-workflow/flusso-team-agenti.html` in the same commit as TASK-8.9.

## Notes

- Tests: `cd plugins/maestro && node --test` (69). Validate: `claude plugin validate plugins/maestro`. The plugin-directory check reports a missing LICENSE; that only matters for a directory submission.
- Updating Agriturismo:
  1. run `claude plugin marketplace update okon3 && claude plugin update maestro@okon3` from `E:\Projects\Agriturismo`;
  2. restart the dashboard with `node <cache>/<new sha>/scripts/cli.mjs dashboard --stop`, then `dashboard --no-open`;
  3. pick the cache folder by sha, not by mtime.
- Owner preferences:
  - Italian in conversation;
  - specs and reviews in HTML;
  - verify UI changes with screenshots;
  - one source of truth for rules.
