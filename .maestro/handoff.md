# Maestro handoff

Rewritten by the PM at pauses, context bands and shift changes. Last update: 2026-11-07 ~00:00 local, by the second Maestro PM session.

## Now

- **GOAL M-6 (TASK-8): every task integrated and published except TASK-8.1.** main `9f58e25`, 111 tests.
  - Waves done:
    - 8.11 dashboard: blocking items vs open questions, agent model on the Board, missions;
    - 8.5 ready worktrees;
    - 8.4 and 8.7 usage gate and salvage;
    - 8.6 and 8.9 parallel GOAL end, PM stays on main, cleanup, fast lane, batches;
    - 8.8 and 8.10 reports from measure, CLI polish;
    - 8.12 no long-lived tags, QA and review in the background;
    - 8.2 and 8.3 project language and playbook.
  - Decisions 19 (fast lane), 20 (architect medium effort) and 21 (no long-lived tags).
  - Tags deleted in this repository, both local and on GitHub.
- **TASK-8.1 waits for Agriturismo GOAL 8A (TASK-3)**, which is In Progress on `goal/TASK-3` with the architect working. When it closes:
  1. update the plugin in Agriturismo and restart its dashboard;
  2. clean its AGENTS.md as decided (see TASK-8.1 and the archived TASK-5.2);
  3. set `frameworkFeedback: true` in its `.maestro/config.json` (pilot project);
  4. delete its local tags (`qa/QA-1`, `qa/QA-2`, `cr/CR-1`, `done/TASK-1`, `done/TASK-2`);
  5. close M-6.
- **Idea parked by the owner** ("lasciamo così per ora", 2026-11-06): the PM as dispatcher. The PM would launch implementers itself in the background and call the architect only briefly, to plan a wave or to review and integrate a task. This removes the wave barrier at the cost of a larger PM context. If it comes back, prototype it in the lab and compare it with the current mode (it pairs well with M-5).

## Running agents

- The Agriturismo PM (Paseo `aa65f76a-22bb-4f23-8e21-e38c3af0b486`) is running GOAL 8A. Send it prompts only when the owner asks.

## Waiting for the owner

- Nothing blocking. The 7B deploy in Agriturismo is still pending (the owner runs `npm run deploy`).

## Next action

1. Follow 8A. When it closes, do TASK-8.1 and close M-6: set TASK-8 Done, archive it, add a history line to PLAN.md, and record the commit in a `goal.done` event (no tag).
2. Then M-5: prepare a proposal for the owner in HTML.

## Notes

- Tests: `cd plugins/maestro && node --test` (111). Validate: `claude plugin validate plugins/maestro`. The plugin-directory check reports a missing LICENSE; that only matters for a directory submission.
- Updating Agriturismo:
  1. run `claude plugin marketplace update okon3 && claude plugin update maestro@okon3` from `E:\Projects\Agriturismo`;
  2. restart the dashboard with `node <cache>/<new sha>/scripts/cli.mjs dashboard --stop`, then `dashboard --no-open`;
  3. pick the cache folder by sha, not by mtime.
- Owner preferences:
  - Italian in conversation;
  - specs and reviews in HTML;
  - verify UI changes with screenshots;
  - one source of truth for rules.
