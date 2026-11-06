# Maestro: agent instructions

Maestro is a Claude Code plugin that runs an autonomous software team (PM, architect, two implementers, exploratory QA, periodic code reviewer). This repository holds the plugin source and its marketplace. It is also a project developed with the Maestro way of working.

## Start here

1. `PLAN.md`: vision, constraints, roadmap and index.
2. `team-workflow/flusso-team-agenti.html`: the design spec and **source of truth** (in Italian, with diagrams). Change the design there, in the same commit as the change it describes.
3. Tracker: `backlog task list --plain` and `backlog task <id> --plain`; decisions in `backlog/decisions/`.
4. `research/`: verified facts about Claude Code, Paseo, trackers and hook prototypes. Re-verify before relying on anything version-sensitive.

## People and roles

- **Owner:** Luca Regazzi. He is responsible for the project, not just a user. He decides goals, priorities, material choices and external actions. Talk to him in Italian; write framework files, commands and code in English.
- **PM:** the main session. It agrees GOALs with the owner, keeps the tracker and PLAN.md, spawns architects, QA and reviewers, and watches context and usage.
- Until the plugin exists, the PM may act as architect for small GOALs and delegate implementation to subagents.

## Authority

- **Local commits** in this repository: allowed (standing, owner 2026-11-06). Make atomic commits with clear messages.
- **Push** to `okon3/maestro` (which publishes the plugin): only on explicit owner request.
- **Other repositories** (for example `E:\Projects\Agriturismo`): no changes unless the active GOAL authorizes them.
- **Never:** deploy, change agents' permission modes, or delete `E:\Projects\maestro-lab\` without asking.
- **Decisions:** follow decision-13 (governance and retry limits). Material choices go to the owner with 2–3 options and a recommendation.

## Tracker conventions (Backlog.md 1.55.3, global)

- A **GOAL** is a task labelled `goal` in milestone `v1`. Its description states outcome, approval, exclusions and authority; its acceptance criteria are the checklist. The label `proposed` means not approved.
- **Tasks** are subtasks of their GOAL (`-p <goal id>`), detailed in waves when the GOAL starts. Scope goes in `--ref "scope:<glob>"`.
- **Statuses:** To Do, Ready, In Progress, Blocked, In Review, Integrated, Done. Done means integrated with inspectable evidence.
- Only the PM or architect create tasks. Edit tasks through the CLI, never by hand. Archive closed GOALs; never delete them.
- **Decisions:** `backlog decision create "<title>" -s accepted`, then fill in Context, Decision and Consequences.

## Repository layout

| Path | Content |
| --- | --- |
| `team-workflow/` | Design spec (HTML) |
| `research/` | Research and experiment results |
| `prompts/` | Orchestrator prompts v1–v4 (replaced by the plugin; v4 rules carried over) |
| `backlog/` | Tracker: GOALs, tasks, decisions |
| `archive/` | Superseded material (wayfinder map, original handoff) |
| `E:\Projects\maestro-lab\` | Disposable lab outside the repo, for experiments |

## Environment

- Windows 11, PowerShell and Git Bash. Use `py` for Python.
- Pass `</dev/null` to `claude -p`, and set `MSYS_NO_PATHCONV=1` when passing slash commands from Git Bash.
- Files are LF in the repository (`.gitattributes`). Prefer the Edit tool for existing files.
