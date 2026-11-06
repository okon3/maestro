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
    lib/worktree.mjs                worktree setup (links, setup command) and safe removal
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
| `.maestro/reports/<kind>/<id>.md` | yes | `task/<task-id>.md` (implementer report, saved by the architect at integration), `qa/QA-n*.md` (PM requirements and QA reports), `review/CR-n.md` (reviewer) |
| `.maestro/runtime/` | no | usage cache, hook band state, misc runtime |
| `<git-common-dir>/maestro-locks/<task-id>/` | no | claim locks, shared by all worktrees |
| `.claude/worktrees/<name>/` | no | implementer worktrees (`impl-n`); detached QA and review snapshots (`qa-QA-n`, `cr-CR-n`); may hold links to main-checkout folders (`worktreeSetup`) |
| `<git-common-dir>/worktrees/<name>/maestro-links.json` | no | folders linked by the worktree setup, read by `--remove`; git deletes it with the worktree |
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
  "language": "it",
  "worktreeSetup": { "link": [], "run": null }
}
```

All keys are optional; `lib/config.mjs` merges the file over these defaults. Optional `secretPaths` (array of globs, default `[]`) lists extra project files that subagents must not touch (section 7, `secret-guard.mjs`); a missing or invalid value counts as `[]`.

`worktreeSetup` is the post-create step of `maestro worktree` (implementer worktrees and detached snapshots):

- `link`: folders of the main checkout, as paths relative to the project root (no `..`, not absolute, not `.git`), linked into each new worktree at the same path when they exist in the main checkout: a directory **junction** on Windows (no admin rights or developer mode needed), a directory symlink elsewhere. Typical value: `["node_modules"]`; a monorepo can also list `apps/web/node_modules`. A missing source, a source that is not a folder, or a path that already exists in the worktree is skipped with a warning. After linking, the command checks with `git status` that the link is ignored in the worktree and warns otherwise (on Linux and macOS a link is a file for git, so the ignore line needs no trailing slash: `node_modules`, not `node_modules/`).
- `run`: optional shell command run in the new worktree after linking (cwd = worktree; env `MAESTRO_MAIN_CHECKOUT`, `MAESTRO_WORKTREE`; output on stderr; 30 minute timeout), for projects that need an install or a generation step instead of a link. A non-zero exit leaves the worktree in place and makes the command exit 1. `--reuse` re-links but never re-runs it.

Sharing `node_modules` is safe because implementers never change package manifests or lockfiles (shared files outside their scope: a needed dependency goes back to the architect) and never run an install in their worktree, which would write through the link into the main checkout. `maestro init` proposes `{"link": ["node_modules"], "run": null}` when the project has `node_modules` or a Node lockfile (`package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `bun.lockb`): in the created config, or as an `update` line for an existing config without the key. An existing `worktreeSetup`, even an empty one, is never changed. An invalid `worktreeSetup` makes `maestro worktree` exit 1.

The project root is the git top level of the main worktree (`git rev-parse --path-format=absolute --git-common-dir`, parent dir), so commands run from a worktree read and write the main checkout's `.maestro/`.

## 4. Event log: `.maestro/events.jsonl`

One JSON object per line, UTF-8, LF, written with a single `appendFileSync` call per event (one line < 4 KB is atomic enough on local disks).

```json
{"ts":"2026-11-06T15:04:05.123Z","type":"task.claim","actor":"impl-1","goal":"TASK-3","task":"TASK-3.2","data":{}}
```

Required: `ts` (ISO UTC), `type`. Optional: `actor` (role name such as `pm`, `architect`, `impl-1`, `qa`, `reviewer`, or `hook`), `agentId`, `goal`, `task`, `data` (object).

Event types (wave 1):

| type | written by | data |
| --- | --- | --- |
| `task.status` | Backlog.md `onStatusChange` via `maestro event` (runs with `sh -c`; needs `sh` on PATH, checked by `maestro doctor`) | `{from, to}` (no title: shell quoting) |
| `task.claim` / `task.claim_denied` / `task.release` | `maestro claim` / `maestro release` | `{reason?}` |
| `agent.start` / `agent.stop` | SubagentStart / SubagentStop hooks | `{agentType}`; stop adds `{usage}` (section 5) |
| `agent.bind` | PreToolUse hook (`secret-guard.mjs`) when a subagent runs `maestro claim <task> --actor <name>` | `{model?}`: the model id the subagent runs on (`message.model` of the last assistant line in the last 64 KB of its transcript, best effort; absent when unreadable). `agentId`, `actor`, `task` at top level |
| `task.measure` | `maestro measure` (architect, when a task is integrated) | `{agentIds, usage, wallMs, ownerInterventions, reworkCycles}` |
| `session.compact` | PreCompact / SessionStart(compact) hooks | `{trigger, phase}` |
| `limit.hit` | StopFailure hook | `{error}` |
| `usage.sample` | `maestro usage --probe` | `{fiveHour, sevenDay, resetsAt}` |
| `context.band` | context hook, once per band crossing | `{percent, band}` |
| `goal.start`, `goal.done`, `session.pause`, `session.resume`, `maestro.init` | PM skills, through `maestro event` | free-form |
| `qa.start`, `qa.freeze`, `qa.done`, `review.start`, `review.done`, `decision.recorded` | PM skills, through `maestro event` | free-form |
| `decision.ruling` | an implementer or the architect, through `maestro event ... --task <id> --actor <name>`, when it settles a minor (non-material) ambiguity itself | `{question, ruling}` |

