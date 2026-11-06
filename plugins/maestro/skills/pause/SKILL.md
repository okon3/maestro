---
name: pause
description: Bring Maestro work to a clean, committed point so it can resume later or on another PC - stop starting work, settle running agents, commit WIP on wip/<task> branches, update the tracker, handoff and events. Used by the PM when the owner asks to pause, at a usage limit, or before switching PC.
argument-hint: "[reason]"
---

# Pause

Reason: `$ARGUMENTS`

The goal is a state that a fresh clone can resume from: everything that matters is committed, and nothing depends on this session, its agents or its runtime files.

1. **Stop starting work.** No new GOAL, wave, task, QA mission or review from now on. Log it: `maestro event session.pause --actor pm --data '{"phase":"start","reason":"<reason>"}'`.
2. **Settle running agents.** Check the agent ids in `.maestro/handoff.md`, `maestro status` (claims) and `git worktree list`.
   - If an architect is active and can be resumed, send it with `SendMessage`: "Pause: launch nothing new. Let running implementers finish, or stop them at a clean point. Commit each unfinished task on `wip/<task id>` as described in the pause skill, record the state in the task notes, and return STATE: blocked with what is paused."
   - Wait for running agents to return. Do not kill an agent that is about to finish; at a usage limit, stop it at the next clean point.
3. **Save unfinished work.** For each implementer worktree (`.claude/worktrees/impl-<n>`) whose task is not integrated:
   1. In the worktree: `git add -A`, then `git commit -m "WIP <task id>: <what is done, what is next>"` if anything changed.
   2. `git branch -f wip/<task id> impl-<n>`. Branch names in `wip/` are the only ones that survive a clone; `impl-<n>` is local.
   3. `backlog task edit <task id> --append-notes "paused <date>: WIP on wip/<task id> at <sha>; next: <step>"`.
   4. `maestro release <task id> --actor impl-<n> --status Ready`. Claims and locks live outside git and do not survive a clone.
   Leave the worktrees in place: on this PC the resume reuses them.
4. **Update the tracker.** Every task and GOAL shows its real state: In Progress only if something is really running (nothing should be), Blocked with the reason, Integrated where merged. Record counters (recovery, critique cycles) in the task notes.
5. **Rewrite `.maestro/handoff.md`** with these sections, short and factual:
   - `## Now`: active GOAL, branch, wave, what was happening when paused, and why it paused.
   - `## Running agents (ids)`: agent ids and their state, or "none" (after a pause, normally none).
   - `## Waiting for the owner`: open decisions and owner actions.
   - `## Next action`: the first concrete step on resume, with the `wip/` branches to restore.
   - `## Notes`: limits reached, usage, anything a fresh session needs.
6. **Log and commit.** `maestro event session.pause --actor pm --data '{"phase":"done"}'`. Commit the tracker, `.maestro/handoff.md`, `.maestro/events.jsonl` and any reports on the current branch (normally the goal branch).
7. **Push only with authority.** If the project's `AGENTS.md` grants standing push authority, or the owner asks now, push the main branch, the goal branch, the `wip/*` branches and the `qa/*`, `cr/*` and `goal/*` tags. Otherwise tell the owner exactly what is unpushed and the command to push it.
8. **Report to the owner:** what is paused, where the WIP is, what is pushed, and how to resume (`/maestro:resume`).
