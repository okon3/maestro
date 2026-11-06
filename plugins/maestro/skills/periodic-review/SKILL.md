---
name: periodic-review
description: Run the periodic code review - due every reviewEveryTasks integrated tasks or at GOAL end - tag cr/CR-n, launch a fresh code-reviewer on the commit range, and turn violations, debt and suggestions into tasks and notes. Used by the PM.
argument-hint: "[GOAL id]"
---

# Periodic code review

GOAL (optional): `$ARGUMENTS`

The review never blocks work in progress.

## 1. Is it due?

It is due at the end of every GOAL, or when `reviewEveryTasks` (from `.maestro/config.json`) tasks have been integrated since the last review, whichever comes first. Count the `task.status` events with `"to":"Integrated"` in `.maestro/events.jsonl` after the last `review.start` event. If it is not due and the owner did not ask, stop here.

## 2. Tag and launch

1. Pick the number: `git tag --list "cr/CR-*"`; `n` = highest + 1 (start at 1).
2. Choose the range base: the previous tag `cr/CR-<n-1>`. For the first review, use the main-branch commit just before the first GOAL integrated with Maestro.
3. Tag the main branch: `git tag cr/CR-<n> <mainBranch>`. Give the reviewer a read-only snapshot, not the main checkout: `git worktree add --detach .claude/worktrees/cr-CR-<n> cr/CR-<n>`; remove it when the review is triaged.
4. Log: `maestro event review.start --goal <GOAL id> --actor pm --data '{"review":"CR-<n>","range":"<base>..cr/CR-<n>"}'`.
5. Launch a **fresh** Agent with `subagent_type: "maestro:code-reviewer"`, in the foreground. Never reuse an earlier reviewer. Brief:

```
Review: CR-<n>
Range: <base>..cr/CR-<n>
Integrated in the range: <GOAL ids and task ids>
Report: .maestro/reports/review/CR-<n>.md
Project checks: <from AGENTS.md>
```

## 3. Turn findings into work

Read the report. Check that each finding is concrete (file, symbol, failure scenario); drop the ones that are not, and say why in the GOAL notes. Then:

- **violation:** a priority task for the architect: `backlog task create "Fix: <title>" -p <GOAL id> -s "To Do" --priority high --ref "review:CR-<n>/<V-id>" -d "<where, rule, failure scenario, proposed fix>"`. If the GOAL is closed, attach it to the active GOAL; if none is active, propose a GOAL to the owner.
- **debt:** a queued task: the same command without `--priority high` and with `--ref "review:CR-<n>/<D-id>"`. Place it in the current GOAL only if it fits its scope; otherwise propose its placement to the owner (PM skill section 2: no silent scope growth).
- **suggestion:** a note only: `backlog task edit <GOAL id> --append-notes "CR-<n> suggestions: <ids, one line each>"`.

A violation that needs a material decision goes to the owner first (PM skill section 3).

## 4. Close

1. Log: `maestro event review.done --goal <GOAL id> --actor pm --data '{"review":"CR-<n>","violations":<v>,"debt":<d>,"suggestions":<s>}'`.
2. Commit the report, the tasks and the events.
3. Tell the owner the counts and the violations in one line each. Resume the architect for priority tasks.
