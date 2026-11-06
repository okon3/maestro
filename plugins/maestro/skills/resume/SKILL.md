---
name: resume
description: Resume paused Maestro work on any PC, also after a fresh clone - read the handoff, tracker and wip branches, recreate worktrees, reconcile stale state and continue the approved work. Used by the PM.
argument-hint: "[GOAL id]"
---

# Resume

GOAL (optional): `$ARGUMENTS`

Recorded state is a claim, not a fact: verify it before acting. A stale In Progress status proves nothing.

1. **Sync.** If the repository has a remote, `git fetch --all --tags`. Switch to the goal branch named in `.maestro/handoff.md` (or `goal/$ARGUMENTS`), creating the local branch from the remote one if needed. Do not pull into a branch with local changes you have not inspected.
2. **Check capacity.** Run `maestro doctor`; it must pass (a missing or wrong Backlog.md is a capacity block: report the install command to the owner). Run `maestro usage --probe` and compare it with `usageBands` in `.maestro/config.json` (default 85 and 95): at or above the top band, do not resume work: leave the pause on, save the work (step 3) and tell the owner the reset time.
3. **Save interrupted work.** Run `maestro salvage`: agents of an earlier session are gone, and any uncommitted work they left in an implementer worktree is committed to `wip/<task id>` (nothing happens when the worktrees are clean). It also clears the "interrupted by a usage limit" notice. Note each saved branch for step 5.
4. **Read the state:**
   - `AGENTS.md`, `PLAN.md` and `.maestro/handoff.md`;
   - `maestro status` and the GOAL (`backlog task <GOAL id> --plain`) with its tasks;
   - the WIP branches: `git branch -a --list "*wip/*"`;
   - the worktrees: `git worktree list`;
   - the last events in `.maestro/events.jsonl`.
5. **Reconcile.** For each task, decide its real state from evidence:
   - agent ids in the handoff belong to the old session. Treat those agents as gone unless you can see them running in this session;
   - In Progress with no running agent: it is interrupted. If a `wip/<task id>` branch or an `impl-<n>` branch holds its work, note it in the task; set the task to Ready and release stale claims (`maestro release <task id> --actor <name> --status Ready`);
   - In Review or Integrated: check the branch or the merge commit exists;
   - claims listed by `maestro status` with no running agent are stale: release them.
   Record what you changed in the task notes.
6. **Recreate worktrees** for tasks with WIP:
   - on the same PC, if the worktree still exists: `maestro worktree impl-<n> --goal <GOAL id> --reuse`;
   - after a clone: `maestro worktree impl-<n> --goal <GOAL id>`, then `git -C <printed path> reset --hard wip/<task id>` (the branch was just created, so nothing is lost).
   Tell the architect which task continues from which WIP branch. Delete `wip/<task id>` once the task is integrated.
7. **Rewrite `.maestro/handoff.md`** (sections Now, Running agents (ids), Waiting for the owner, Next action, Notes) with the reconciled state. Run `maestro pause --off --actor pm` (claims and Maestro agent launches are allowed again) and log `maestro event session.resume --goal <GOAL id> --actor pm`. Commit.
8. **Continue.** Resume approved work in its agreed order without asking again. Run `maestro usage --check` first, as before every launch (PM skill section 6): at level `lower`, launch no architect yet; tell the owner and wait for the reset.
   - If an architect from this session is still resumable, `SendMessage` to it.
   - Otherwise launch a fresh architect as in the `maestro:start-goal` skill step 5 (skip its step 4: the GOAL is already In Progress and its branch exists), adding to the brief: `Resuming: <reconciled task states, WIP branches and worktrees>`.
   - Questions waiting for the owner: ask them now; only the blocked work waits.