## 5. Usage record (measurement, decision-17)

```json
{"models":{"claude-sonnet-5-5":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0}},"wallMs":0}
```

Computed from a transcript JSONL: sum of `message.usage` over `type:"assistant"` lines (deduplicated by `message.id`, since streamed messages repeat usage), grouped by `message.model`, skipping `<synthetic>`; `wallMs` = last minus first `timestamp`.

### Module API shared by CLI and hooks

- `lib/config.mjs`: `findProjectRoot(cwd)`, `gitCommonDir(cwd)`, `loadConfig(cwd) -> {root, config, initialized}` (done).
- `lib/events.mjs`: `appendEvent(root, type, fields)`, `readEvents(root)`, `makeEvent(type, fields, now)` (done).
- `lib/worktree.mjs`: `normalizeSetup(value) -> {link, run}` (throws on bad shapes), `applySetup(root, path, setup, {runCommand}) -> {linked, warnings, run}`, `removeLinks(path, configured) -> [{entry, target}]`, `restoreLinks(path, removed)`, `worktreeBusy(path) -> code|null` (Windows only), `explainRemoveFailure(message, name)`.
- `lib/context.mjs` (owned by the hooks task):
  - `contextUsage(transcriptPath, {window}) -> {model, contextTokens, window, percent, postCompactNoUsageYet, preCompactTokens}`: last main-chain assistant message (skip `isSidechain:true` and model `<synthetic>`), `input + cache_read + cache_creation`; reads the file backwards in 256 KB chunks; after a `compact_boundary` with no later assistant message returns `postCompactNoUsageYet:true`.
  - `usageSummary(transcriptPath, {from, to} = {}) -> {models, wallMs}` (section 5). With `from` / `to` (ISO strings or ms), only assistant messages whose `timestamp` is in `[from, to)` count and `wallMs` is the span of those messages; the dashboard uses it to cost the PM session inside a GOAL window.
  - `subagentTranscriptPath(sessionTranscriptPath, agentId)`: `<dir>/<sessionId>/subagents/agent-<agentId>.jsonl`.

Test seams: `MAESTRO_<TOOL>_BIN` (executable, no shell) and `MAESTRO_<TOOL>_ARGS` (JSON array of leading args) for `BACKLOG` and `CLAUDE`; `MAESTRO_TEST_CONTEXT_MODULE` replaces `lib/context.mjs`. Doctor is run by the CLI and skills, not by hooks (hooks stay fast).

