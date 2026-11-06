# Maestro dashboard: contract (M-3)

Owned by the M-3 architect. Design intent: `team-workflow/flusso-team-agenti.html` section 13. Implementers propose corrections in their reports.

## Shape

- `plugins/maestro/scripts/dashboard/`:
  - `state.mjs`: pure functions that build the state below from raw inputs, plus `loadState(root)`, which reads the inputs from disk;
  - `server.mjs`: `node:http` server;
  - `public/`: `index.html`, `app.js`, `app.css`. No build step, no framework, no CDN: everything is served locally.
- `maestro dashboard [--port N] [--no-open] [--json]`: starts the server for the current project. It binds `127.0.0.1`, uses port 4517 by default (falls back to the next free port), and prints the URL. It writes `{pid, port, url, startedAt}` to `.maestro/runtime/dashboard.json`. If a live server is already recorded there, it prints that server's URL instead of starting another. `--stop` stops it.
- Skill `dashboard` (`/maestro:dashboard`): runs the command in the background and gives the owner the URL.
- Read-only: the server never writes project files other than `.maestro/runtime/dashboard.json`, and never runs `backlog` commands that modify anything.

## Inputs

| Source | How it is read |
| --- | --- |
| Tasks, GOALs, drafts | Parse the Markdown frontmatter of `backlog/tasks/*.md`, `backlog/archive/tasks/*.md` (archived: true) and `backlog/drafts/*.md` (draft: true) directly. Fields: id, title, status, assignee(s), labels, milestone, dependencies, references, parent_task_id / parent, created_date, updated_date, priority. Acceptance criteria counts come from the body checkboxes between `<!-- AC:BEGIN -->` and `<!-- AC:END -->`. Tolerate both key spellings Backlog.md uses (snake_case and camelCase). |
| Milestones | `backlog/milestones/*.md` and `backlog/archive/milestones/*.md`: id, title, description. |
| Decisions | `backlog/decisions/*.md`: id, title, date, status. |
| Events | `.maestro/events.jsonl` via `lib/events.mjs` `readEvents`. |
| Reports | `.maestro/reports/**/*.md`: kind (`task`, `qa`, `review`), id from the file name, mtime, first heading or line. |
| Git | main branch tip (short sha and subject), current branch, tags `done/*`, `qa/QA-*`, `cr/CR-*` with dates. |
| Runtime | `.maestro/runtime/usage.json` (`{ts, fiveHour, sevenDay, resetsAt}`) and `.maestro/runtime/context.json` (`{ts, sessionId, percent, contextTokens, window}`, written by the context-watch hook on every run in the main session). |
| Prices | `scripts/dashboard/prices.mjs`: list prices per million tokens for each model family (input, output, cache read, cache write), with source URL and date. Config `prices` in `.maestro/config.json` overrides them. |

## `GET /api/state`

```json
{
  "generatedAt": "ISO",
  "project": { "name": "Quaderno territoriale", "root": "E:/...", "mainBranch": "master", "language": "it" },
  "header": {
    "activeGoal": { "id": "TASK-1", "title": "...", "done": 3, "total": 7 } ,
    "main": { "sha": "1211ccf", "subject": "...", "date": "ISO" },
    "review": { "integratedSinceLast": 9, "every": 15, "lastTag": "cr/CR-1" },
    "context": { "percent": 48.2, "ts": "ISO", "stale": false },
    "usage": { "fiveHour": 62, "sevenDay": 31, "resetsAt": 1793988600, "ts": "ISO", "stale": false },
    "ownerWaiting": 1
  },
  "milestones": [ { "id": "m-1", "title": "...", "description": "...", "archived": false,
                    "goals": [ { "id": "TASK-1", "title": "...", "status": "In Progress", "labels": [], "proposed": false,
                                 "done": 3, "total": 7, "dependencies": ["TASK-9"], "archived": false } ],
                    "drafts": [ { "id": "draft-3", "title": "..." } ] } ],
  "tasks": [ { "id": "TASK-1.2", "title": "...", "status": "Ready", "goal": "TASK-1", "assignees": ["@impl-1"],
               "dependencies": ["TASK-1.1"], "scope": ["src/map/**"], "acDone": 1, "acTotal": 4,
               "updatedAt": "ISO", "archived": false } ],
  "agents": [ { "agentId": "a1b2", "type": "maestro:implementer", "actor": "impl-1", "task": "TASK-1.2",
                "state": "running", "since": "ISO", "until": null } ],
  "decisions": [ { "id": "decision-1", "title": "...", "status": "open", "date": "ISO", "path": "backlog/decisions/decision-1 - Title.md" } ],
  "reports": [ { "kind": "qa", "id": "QA-1", "path": ".maestro/reports/qa/QA-1.md", "title": "...", "mtime": "ISO" } ],
  "costs": {
    "estimate": true,
    "pricesSource": "https://... (2026-11-06)",
    "tasks": [ { "task": "TASK-1.2", "goal": "TASK-1", "title": "...", "wallMs": 220425, "reworkCycles": 0,
                 "ownerInterventions": 0,
                 "models": { "claude-sonnet-5-5": { "input": 34, "output": 33352, "cacheRead": 892551, "cacheWrite": 75324 } },
                 "usd": 1.23 } ],
    "goals": [ { "goal": "TASK-1", "title": "...", "tasks": 3, "wallMs": 0, "usd": 0, "models": {} } ],
    "unpriced": ["model-id-without-price"]
  },
  "events": [ "last 50 events, newest first" ]
}
```

Rules:

- **Active GOAL:** the task labelled `goal` with status In Progress. If there are several, take the most recently updated.
- **`header.ownerWaiting`:** decisions with status `open` or `proposed`, plus Blocked tasks.
- **Review counter:** `task.status` events to `Integrated` after the date of the latest `cr/CR-*` tag (all of them if there is no tag).
- **Agents:** pair `agent.start` and `agent.stop` events by `agentId`. Running means no stop yet and a start less than 12 hours old. Link an agent to a task and actor through the nearest `task.claim` that follows its start within 2 minutes, by the same actor's claim.
- **Stale:** `context` and `usage` are stale when older than 30 minutes.
- **USD:** `sum(tokens × price / 1e6)` over the models that have a price, rounded to cents; `null` only when no model has a price. Unpriced models are listed in `costs.unpriced` and the page flags such sums as partial. A GOAL sums its tasks the same way.
- **Agents `state`:** `running` or `finished`. `actor` and `task` are null when no claim follows the start (architect, QA, reviewer).
- **Extra top-level fields:** `git: {branch, tags}` and `warnings` (files skipped while parsing).
- **Caching:** every response carries `cache-control: no-store`.

## `GET /api/stream`

Server-Sent Events. Every 500 ms the server debounces `fs.watch` notifications (recursive on `backlog/`, plus `.maestro/`) and then sends `event: changed`. The page refetches `/api/state` when it gets one. A heartbeat comment goes out every 25 s.

## `GET /api/report?path=<relative>`

Returns the raw Markdown as `text/plain`, only for paths under `.maestro/reports/` or `backlog/decisions/`. Every other path gets 400.

## Page

Header (section above), then tabs:

- Roadmap: milestones, then GOALs with progress and dependencies, then drafts.
- Board: the active GOAL's tasks by status column, with an "all tasks" toggle.
- Agents: running and recent.
- Decisions.
- Reports: list and Markdown viewer.
- Costs: per GOAL and per task. Tokens by model and wall time are measured. USD is labelled as a list-price estimate.

There is also a short event feed. The UI text is in English. The page works offline from `localhost` and uses a desktop viewport.
