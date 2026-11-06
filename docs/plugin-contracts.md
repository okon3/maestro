# Maestro plugin: technical contracts (M-2)

Status: wave 1 contracts, owned by the M-2 architect. Change these only through the architect; implementers propose corrections in their report. Design intent is in `team-workflow/flusso-team-agenti.html`; this file fixes the shapes the code depends on.

## 1. Repository layout

```
.claude-plugin/marketplace.json     marketplace "okon3", one plugin "maestro", source ./plugins/maestro (install id maestro@okon3)
plugins/maestro/
  .claude-plugin/plugin.json        name "maestro", no version: the commit SHA is the version (docs/adr/0001)
  agents/                           architect.md, implementer.md, qa-explorer.md, code-reviewer.md
  skills/<name>/SKILL.md            pm, start-goal, pause, resume, triage-qa, periodic-review, decision, init
  hooks/hooks.json                  points to node scripts in scripts/hooks/
  bin/maestro (+ maestro.cmd)       thin launchers for scripts/cli.mjs
  scripts/
    cli.mjs                         `maestro` command dispatcher
    lib/config.mjs                  project root and config loading
    lib/events.mjs                  append-only event log
    lib/context.mjs                 context usage from a transcript
    lib/backlog.mjs                 Backlog.md calls (version check, task view, edit)
    lib/git.mjs                     git helpers (common dir, branches, worktrees)
    hooks/*.mjs                     one entry per hook event
  templates/                        project files written by the init skill
  test/                             node:test suites (node --test)
```

Only Node built-ins (Node >= 20). No npm dependencies in the plugin.

## 2. Project data (in each project using Maestro)

| Path | Git | Content |
| --- | --- | --- |
| `.maestro/config.json` | yes | project configuration (section 3) |
| `.maestro/handoff.md` | yes | PM state summary, rewritten by the PM only |
| `.maestro/events.jsonl` | yes | event log, append only, `merge=union` |
| `.maestro/reports/<kind>/<id>.md` | yes | kind: `task`, `qa`, `review` |
| `.maestro/runtime/` | no | usage cache, hook band state, misc runtime |
| `<git-common-dir>/maestro-locks/<task-id>/` | no | claim locks, shared by all worktrees |
| `.claude/worktrees/<name>/` | no | implementer worktrees |
| `backlog/` | yes | Backlog.md tracker |
| `docs/adr/` | yes | architecture decision records |

## 3. `.maestro/config.json`

```json
{
  "schemaVersion": 1,
  "mainBranch": "master",
  "goalBranchPrefix": "goal/",
  "contextWindow": 1000000,
  "contextBands": [50, 65, 80],
  "usageBands": [85, 95],
  "backlogVersion": "1.55.3",
  "reviewEveryTasks": 15,
  "language": "it"
}
```

All keys are optional; `lib/config.mjs` merges the file over these defaults. The project root is the git top level of the main worktree (`git rev-parse --path-format=absolute --git-common-dir`, parent dir), so commands run from a worktree read and write the main checkout's `.maestro/`.

## 4. Event log: `.maestro/events.jsonl`

One JSON object per line, UTF-8, LF, written with a single `appendFileSync` call per event (one line < 4 KB is atomic enough on local disks).

```json
{"ts":"2026-11-06T15:04:05.123Z","type":"task.claim","actor":"impl-1","goal":"TASK-3","task":"TASK-3.2","data":{}}
```

Required: `ts` (ISO UTC), `type`. Optional: `actor` (role name such as `pm`, `architect`, `impl-1`, `qa`, `reviewer`, or `hook`), `agentId`, `goal`, `task`, `data` (object).

Event types (wave 1):

| type | written by | data |
| --- | --- | --- |
| `task.status` | Backlog.md `on_status_change` via `maestro event` | `{from, to, title}` |
| `task.claim` / `task.claim_denied` / `task.release` | `maestro claim` / `maestro release` | `{reason?}` |
| `agent.start` / `agent.stop` | SubagentStart / SubagentStop hooks | `{agentType}`; stop adds `{usage}` (section 5) |
| `task.measure` | `maestro measure` (architect, when a task is integrated) | `{agentIds, usage, wallMs, ownerInterventions, reworkCycles}` |
| `session.compact` | PreCompact / SessionStart(compact) hooks | `{trigger, phase}` |
| `limit.hit` | StopFailure hook | `{error}` |
| `usage.sample` | `maestro usage --probe` | `{fiveHour, sevenDay, resetsAt}` |
| `context.band` | context hook, once per band crossing | `{percent, band}` |
| `goal.*`, `decision.*`, `qa.*`, `review.*` | skills, through `maestro event` | free-form |

## 5. Usage record (measurement, decision-17)

```json
{"models":{"claude-sonnet-5-5":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0}},"wallMs":0}
```

