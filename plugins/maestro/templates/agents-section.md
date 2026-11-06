<!-- MAESTRO START -->
## Maestro: how the team works here

This block is managed by the Maestro plugin (`/maestro:init` refreshes it). Do not edit between the markers; put project rules, authority and checks elsewhere in this file.

### Roles

- **Owner:** decides goals, priorities, material choices and external actions. Talks to the PM.
- **PM** (main session, `maestro:pm` skill): plans with the owner, keeps `PLAN.md`, GOALs, decisions and the handoff; launches the architect, QA and the reviewer. Never writes product code.
- **Architect** (`maestro:architect`): leads one GOAL in waves, writes ADRs and contracts, launches two implementers, reviews and integrates.
- **Implementers** (`maestro:implementer`): one task each, in their own worktree and file scope, one named test per acceptance criterion.
- **QA explorer** (`maestro:qa-explorer`): black-box missions on a tagged snapshot (`qa/QA-<n>`).
- **Code reviewer** (`maestro:code-reviewer`): fresh periodic review of a tag range (`cr/CR-<n>`).

### Decisions

- Local, reversible details: whoever does the work, noted in the report.
- Technical choices within an approved direction: the architect, with an ADR in `docs/adr/`.
- Material choices (new technologies or dependencies, database, cache, new architectural components, data formats, persistence, external services, security, costs, scope): the owner, through the PM, with 2-3 options and a recommendation. Recorded in `backlog/decisions/`.
- At most two recovery attempts per problem and two critique cycles per result, counted across agents and sessions.

### Where state lives

| Path | Content | Git |
| --- | --- | --- |
| `PLAN.md` | vision, constraints, roadmap, index | yes |
| `backlog/` | Backlog.md: GOALs (label `goal`), tasks, decisions, archive | yes |
| `docs/adr/` | architecture decisions | yes |
| `.maestro/config.json` | Maestro settings (main branch, bands, review cadence, language, worktree setup) | yes |
| `.maestro/handoff.md` | PM state summary, rewritten only by the PM | yes |
| `.maestro/events.jsonl` | append-only event log (`merge=union`) | yes |
| `.maestro/reports/` | task, QA and review reports | yes |
| `.maestro/runtime/` | caches and hook state | no |
| `.claude/worktrees/` | implementer and snapshot worktrees | no |

### Tracker conventions

- Statuses: To Do, Ready, In Progress, Blocked, In Review, Integrated, Done. Done means integrated with inspectable evidence.
- A GOAL is a task labelled `goal`; `proposed` means not approved. Presence in the backlog never authorizes work.
- Tasks are subtasks of their GOAL with `--ref "scope:<glob>"`. Only the PM and the architect create tasks; implementers change only status, notes and claims.
- Edit tasks through the `backlog` CLI, never by hand. Archive closed GOALs; never delete them.

### Commands

- `maestro doctor` (prerequisites), `maestro status` (GOAL, tasks, claims, usage).
- `maestro claim <task> --actor <name>` / `maestro release <task> --actor <name> [--status S]`.
- `maestro worktree <name> --goal <GOAL id> [--reuse]`, `maestro worktree <name> --detach <tag>` (snapshot), `maestro worktree <name> --remove [--force]`. New worktrees get the `worktreeSetup` of `.maestro/config.json` (for example a link to the main checkout's `node_modules`); always remove them with `--remove`, never by hand.
- `maestro event <type> [--goal G] [--task T] [--actor A] [--data JSON]`.
- `maestro usage [--probe]`, `maestro context`, `maestro measure <task> --agent-id <ids>`.
- `backlog task list --plain`, `backlog task <id> --plain`.
- Skills: `/maestro:pm`, `/maestro:start-goal`, `/maestro:pause`, `/maestro:resume`, `/maestro:triage-qa`, `/maestro:periodic-review`, `/maestro:decision`, `/maestro:init`.

`maestro` is on PATH inside Claude Code sessions with the plugin enabled.

### Rules for every agent

- Never change permission modes; forward permission prompts to the owner.
- Never push or deploy without the authority recorded in this file or given by the owner for the current GOAL. A past deploy grants no future deploy.
- Never weaken an acceptance criterion or a check to make it pass.
<!-- MAESTRO END -->
