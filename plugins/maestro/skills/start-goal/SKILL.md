---
name: start-goal
description: Start an approved Maestro GOAL - check its fields, create the goal branch and launch the architect in the foreground with a complete brief. Used by the PM.
argument-hint: "<goal task id>"
---

# Start a GOAL

GOAL: `$ARGUMENTS`

1. **Check approval and fields.** Run `backlog task $ARGUMENTS --plain`. The GOAL must be labelled `goal`, must not carry `proposed`, and its description must state outcome, approval, exclusions and authority, with acceptance criteria present. If anything is missing, agree it with the owner first.
2. **Check capacity.**
   - Run `maestro doctor`. It must pass.
   - Run `maestro usage --probe`. Above the highest usage band, do not start: report to the owner.
   - Check your context. Above the first context band, do not start a GOAL.
3. **Check that no other GOAL is In Progress.** If one is, parallel GOALs need the owner's explicit agreement.
4. **Prepare.**
   - Run `backlog task edit $ARGUMENTS -s "In Progress"`.
   - Run `git switch -c goal/$ARGUMENTS` from the main branch, or switch to it if it exists.
   - Run `maestro event goal.start --goal $ARGUMENTS --actor pm`.
   - Commit the tracker change.
5. **Launch the architect.** Call the Agent tool with `subagent_type: "maestro:architect"`, in the **foreground**. Never run it in the background: you need its report in this turn. Give it this brief:

```
GOAL: <id> - <title>
Goal branch: goal/<id> (main branch: <mainBranch from .maestro/config.json>)
Plugin root (if `maestro` is not on PATH): ${CLAUDE_PLUGIN_ROOT}
Authority: <from the GOAL: commits on goal and implementer branches, merge to main at the end; no push or deploy unless the GOAL grants it>
Owner decisions relevant to this GOAL: <links to backlog/decisions, or "none">
Project checks: <the standard checks from AGENTS.md>
Constraints and exclusions: <from the GOAL>
Return the final report in the format defined in your instructions.
```

6. **On return**, follow the PM skill section 4:
   - **integrated:** go on to QA and review.
   - **blocked:** ask the owner, record the decision with `maestro:decision`, then resume the architect with `SendMessage`.
   - **failed:** diagnose; the recovery limits apply.

   Record the architect's agent id in `.maestro/handoff.md` while the GOAL is open.