Computed from a transcript JSONL: sum of `message.usage` over `type:"assistant"` lines (deduplicated by `message.id`, since streamed messages repeat usage), grouped by `message.model`, skipping `<synthetic>`; `wallMs` = last minus first `timestamp`.

### Module API shared by CLI and hooks

- `lib/config.mjs`: `findProjectRoot(cwd)`, `gitCommonDir(cwd)`, `loadConfig(cwd) -> {root, config, initialized}` (done).
- `lib/events.mjs`: `appendEvent(root, type, fields)`, `readEvents(root)`, `makeEvent(type, fields, now)` (done).
- `lib/context.mjs` (owned by the hooks task):
  - `contextUsage(transcriptPath, {window}) -> {model, contextTokens, window, percent, postCompactNoUsageYet, preCompactTokens}`: last main-chain assistant message (skip `isSidechain:true` and model `<synthetic>`), `input + cache_read + cache_creation`; reads the file backwards in 256 KB chunks; after a `compact_boundary` with no later assistant message returns `postCompactNoUsageYet:true`.
  - `usageSummary(transcriptPath) -> {models, wallMs}` (section 5).
  - `subagentTranscriptPath(sessionTranscriptPath, agentId)`: `<dir>/<sessionId>/subagents/agent-<agentId>.jsonl`.

Note: a parent directory may itself be a git repository (on the owner's PC the home folder is one). Hooks and commands therefore act only when `.maestro/config.json` exists at the discovered root.

## 6. `maestro` CLI

Exit code 0 on success, 1 on error, 2 on a refused operation (claim denied, failed check). `--json` prints machine output.

| Command | Behaviour |
| --- | --- |
| `maestro doctor` | checks git, node, `backlog --version` == config `backlogVersion`, `.maestro/config.json` validity; prints fixes (e.g. `npm i -g backlog.md@1.55.3`) |
| `maestro event <type> [--goal G] [--task T] [--actor A] [--data JSON]` | appends one event |
| `maestro claim <task> --actor <name>` | mkdir lock in `<git-common-dir>/maestro-locks/<task>`; checks status is `Ready` (or `To Do`) and no other assignee via `backlog task view --json`; then `backlog task edit <task> -a @<name> -s "In Progress"` in the main checkout; logs `task.claim` or `task.claim_denied` (exit 2) |
| `maestro release <task> --actor <name> [--status S]` | removes the lock, optional status edit, logs `task.release` |
| `maestro worktree <name> --goal <G>` | creates `.claude/worktrees/<name>` on branch `<name>` from `goal/<G>` (creates the goal branch from main if missing); prints the path |
| `maestro context [--transcript P] [--json]` | context usage of a transcript (defaults to the current session if discoverable) |
| `maestro usage [--probe] [--json]` | last usage sample; `--probe` runs `claude -p "Reply OK" --output-format stream-json --verbose --model haiku --no-session-persistence </dev/null` and records `usage.sample` |
| `maestro measure <task> --agent-id <id>[,<id>] [--interventions N] [--rework N]` | reads the subagent transcripts, writes `task.measure` |
| `maestro status [--json]` | active GOAL, tasks by status, claims, last usage and context sample |

## 7. Hooks (plugin `hooks/hooks.json`)

| Event | Script | Behaviour |
| --- | --- | --- |
| SessionStart (startup, resume, clear, compact) | `session-start.mjs` | runs the doctor checks quietly (warn via `systemMessage` only on failure); on `compact`/`clear`/`resume` injects `.maestro/handoff.md` (max 9,000 chars) as `additionalContext` |
| UserPromptSubmit, PostToolUse | `context-watch.mjs` | main session only (skip when `agent_id` set); computes context %; on first crossing of each band per session injects one warning with the action to take; logs `context.band` |
| PreCompact | `pre-compact.mjs` | prints preservation instructions (state lives in files; keep IDs of running agents, open decisions, next action) |
| SubagentStart / SubagentStop | `agent-events.mjs` | logs `agent.start` / `agent.stop` with usage from `agent_transcript_path` |
| StopFailure | `stop-failure.mjs` | logs `limit.hit` |

`hooks/hooks.json` wraps events in a top-level `"hooks"` key and uses the exec form so it works in Git Bash and PowerShell alike: `{"type":"command","command":"node","args":["${CLAUDE_PLUGIN_ROOT}/scripts/hooks/<name>.mjs"],"timeout":30}`. Hook input arrives as JSON on stdin; output is one JSON object on stdout (`hookSpecificOutput.hookEventName` is required when `additionalContext` is used). Shape reference: `research/plugin-format-reference.md` section 4.

Hooks must never block the session: catch every error, exit 0, and write diagnostics to `.maestro/runtime/hook-errors.log`. Only act when the project has `.maestro/config.json` (Maestro not initialized → no-op).

## 8. Tests

`node --test plugins/maestro/test/` must pass on Windows (Git Bash and PowerShell). Tests use temporary git repos and a fake `backlog` executable where needed; they never touch the real project.
