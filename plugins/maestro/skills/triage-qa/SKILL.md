---
name: triage-qa
description: Run exploratory QA on a tagged snapshot and triage the findings - tag qa/QA-n, write the requirements, launch 1-4 short qa-explorer missions, check each finding against the main branch and turn valid defects into tasks. Used by the PM after a GOAL is integrated or before a deploy.
argument-hint: "<GOAL id> [areas]"
---

# QA and triage

GOAL and areas: `$ARGUMENTS`

QA levels (chosen by the architect per task, summarized in its QA HINTS): **none**, **self-smoke** (done by the implementer), **checkpoint** (at GOAL end or before a deploy) and **dedicated** (critical areas: persistence, migrations, file formats). This skill runs checkpoint and dedicated QA.

## 1. Snapshot

1. Pick the next number: `git tag --list "qa/QA-*"`; `n` = highest + 1 (start at 1).
2. Tag the main branch: `git tag qa/QA-<n> <mainBranch>`.
3. Prepare the snapshot as the project's `AGENTS.md` says: a build copied outside the repository, or a read-only worktree: `git worktree add --detach .claude/worktrees/qa-QA-<n> qa/QA-<n>`, then the project's build or start command there. Note the start command and URL for the brief. Give parallel missions separate ports and data.
4. Log: `maestro event qa.start --goal <GOAL id> --actor pm --data '{"qa":"QA-<n>","tag":"qa/QA-<n>"}'`.

## 2. Requirements and missions

1. Write `.maestro/reports/qa/QA-<n>-requirements.md` for a tester who never sees the code:
   - **Context:** what the product does and who uses it, in a few lines.
   - **How to run:** start command or URL, accounts, test data, viewport.
   - **Requirements by area:** the expected behaviour from the GOAL criteria and the owner's decisions, in user terms. No file names, no code.
   - **Out of scope:** what not to test.
2. Choose **1–4 short missions**, one area each, from the architect's QA HINTS: changed user-visible behaviour first, then critical areas. A single broad mission covers little; keep each one narrow.
3. **Freeze critical areas.** For a dedicated mission on persistence, migrations or file formats, freeze that area: no integration that touches it until this report is closed. Log `maestro event qa.freeze --actor pm --data '{"qa":"QA-<n>","areas":["<area>"]}'`, add the freeze to `.maestro/handoff.md`, and tell the architect if one is active. Other areas keep moving.

## 3. Launch

Launch one Agent per mission with `subagent_type: "maestro:qa-explorer"`, in the **foreground**. Launch independent missions in the same message so they run in parallel. Brief:

```
QA: QA-<n>   Tag: qa/QA-<n>
Snapshot: <worktree path or build path>; start: <command>; URL: <url>
Requirements: <main checkout, absolute>/.maestro/reports/qa/QA-<n>-requirements.md
Mission: <m> - <area>: <what to explore, the requirements that matter most>
Report: <main checkout, absolute>/.maestro/reports/qa/QA-<n>-<m>.md
Viewport: desktop 1440x900 (unless the area needs another)
Accounts and data: <...>
```

## 4. Triage

For each finding in each report:

1. Map its area to the code paths that implement it (task scopes, the architect's QA HINTS).
2. Compare the snapshot with today's main branch: `git diff --stat qa/QA-<n>..<mainBranch> -- <area paths>`.
   - **No change:** the finding is valid as reported.
   - **Changed:** re-verify before acting: a one-finding mission on a new tag, or mark it for the next QA if the change clearly targets it.
3. Classify each finding: **defect** (breaks a requirement), **not a defect** (requirement misread or out of scope; say why), **owner question** (the requirement itself is unclear: ask the owner), **stale** (no longer reproducible on main).
4. Write `.maestro/reports/qa/QA-<n>-triage.md`: one line per finding with its class, the reason and the task id.

## 5. Close

1. **Close the report first.** Fixes from a report start only after it is closed.
2. Turn valid defects into tasks for the architect, linked to the GOAL: `backlog task create "Defect: <title>" -p <GOAL id> -s "To Do" --ref "qa:QA-<n>/<mission>/<finding>" -d "<steps, expected, actual, evidence path, tag>"`. Critical and major defects get `--priority high`.
3. Lift freezes: `maestro event qa.done --goal <GOAL id> --actor pm --data '{"qa":"QA-<n>","defects":<count>,"unfrozen":["<area>"]}'`, and update `.maestro/handoff.md`.
4. Remove the snapshot worktree: `git worktree remove --force .claude/worktrees/qa-QA-<n>`. Keep the tag.
5. Commit the requirements, reports and triage (`.maestro/reports/qa/`), the tasks and `.maestro/events.jsonl` on the branch the PM's checkout is on (the main branch after integration).
6. If there are defects, resume the architect with `SendMessage` (or launch one with `maestro:start-goal`) to fix them. The GOAL closes only when its criteria hold with evidence and no critical or major defect is open.