Note: a parent directory may itself be a git repository (on the owner's PC the home folder is one). Hooks and commands therefore act only when `.maestro/config.json` exists at the discovered root.

## 6. `maestro` CLI

Exit code 0 on success, 1 on error, 2 on a refused operation (claim denied, failed check). `--json` prints machine output.

| Command | Behaviour |
| --- | --- |
| `maestro doctor` | checks git, node, `backlog --version` == config `backlogVersion`, `.maestro/config.json` validity; prints fixes (e.g. `npm i -g backlog.md@1.55.3`) |
| `maestro event <type> [--goal G] [--task T] [--actor A] [--data JSON]` | appends one event |
| `maestro claim <task> --actor <name>` | mkdir lock in `<git-common-dir>/maestro-locks/<task>`; checks status is `Ready` (or `To Do`) and no other assignee via `backlog task view --json`; then `backlog task edit <task> -a @<name> -s "In Progress"` in the main checkout; logs `task.claim` or `task.claim_denied` (exit 2) |
| `maestro release <task> --actor <name> [--status S]` | removes the lock, optional status edit, logs `task.release` |
| `maestro worktree <name> --goal <G> [--reuse]` | creates `.claude/worktrees/<name>` on branch `<name>` from `goal/<G>` (creates the goal branch from main, or from `origin/goal/<G>` when only the remote has it), then applies `worktreeSetup` (section 3); prints the path on stdout and setup warnings on stderr. Exit 2 when the path or branch exists; `--reuse` accepts an existing worktree on branch `<name>` and only re-links. `--json`: `{path, branch, base, setup: {linked, warnings, run}}` |
| `maestro worktree <name> --detach <ref> [--reuse]` | detached snapshot (QA `qa-QA-n`, code review `cr-CR-n`) at a tag or commit, with the same setup; exit 1 for an unknown ref |
| `maestro worktree <name> --remove [--force]` | safe removal: (1) exit 1 when run from inside the worktree; (2) on Windows, probes the folder with a rename and back: if a process holds it (a dev or preview server, a watcher, a terminal whose cwd is inside), refuses with exit 2 **before anything is deleted** and names the likely cause; (3) unlinks, without following them, the configured `link` entries, the entries recorded in `maestro-links.json` and any untracked junction or symlink at the worktree's top level (a folder linked by hand); (4) runs `git worktree remove [--force]`. On failure it restores the links and exits 1 with git's error plus the likely cause (uncommitted or untracked files: use `--force`; a locked worktree; a process holding files). Never deletes recursively through a link. A worktree that does not exist is a no-op (exit 0). |
| `maestro context [--transcript P] [--json]` | context usage of a transcript (default: newest `.jsonl` under `~/.claude/projects/<cwd with non-alphanumerics as ->`) |
| `maestro usage [--probe] [--json]` | last usage sample; `--probe` runs `claude -p "Reply OK" --output-format stream-json --verbose --model haiku --no-session-persistence </dev/null` and records `usage.sample` |
| `maestro measure <task> --agent-id <id>[,<id>] [--transcript P] [--goal G] [--actor A] [--interventions N] [--rework N]` | reads `<session>/subagents/agent-<id>.jsonl` next to the session transcript (same default as `context`), writes `task.measure` |
| `maestro status [--json]` | active GOAL (goal of the latest event that has one), tasks by status, claims (`owner.json` in the lock dir), last usage and context sample |

## 7. Hooks (plugin `hooks/hooks.json`)

| Event | Script | Behaviour |
| --- | --- | --- |
| PreToolUse (`Read\|Grep\|Bash\|PowerShell`) | `secret-guard.mjs` | subagents only (`agent_id` set; the main session is never blocked): denies with `hookSpecificOutput.permissionDecision: "deny"` and a reason when a target names a secret. Targets: `file_path`, `notebook_path`, `path`, `glob`, Glob's `pattern` (Grep's `pattern` is a content regex, not a path) and every word of a Bash/PowerShell `command`. Secret: file name `.env`, `.env.*` except `.env.example`, `*.pem`, `*.key`, `id_rsa*`, `id_ed25519*` (case-insensitive), or a path matching a config `secretPaths` glob (`**` spans directories; the glob may match any trailing part of the path, and a matched directory covers its contents). The matcher lists the tools that take a path or a command, instead of `*`, so other tools pay no node start-up. Fails open: an error logs and allows. |
| SessionStart (startup, resume, clear, compact) | `session-start.mjs` | injects one line saying the session is the Maestro PM (plus a pointer to the handoff on startup); on `compact`/`clear`/`resume` injects `.maestro/handoff.md` (max 9,000 chars) as `additionalContext` |
| UserPromptSubmit, PostToolUse (`Agent\|Task` only: subagent results are the large context jumps; fewer processes per turn) | `context-watch.mjs` | main session only (skip when `agent_id` set); computes context %; on first crossing of each band per session injects one warning with the action to take; logs `context.band`; also writes `.maestro/runtime/context.json` and adds or updates the session in `.maestro/runtime/pm-sessions.json` (dashboard inputs) |
| PreCompact | `pre-compact.mjs` | prints preservation instructions (state lives in files; keep IDs of running agents, open decisions, next action) |
| SubagentStart / SubagentStop | `agent-events.mjs` | logs `agent.start` / `agent.stop` with usage from `agent_transcript_path` |
| StopFailure | `stop-failure.mjs` | logs `limit.hit` |

`hooks/hooks.json` wraps events in a top-level `"hooks"` key and uses the exec form so it works in Git Bash and PowerShell alike: `{"type":"command","command":"node","args":["${CLAUDE_PLUGIN_ROOT}/scripts/hooks/<name>.mjs"],"timeout":30}`. Hook input arrives as JSON on stdin; output is one JSON object on stdout (`hookSpecificOutput.hookEventName` is required when `additionalContext` is used). Shape reference: `research/plugin-format-reference.md` section 4.

Hooks must never block the session (the secret guard's deny is a JSON decision on one tool call, not an error): catch every error, exit 0, and write diagnostics to `.maestro/runtime/hook-errors.log`. Only act when the project has `.maestro/config.json` (Maestro not initialized → no-op).

## 8. Tests

`node --test` run from `plugins/maestro` must pass (a directory argument does not work on Node 24) on Windows (Git Bash and PowerShell). Tests use temporary git repos and a fake `backlog` executable where needed; they never touch the real project.
