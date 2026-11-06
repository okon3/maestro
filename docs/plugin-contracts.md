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
    lib/usage.mjs                   usage probe and gate, pause flag, interruption marker (no git: hooks use it)
    lib/report.mjs                  final report of a subagent transcript, task report files
    lib/plugin.mjs                  running plugin version against the installed one (doctor)
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
| `.maestro/events.jsonl` | yes | event log, append only, `merge=union`; created empty by init |
| `.maestro/reports/<kind>/<id>.md` | yes | `task/<task-id>.md` (implementer report, written by `maestro measure` from the implementer's transcript), `qa/QA-n*.md` (PM requirements, explorer reports, triage), `review/CR-n.md` (reviewer). Init creates the folder with a `.gitkeep` |

`.gitattributes` (written by init): `.maestro/events.jsonl merge=union`, `backlog/** text=auto eol=lf` and `.maestro/** text=auto eol=lf` (LF in the working tree too, so Windows with `core.autocrlf` prints no LF/CRLF warnings on tracker and event commits; `text=auto` leaves binaries such as QA screenshots alone).
| `.maestro/runtime/` | no | usage cache (`usage.json`), pause flag (`pause.json`), interruption marker (`interrupted.json`), hook band state, misc runtime |
| `<git-common-dir>/maestro-locks/<task-id>/` | no | claim locks, shared by all worktrees |
| `.claude/worktrees/<name>/` | no | implementer worktrees (`impl-n`; `impl-fast` for a fast-lane fix: created with `--base <mainBranch>`); the architect's goal worktree (`goal-<G>`: created with `--checkout goal/<G>`; removed by the PM at GOAL close); detached QA and review snapshots (`qa-QA-n`, `cr-CR-n`); may hold links to main-checkout folders (`worktreeSetup`). The main checkout stays on the main branch, where the tracker is committed |
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

Event vocabulary: every type the plugin, its skills and its agents write. The list is `KNOWN_EVENT_TYPES` in `lib/events.mjs`; `maestro event` warns on stderr for any other type (a typo, or a type a skill added without registering it) and still logs it. A new type goes into this table and into that set in the same change.

| type | written by | data |
| --- | --- | --- |
| `task.status` | Backlog.md `onStatusChange` via `maestro event` (runs with `sh -c`; needs `sh` on PATH, checked by `maestro doctor`) | `{from, to}` (no title: shell quoting) |
| `task.claim` / `task.claim_denied` / `task.release` | `maestro claim` / `maestro release` | `{reason?}`; a denial by the usage gate adds `gate` (`top` or `paused`) |
| `task.measure` | `maestro measure` (the architect when a task or a batch is integrated; the PM for a fast-lane task), one per task | `{agentIds, usage, wallMs, ownerInterventions, reworkCycles, batch?}`: `batch` lists every task of a batch (one implementer, several tasks); each task's event carries the same `agentIds` and usage (and its own `reworkCycles`), and the dashboard splits a shared agent's usage evenly among the tasks that list it |
| `agent.start` / `agent.stop` | SubagentStart / SubagentStop hooks | `{agentType}`; stop adds `{usage}` (section 5) |
| `agent.bind` | PreToolUse hook (`secret-guard.mjs`) when a subagent runs `maestro claim <task> --actor <name>` | `{model?}`: the model id the subagent runs on (`message.model` of the last assistant line in the last 64 KB of its transcript, best effort; absent when unreadable). `agentId`, `actor`, `task` at top level |
| `agent.launch_denied` | PreToolUse hook `usage-gate.mjs` (`agentId` = the launching subagent, absent for the PM) | `{agentType, gate, reason}` |
| `session.compact` | PreCompact / SessionStart(compact) hooks | `{trigger, phase}` |
| `session.pause` | `maestro pause --on` (`{phase:"start", reason}`) and `--off` (`{phase:"off"}`); the pause skill logs `{phase:"done"}` through `maestro event` | see left |
| `session.resume` | resume skill, through `maestro event` | free-form |
| `context.band` | context hook, once per band crossing | `{percent, band}` |
| `usage.sample` | `maestro usage --probe`, and any usage gate that had to probe (`claim`, `usage --check`, the usage-gate hook) | `{fiveHour, sevenDay, resetsAt}` |
| `limit.hit` | StopFailure hook (no `agentId`: the dashboard reads it as session-wide) | `{error}` |
| `work.salvaged` | `maestro salvage`, one per worktree saved (`task` when the worktree had an active claim) | `{worktree, branch, commit, files}` |
| `maestro.init` | init skill, through `maestro event` | free-form |
| `goal.approved` | PM skill, when the owner approves a GOAL (opens the GOAL's cost window on the dashboard) | free-form; `goal` at top level |
| `goal.start` / `goal.done` | start-goal skill / PM skill at GOAL close | free-form; `goal` at top level |
| `fastlane.start` | PM skill, when it launches a fast-lane fix (decision-19) | `{approved}`; `task` at top level |
| `qa.start`, `qa.freeze`, `qa.done` | triage-qa skill | `{qa, tag?, areas?, defects?, unfrozen?}` |
| `review.start`, `review.done` | periodic-review skill | `{review, range?, violations?, debt?, suggestions?}` |
| `decision.recorded` | decision skill | `{id, title}` |
| `decision.ruling` | an implementer or the architect, through `maestro event ... --task <id> --actor <name>`, when it settles a minor (non-material) ambiguity itself | `{question, ruling}` |
| `learning.proposed` | planned (TASK-8.3): an agent proposing a playbook learning, curated by the PM at GOAL close | free-form |

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
- `lib/usage.mjs` (no git; imported by hooks):
  - `usageBands(config) -> {lower, top}`: first and last of the sorted `usageBands` (defaults when invalid).
  - `probeUsage(root, {timeout})`, `recordUsageSample(root, sample)` (writes `runtime/usage.json`, logs `usage.sample`), `readUsageSample(root)`. A sample is `{ts, fiveHour, sevenDay, resetsAt, sevenDayResetsAt}`; percentages 0-100, resets in Unix seconds.
  - `currentUsage(root, {maxAgeMs = USAGE_FRESH_MS (5 min), probe = true, timeout}) -> {sample, source, error}`: the runtime sample when younger than `maxAgeMs`, else a probe (recorded). If the probe fails, a stale sample still counts while its five-hour window has not reset (`source: "stale"`); otherwise `sample: null` (`source: "none"`).
  - `usageGate(root, config, opts) -> {allow, level, reason, sample, source, pause, note}`: `level` is `paused` (pause flag set; no probe), `top` (either window at or above the top band), `lower` (at or above the lower band), `ok`, or `unknown` (no sample: allowed, fail open, `note` says why). `allow` is false only for `paused` and `top`; `reason` names the window, its percentage, its reset time and the band.
  - Pause flag `runtime/pause.json` `{since, reason, actor}`: `readPause`, `setPause`, `clearPause`.
  - Interruption marker `runtime/interrupted.json` `{since, last, count, error, agentIds, agentTypes}`: `markInterrupted`, `readInterrupted`, `clearInterrupted`, `interruptedNotice(marker)` (the line shown to the PM), `isRateLimitError(error)`.

- `lib/report.mjs`: `finalReport(transcriptPath) -> {text, hasState} | null`, `writeTaskReport(root, {task, batch, agentIds, models, wallMs, reports, force}) -> {path, action}`, `formatDuration(ms)` (section 6, `maestro measure`).
- `lib/plugin.mjs`: `pluginVersionCheck({runningRoot, projectRoot, configDir}) -> {status, ...}` (never throws), `changedPluginFiles(fromRoot, toRoot)`, `claudeConfigDir()` (section 6, `maestro doctor`).

Test seams: `MAESTRO_<TOOL>_BIN` (executable, no shell) and `MAESTRO_<TOOL>_ARGS` (JSON array of leading args) for `BACKLOG` and `CLAUDE`; `MAESTRO_TEST_CONTEXT_MODULE` replaces `lib/context.mjs`; `MAESTRO_TEST_PLUGIN_ROOT` replaces the running plugin root and `CLAUDE_CONFIG_DIR` (Claude Code's own variable) the `~/.claude` folder for doctor's version check. Doctor is run by the CLI and skills, not by hooks (hooks stay fast).

Note: a parent directory may itself be a git repository (on the owner's PC the home folder is one). Hooks and commands therefore act only when `.maestro/config.json` exists at the discovered root.

## 6. `maestro` CLI

Exit code 0 on success, 1 on error, 2 on a refused operation (claim denied, failed check). `--json` prints machine output.

| Command | Behaviour |
| --- | --- |
| `maestro doctor` | checks git, node, `backlog --version` == config `backlogVersion`, `.maestro/config.json` validity; prints fixes (e.g. `npm i -g backlog.md@1.55.3`). Check `plugin-version` (a warning, never a failure): compares the plugin root of the running CLI (the version this session loaded; `bin/` is on PATH from the session start) with the `installPath` of `maestro@okon3` in `<CLAUDE_CONFIG_DIR or ~/.claude>/plugins/installed_plugins.json` (the project or local install for this project root, else the user install). `same`: OK. `differs` (an update installed mid-session): WARN, naming both versions and the `skills/` and `agents/` files added, removed or changed between the two cache folders `plugins/cache/okon3/maestro/<sha>/`, with the fix "`/reload-plugins` is the owner's command (agents cannot run it): ask the owner, or restart the session". `dev` (the CLI runs from a checkout, not from the cache) and `not-installed`: OK. A missing or unreadable registry or cache folder never makes doctor fail (`unknown`: WARN with the reason). `--json` adds `plugin: {status, running, installed, runningVersion, installedVersion, changes, note}` to the check |
| `maestro event <type> [--goal G] [--task T] [--actor A] [--data JSON]` | appends one event; a type outside the vocabulary (section 4) prints a warning on stderr and is still logged (exit 0) |
| `maestro claim <task> --actor <name>` | if the actor already holds the lock (`owner.json`), succeeds at once (`held: true`, no edit, no event, no gate: a resume after needs_context). Otherwise the **usage gate** (`usageGate`, probe timeout 60 s): during a pause or at or above the top usage band it refuses (exit 2, `task.claim_denied` with `gate`, a message naming the band, usage and reset time, and "do not retry"); unknown usage is allowed with a note on stderr. Then mkdir lock in `<git-common-dir>/maestro-locks/<task>`; checks status is `Ready` (or `To Do`) and no other assignee via `backlog task view --json`; then `backlog task edit <task> -a @<name> -s "In Progress"` in the main checkout; logs `task.claim` or `task.claim_denied` (exit 2) |
| `maestro release <task> --actor <name> [--status S]` | removes the lock, optional status edit, logs `task.release` |
| `maestro worktree <name> --goal <G> [--reuse]` | creates `.claude/worktrees/<name>` on branch `<name>` from `goal/<G>` (creates the goal branch from main, or from `origin/goal/<G>` when only the remote has it), then applies `worktreeSetup` (section 3); prints the path on stdout and setup warnings on stderr. Exit 2 when the path or branch exists; `--reuse` accepts an existing worktree on branch `<name>` and only re-links. `--json`: `{path, branch, base, setup: {linked, warnings, run}}` |
| `maestro worktree <name> --detach <ref> [--reuse]` | detached snapshot (QA `qa-QA-n`, code review `cr-CR-n`) at a tag or commit, with the same setup; exit 1 for an unknown ref |
| `maestro worktree <name> --checkout <branch> [--reuse]` | worktree on an **existing** branch, no new branch (the architect's goal worktree: `goal-<G> --checkout goal/<G>`), with the same setup. A branch only on the remote (`origin/<branch>`) is created locally to track it. Exit 1 for an unknown branch; exit 2 when the path exists (`--reuse` accepts a worktree already on that branch) or when another checkout holds the branch (the message names it) |
| `maestro worktree <name> --base <ref> [--reuse]` | new branch `<name>` from any ref (the fast lane: `impl-fast --base <mainBranch>`), with the same setup; exit 1 for an unknown ref, exit 2 when the path or branch exists (`--reuse` as for `--goal`). `--goal`, `--detach`, `--checkout` and `--base` exclude each other (exit 1) |
| `maestro worktree <name> --remove [--force]` | safe removal: (1) exit 1 when run from inside the worktree; (2) on Windows, probes the folder with a rename and back: if a process holds it (a dev or preview server, a watcher, a terminal whose cwd is inside), refuses with exit 2 **before anything is deleted** and names the likely cause; (3) unlinks, without following them, the configured `link` entries, the entries recorded in `maestro-links.json` and any untracked junction or symlink at the worktree's top level (a folder linked by hand); (4) runs `git worktree remove [--force]`. On failure it restores the links and exits 1 with git's error plus the likely cause (uncommitted or untracked files: use `--force`; a locked worktree; a process holding files). Never deletes recursively through a link. A worktree that does not exist is a no-op (exit 0). |
| `maestro context [--transcript P] [--json]` | context usage of a transcript (default: newest `.jsonl` under `~/.claude/projects/<cwd with non-alphanumerics as ->`) |
| `maestro usage [--probe \| --check] [--json]` | last usage sample; `--probe` runs `claude -p "Reply OK" --output-format stream-json --verbose --model haiku --no-session-persistence </dev/null` and records `usage.sample`; `--check` runs the usage gate (fresh sample or probe) and prints `<LEVEL>: <usage>; <action>` (`--json`: `{level, allow, lower, top, sample, source, reason}`), exit 0 for `ok`, `lower`, `unknown` and 2 for `top`, `paused`. The PM and the architect run it before every agent launch |
| `maestro pause [--on [--reason R] \| --off] [--actor A] [--json]` | `--on` writes `.maestro/runtime/pause.json` and logs `session.pause {phase:"start", reason}`; `--off` removes it and logs `session.pause {phase:"off"}`; no flag prints the state. While the flag exists, claims and `maestro:*` agent launches are refused. Runtime only: it does not travel with a clone |
| `maestro salvage [--reason R] [--actor A] [--json]` | for each implementer worktree `.claude/worktrees/impl-*` with uncommitted changes: `git add -A`, `git commit --no-verify -m "WIP <task>: salvaged ..."` on the worktree's own branch, then `git branch -f wip/<task> <commit>`; `<task>` is the task of the active claim whose actor is the worktree name, else the worktree name. An existing `wip/<task>` that is not an ancestor of the commit is never moved: the branch becomes `wip/<task>-<short sha>`. Runs git only inside those worktrees (main checkout untouched; other worktrees such as Claude Code's `agent-*` are ignored). Logs `work.salvaged` per worktree; clears the interruption marker when no worktree failed; exit 1 if one failed. Run it only when no agent is running |
| `maestro measure <task>[,<task>...] --agent-id <id>[,<id>] [--transcript P] [--goal G] [--actor A] [--interventions N] [--rework N \| --rework <task>=N[,<task>=N]] [--force] [--no-report]` | reads `<session>/subagents/agent-<id>.jsonl` next to the session transcript (same default as `context`) and sums the agents' usage. Writes one `task.measure` per task; with several tasks (a **batch**: one implementer did them all) each event has the same `agentIds` and usage plus `batch: [all tasks]`. `--rework N` sets `reworkCycles` of every task; `--rework TASK-a=1,TASK-b=0` sets it per task (a task not listed gets 0; a task outside the batch or a non-integer count is exit 1, nothing logged). Then saves the **task report** `.maestro/reports/task/<task>.md` for each task (unless `--no-report`): the implementer's final report from its transcript (the last assistant text, or SubagentHandback message, with a line starting `STATE:`, from that line on, without a closing code fence; with no `STATE:` line, the last assistant text and a warning), under a heading `# <task> <task title>` (`# <task> implementer report` when the tracker cannot say; the dashboard lists reports by their first line) and a line `Task: <task>   [Batch: <tasks> ...]   Agents: <ids>   Model: <models>   Wall time: <h m s>   Date: <YYYY-MM-DD>`. Several agent ids: the first agent's report, then `## Round <n> (agent <id>)` per further agent. An existing report is never overwritten without `--force`: the new report is appended as `## Round <n> (<date>)` with its own metadata line, or left as it is when the file already holds it. No report in the transcripts: a warning, the measure still counts (exit 0). `--json`: `{events, reports: [{task, path, action}]}` with `action` `created`, `appended`, `overwritten` or `unchanged`. Why `measure` and not a separate `report` command: the architect runs it at integration anyway, on the same transcripts, so the report can no longer be forgotten |
| `maestro status [--json]` | active GOAL: the tracker tasks labelled `goal` with status In Progress (`goal` = the first or null, `goals` = all); proposed GOALs (labels `goal` and `proposed`) listed apart as "awaiting approval" (`proposed: [{id, title, status}]`, left out of the tasks by status); tasks by status, claims (`owner.json` in the lock dir), last usage and context sample, `pause` (the flag or null) and `interrupted` (the marker or null); the text output starts with the interruption notice (run `maestro salvage`) and the pause line when present |

## 7. Hooks (plugin `hooks/hooks.json`)

| Event | Script | Behaviour |
| --- | --- | --- |
| PreToolUse (`Read\|Grep\|Bash\|PowerShell`) | `secret-guard.mjs` | subagents only (`agent_id` set; the main session is never blocked): denies with `hookSpecificOutput.permissionDecision: "deny"` and a reason when a target names a secret. Targets: `file_path`, `notebook_path`, `path`, `glob`, Glob's `pattern` (Grep's `pattern` is a content regex, not a path) and every word of a Bash/PowerShell `command`. Secret: file name `.env`, `.env.*` except `.env.example`, `*.pem`, `*.key`, `id_rsa*`, `id_ed25519*` (case-insensitive), or a path matching a config `secretPaths` glob (`**` spans directories; the glob may match any trailing part of the path, and a matched directory covers its contents). The matcher lists the tools that take a path or a command, instead of `*`, so other tools pay no node start-up. Fails open: an error logs and allows. |
| PreToolUse (`Agent\|Task`) | `usage-gate.mjs` | only for `tool_input.subagent_type` starting with `maestro:` (checked before the config lookup); main session and subagents alike. Denies (`permissionDecision: "deny"`) while the pause flag exists or at or above the top usage band, logs `agent.launch_denied`; the reason names the band, usage and reset time and tells a subagent to launch nothing more and report to the PM, the PM to use `maestro:pause`. Reads the runtime sample when younger than 5 minutes, else probes with a 20 s timeout (hook timeout 30 s). No git. Unknown usage allows (fail open) |
| SessionStart (startup, resume, clear, compact) | `session-start.mjs` | injects one line saying the session is the Maestro PM (plus a pointer to the handoff on startup); on `compact`/`clear`/`resume` injects `.maestro/handoff.md` (max 9,000 chars) as `additionalContext`. On every source it adds the interruption notice (the marker exists: run `maestro salvage` once no agent runs, then `maestro:resume`) and the pause line (the flag exists) |
| UserPromptSubmit, PostToolUse (`Agent\|Task` only: subagent results are the large context jumps; fewer processes per turn) | `context-watch.mjs` | main session only (skip when `agent_id` set); computes context %; on first crossing of each band per session injects one warning with the action to take; logs `context.band`; also writes `.maestro/runtime/context.json` and adds or updates the session in `.maestro/runtime/pm-sessions.json` (dashboard inputs) |
| PreCompact | `pre-compact.mjs` | prints preservation instructions (state lives in files; keep IDs of running agents, open decisions, next action) |
| SubagentStart / SubagentStop | `agent-events.mjs` | logs `agent.start` / `agent.stop` with usage from `agent_transcript_path` |
| StopFailure | `stop-failure.mjs` | logs `limit.hit`; when the error is a rate limit (`/rate[\s_-]?limit/i`), writes or extends the interruption marker `.maestro/runtime/interrupted.json` |

`hooks/hooks.json` wraps events in a top-level `"hooks"` key and uses the exec form so it works in Git Bash and PowerShell alike: `{"type":"command","command":"node","args":["${CLAUDE_PLUGIN_ROOT}/scripts/hooks/<name>.mjs"],"timeout":30}`. Hook input arrives as JSON on stdin; output is one JSON object on stdout (`hookSpecificOutput.hookEventName` is required when `additionalContext` is used). Shape reference: `research/plugin-format-reference.md` section 4.

Hooks must never block the session (the secret guard's deny is a JSON decision on one tool call, not an error): catch every error, exit 0, and write diagnostics to `.maestro/runtime/hook-errors.log`. Only act when the project has `.maestro/config.json` (Maestro not initialized → no-op).

## 8. Tests

`node --test` run from `plugins/maestro` must pass (a directory argument does not work on Node 24) on Windows (Git Bash and PowerShell). Tests use temporary git repos and a fake `backlog` executable where needed; they never touch the real project.
