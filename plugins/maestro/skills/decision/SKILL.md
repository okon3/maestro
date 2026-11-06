---
name: decision
description: Record an owner decision in Backlog.md (context, options, choice, consequences), log it and link it from the GOAL. Used by the PM right after the owner decides a material question.
argument-hint: "<decision title>"
---

# Record an owner decision

Title: `$ARGUMENTS`

Use this for **material** decisions the owner took (PM skill section 3). Technical choices within an approved direction are the architect's ADRs, not owner decisions.

1. **Collect the facts** from the conversation:
   - the question and why it came up (GOAL, task, who raised it);
   - the 2–3 options considered, each with its main consequence;
   - the owner's choice and the reason given;
   - the date and any limits (scope, expiry, conditions).
   If the choice or the reason is unclear, ask the owner once before recording.
2. **Create the decision:** `backlog decision create "$ARGUMENTS" -s accepted --plain`. Note the id (`decision-<n>`) and the file under `backlog/decisions/`.
3. **Fill the file** (the only tracker file you edit by hand: the CLI has no body options for decisions). Write in English under the existing headings:
   - `## Context`: the question, what triggered it, constraints.
   - `## Decision`: options considered (one line each), the chosen one, why, who decided and when.
   - `## Consequences`: what changes, what is now allowed or excluded, follow-ups.
   Keep it short. Never report the decision as saved if the write failed.
4. **Log it:** `maestro event decision.recorded --goal <GOAL id> --actor pm --data '{"id":"decision-<n>","title":"<title>"}'`.
5. **Link it from the GOAL:** `backlog task edit <GOAL id> --append-notes "decision-<n>: <one-line choice>"`. If the decision grants or revokes standing authority, also update the authority section of `AGENTS.md`.
6. **Commit** the decision, the GOAL and `.maestro/events.jsonl` together.
7. **Unblock:** if an architect is waiting on this decision, resume it with `SendMessage` to its agent id, giving the decision id and the choice.
