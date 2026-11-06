---
name: start-goal
description: Start an approved Maestro GOAL - check its fields, create the goal branch and launch the architect in the background with a complete brief, so the PM stays available to the owner. Used by the PM.
argument-hint: "<goal task id>"
---

# Start a GOAL

GOAL: `$ARGUMENTS`

1. **Check approval and fields.** Run `backlog task $ARGUMENTS --plain`. The GOAL must be labelled `goal`, must not carry `proposed`, and its description must state outcome, approval, exclusions and authority, with acceptance criteria present. If anything is missing, agree it with the owner first.
2. **Check capacity.**
   - Run `maestro doctor`. It must pass.
   - Run `maestro usage --check`. At level `lower`, `top` or `paused` (at or above the lower usage band, or a pause is active), do not start: an architect is a long agent. Report to the owner with the reset time.
   - Check your context. Above the first context band, do not start a GOAL.
3. **Check that no other GOAL is In Progress.** If one is, parallel GOALs need the owner's explicit agreement.
4. **Prepare.** Your checkout stays on the main branch for the whole GOAL: never switch it. The tracker lives there, and the architect works on the goal branch in its own worktree (`.claude/worktrees/goal-$ARGUMENTS`).
   - Check that your checkout is on the main branch (`git branch --show-current`) and has no uncommitted change except `.maestro/events.jsonl`.
   - Create the goal branch without switching: `git branch goal/$ARGUMENTS <mainBranch>`. If it already exists, keep it; if only the remote has it, `git branch goal/$ARGUMENTS origin/goal/$ARGUMENTS`.
   - Run `backlog task edit $ARGUMENTS -s "In Progress"`.
   - Run `maestro event goal.start --goal $ARGUMENTS --actor pm`.
   - Commit the tracker change and `.maestro/events.jsonl` on the main branch.
5. **Launch the architect.** Call the Agent tool with `subagent_type: "maestro:architect"` and `run_in_background: true`, then end your turn telling the owner the GOAL is running and that `/maestro:dashboard` shows progress. Background is required: a foreground architect blocks you for the whole GOAL and the owner cannot talk to you. Its final report reaches you as a completion notification (a new turn); the architect itself launches its implementers in the foreground, so it stays active until they return. Give it this brief:

```
GOAL: <id> - <title>
Goal branch: goal/<id> (main branch: <mainBranch from .maestro/config.json>)
Main checkout (tracker, stays on the main branch): <absolute path of your checkout>
Goal worktree: <main checkout>/.claude/worktrees/goal-<id> (create or reuse it as your instructions say)
Plugin root (if `maestro` is not on PATH): ${CLAUDE_PLUGIN_ROOT}
Authority: <from the GOAL: commits on goal and implementer branches, merge to main at the end; no push or deploy unless the GOAL grants it>
Owner decisions relevant to this GOAL: <links to backlog/decisions, or "none">
Project checks: <the standard checks from AGENTS.md>
Constraints and exclusions: <from the GOAL>
Return the final report in the format defined in your instructions.
```

6. **On return**, follow the PM skill section 4:
   - **integrated:** go on to the GOAL-end check: QA and, when due, the code review in parallel, then one fix wave.
   - **blocked:** ask the owner, record the decision with `maestro:decision`, then resume the architect with `SendMessage`.
   - **failed:** diagnose; the recovery limits apply.

   The architect's agent id is known when it returns: record it in `.maestro/handoff.md` whenever the GOAL stays open (blocked, failed, or waiting for QA), so it can be resumed after a pause.
