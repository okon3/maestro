---
name: periodic-review
description: Run the periodic code review - due every reviewEveryTasks integrated tasks, fast-lane tasks included, checked at GOAL end and after fast-lane integrations - fix the from..to commit range, launch a fresh code-reviewer on the commit range, and turn violations, debt and suggestions into tasks and notes. Used by the PM.
argument-hint: "[GOAL id]"
---

# Periodic code review

GOAL (optional): `$ARGUMENTS`

The review never blocks work in progress.

## 1. Is it due?

It is due when `reviewEveryTasks` tasks (`.maestro/config.json`, default 15) have been integrated since the last `review.done` event, fast-lane tasks included. The cadence counts tasks, not GOALs: the end of a GOAL alone does not make it due.

- **When to check:** at every GOAL end (PM skill section 4) and after every fast-lane integration (PM skill section 10).
- **How to count:** the dashboard header shows it (`Code review N/<reviewEveryTasks>`). By hand: the `task.status` events with `"to":"Integrated"` in `.maestro/events.jsonl` after the last `review.done` event (all of them before the first review). A project that predates decision-21 may have only `cr/CR-<n>` tags: then count from the newest one.

If it is not due and the owner did not ask, stop here.

## 2. Fix the range and launch

1. Pick the number: `n` = the highest `CR-<n>` in the `review.done` events of `.maestro/events.jsonl` and in `.maestro/reports/review/` (and any legacy `cr/CR-*` tag), plus 1 (start at 1).
2. Choose the range: `<from>` = the `to` of the last `review.done` event (the newest legacy `cr/CR-*` tag if there is no event); for the first review, the main-branch commit just before the first GOAL integrated with Maestro. `<to>` = `git rev-parse --short <mainBranch>`. No tags (decision-21): the shas are the names.
3. Give the reviewer a snapshot, not the main checkout: `maestro worktree cr-CR-<n> --detach <to>` (a detached worktree with the project's `worktreeSetup`, so the reviewer can run the checks without installing dependencies). The reviewer works only there and cannot edit (no Edit tool).
4. Log: `maestro event review.start --goal <GOAL id> --actor pm --data '{"review":"CR-<n>","from":"<from>","to":"<to>"}'`.
5. Launch a **fresh** Agent with `subagent_type: "maestro:code-reviewer"` and `run_in_background: true`; its completion notification comes back to you. Never reuse an earlier reviewer. At GOAL end, launch it in the same message as the QA missions, so they run in parallel (PM skill section 4, step 4). Brief:

```
Review: CR-<n>
Range: <from>..<to>
Integrated in the range: <GOAL ids and task ids>
Snapshot: <main checkout, absolute>/.claude/worktrees/cr-CR-<n> (detached at <to>)
Report: <main checkout, absolute>/.maestro/reports/review/CR-<n>.md
Project checks: <from AGENTS.md>
```

## 3. Turn findings into work

Read the report. Check that each finding is concrete (file, symbol, failure scenario); drop the ones that are not, and say why in the GOAL notes. Then:

- **violation:** a priority task for the architect: `backlog task create "Fix: <title>" -p <GOAL id> -s "To Do" --priority high --ref "review:CR-<n>/<V-id>" -d "<where, rule, failure scenario, proposed fix>"`. If the GOAL is closed, attach it to the active GOAL; if none is active, propose a GOAL to the owner.
- **debt:** a queued task: the same command without `--priority high` and with `--ref "review:CR-<n>/<D-id>"`. Place it in the current GOAL only if it fits its scope; otherwise propose its placement to the owner (PM skill section 2: no silent scope growth).
- **suggestion:** a note only: `backlog task edit <GOAL id> --append-notes "CR-<n> suggestions: <ids, one line each>"`.

A violation that needs a material decision goes to the owner first (PM skill section 3).

## 4. Close

1. Log: `maestro event review.done --goal <GOAL id> --actor pm --data '{"review":"CR-<n>","to":"<to>","violations":<v>,"debt":<d>,"suggestions":<s>}'`.
2. Remove the snapshot: `maestro worktree cr-CR-<n> --remove --force` (it unlinks the shared folders first).
3. Commit the report, the tasks and the events on the main branch, in your checkout; at GOAL end, together with the QA reports and tasks.
4. Tell the owner the counts and the violations in one line each.
5. At GOAL end, the tasks go to the architect together with the QA defects, as **one fix wave** (PM skill section 4, step 4): never forward them to an architect already fixing. After a fast-lane integration, no architect is running: violations go to the active GOAL's next wave, or the owner chooses between a new GOAL and, for a single fix that qualifies, the fast lane (PM skill section 10).
