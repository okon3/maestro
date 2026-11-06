# Claude Code capabilities relevant to Maestro

Research date: 2026-11-06. Source: official docs, fetched live. Docs now live at `https://code.claude.com/docs/en/<page>` (the `.md` suffix returns the markdown version; index at `https://code.claude.com/docs/llms.txt`). The `docs.anthropic.com/en/docs/claude-code` location was NOT checked (assumed to redirect; unverified).
Versions seen in docs go up to about v2.1.317. Every doc statement below is "VERIFIED" unless marked AMBIGUOUS or NOT FOUND. The GitHub CHANGELOG was NOT fetched (the docs already carry per-feature version notes, quoted where relevant).

Legend: VERIFIED = quoted/paraphrased from the page cited. AMBIGUOUS = doc incomplete/contradictory or I only saw a truncated part. NOT FOUND = could not locate.

---

## 1. Subagents

Source: https://code.claude.com/docs/en/sub-agents (page was 116k chars; I read the first 100k plus the tail from 100k).

### Nesting / depth
VERIFIED. "By default, a subagent can spawn subagents of its own, up to three layers below the main conversation. At the depth limit, Claude Code withholds the `Agent` tool from every subagent except a fork."
- Env `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` (default 3, "set `1` to turn nesting off", requires v2.1.217+; v2.1.217-218 default was 1, v2.1.219 raised to 3). Source: https://code.claude.com/docs/en/env-vars.md
- To stop one subagent spawning: omit `Agent` from its `tools` or add to `disallowedTools`.
- Concurrency cap: "when 20 subagents are running in a session, spawning another ... fails with `Concurrent subagent limit reached`" (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`, default 20).
- A fork "can't spawn further forks".
- Headless: `--forward-subagent-text` shows nested subagent messages at every depth (headless page).

### Definition format (`.claude/agents/*.md`, YAML frontmatter + Markdown body as system prompt)
Only `name` and `description` required; camelCase; "unrecognized fields are ignored without an error".

| Field | Doc description |
|---|---|
| `name` | unique id, up to 256 chars, no `:`; filename need not match |
| `description` | when Claude should delegate |
| `tools` | comma string or YAML list; inherits all subagent-available tools if omitted |
| `disallowedTools` | removed from inherited/specified list. `Bash(git push *)` still removes the whole tool |
| `model` | `sonnet`, `opus`, `haiku`, `fable`, full model ID, or `inherit` |
| `permissionMode` | `default`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, `plan`, `manual`. "Ignored for plugin subagents" |
| `maxTurns` | max agentic turns; output marked partial, "Claude can resume it" |
| `autoCompactWindow` | 100000..1000000 tokens (needs v2.1.296+; write plain integer, `200k` is read as 200) |
| `skills` | skills whose full content is injected at startup |
| `mcpServers` | name ref or inline def. Ignored for plugin subagents |
| `hooks` | lifecycle hooks scoped to this subagent. Ignored for plugin subagents |
| `memory` | persistent memory scope: `user`, `project`, `local` |
| `background` | `true` keeps subagent in background even when Claude asks to wait |
| `omitClaudeMd` | start without user/project/local CLAUDE.md (v2.1.271+) |
| `effort` | `low`,`medium`,`high`,`xhigh`,`max`. "Overrides the session effort level, but not `CLAUDE_CODE_EFFORT_LEVEL`." |
| `isolation` | `worktree` = run in temporary git worktree |
| `color` | red, blue, green, yellow, purple, orange, pink, cyan |
| `initialPrompt` | auto-submitted first user turn when the agent runs as the main session (`--agent` / `agent` setting) |
| `experimental` | map; `cacheTtl` `5m`/`1h` |

Answer to "can `effort` be set per agent?": YES (frontmatter `effort`). model-config page: "On the main conversation's model, a subagent or teammate with no `effort` of its own runs at the level you pick in the session ... On another model, that level doesn't apply. To pick a subagent's level, set `effort` in its definition." (https://code.claude.com/docs/en/model-config.md). `CLAUDE_CODE_EFFORT_LEVEL` env overrides everything (takes precedence over `--effort`, `/effort`, settings). Hook input also carries `effort.level`.
Model override env: `CLAUDE_CODE_SUBAGENT_MODEL`, `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` (v2.1.257+) forces one model onto all subagents/teammates.

Other behaviours: subagents can be invoked via @-mention, `--agent`/`agent` setting runs a whole session as the agent; project agents in `.claude/agents/`, user in `~/.claude/agents/`, `--agents <json>` on CLI, plugin `agents/`. (Scope list partly seen; priority order NOT verified.) A subagent given `SubagentHandback` tool delivers its report through it (v2.1.271+); this tool is the one in my own tool list.

### Resume / continue
VERIFIED. "Each subagent invocation creates a new instance rather than continuing an earlier one." To continue: "Claude uses the `SendMessage` tool with the agent's ID or name as the `to` field to resume it." `SendMessage` doesn't require agent teams. "Resumed subagents retain their full conversation history." Built-in Explore and Plan are one-shot, return no agent ID, cannot be resumed. A subagent you stopped yourself does not auto-resume. Transcripts: `~/.claude/projects/{project}/{sessionId}/subagents/agent-{agentId}.jsonl` (+ `agent-{agentId}.meta.json` for name->ID). Names Claude gave survive a restart only if given since the last compaction (v2.1.299+); otherwise use agent ID.
Subagents named by Claude "can also message each other" (agent-teams comparison table).

### Background / foreground
"With nothing configured, a subagent that Claude spawns from your main conversation starts in the background." Background subagents have a smaller built-in toolset, surface every permission prompt in the main session, results come as a completion notification in a later turn. `CLAUDE_CODE_FORK_SUBAGENT=0` lets Claude wait in interactive sessions. Fork mode (a subagent inheriting the full conversation, shared prompt cache) is on by default from v2.1.302 (interactive terminal from v2.1.232).

Auto-compaction applies to subagents too; `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` applies to them.

### Background agents launched by a subagent (lab, 2026-11-06)
VERIFIED in `E:\Projects\maestro-labg-nesting-2` (Haiku, `claude -p`, stream-json): a background `lead` subagent launched two `worker` subagents with `run_in_background: true` and was told to wait for both notifications. It cannot wait: it ended its turn and completed, and both workers' completion notifications went to the **main session**, not to the lead. A subagent that needs its children's results must launch them in the **foreground** (the earlier `bg-nesting` test: a foreground worker inside a background lead returns to the lead). Consequence: an architect subagent waits for all implementers launched in the same message before it can review any of them.

### Implication for Maestro (my reading, not doc)
Depth 3 nesting is allowed by default, so a PM could delegate to an architect that delegates to implementers; the architect/implementers' reports return to their caller. Subagent output is a summary to the caller only (not a shared channel) unless they are named and use SendMessage.

---

## 2. Agent teams (experimental)

Source: https://code.claude.com/docs/en/agent-teams

- Exists. "Agent teams are experimental and disabled by default." Enable `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (env or `settings.json` `env`). "Without that variable, no team is set up at session start, no team directories are written."
- Model: "One session acts as the team lead, coordinating work, assigning tasks, and synthesizing results. Teammates work independently, each in its own context window, and communicate directly with each other. You can also talk to any teammate directly without going through the lead."
- Direct teammate-to-teammate messaging: YES. "The lead assigns every teammate a name when it spawns them, and any teammate can message any other by that name." No broadcast: "To reach everyone, send one message per recipient."
- Shared task list: YES. "Tasks have three states: pending, in progress, and completed. A task can also depend on other tasks and shows as blocked ... Teammates don't self-claim a blocked task, but you or the lead can still assign it." "Task claiming uses file locking to prevent race conditions." "Claude Code manages task dependencies automatically: when a teammate completes a task that other tasks depend on, it unblocks the dependent tasks." Self-claim: "after finishing a task, a teammate picks up the next unassigned, unblocked task on its own". Tools: `TaskCreate`, `TaskGet`, `TaskList`, `TaskUpdate` (added automatically to teammates). Agents without Task tools coordinate by messages only.
- Mailbox: "Each agent's mailbox is a JSON file at `~/.claude/teams/{team-name}/inboxes/{agent-name}.json`." Structured protocol messages exist: plan approval, shutdown request.
- Disk state: team config `~/.claude/teams/{team-name}/config.json` (removed at session end; contains `members` with name + agent ID + agent type; do not hand-edit; "There is no project-level equivalent"). Task list `~/.claude/tasks/{team-name}/` (stays after session; retention by `cleanupPeriodDays`). `{team-name}` = `session-` + first 8 chars of session ID. A task list can be shared across ordinary sessions with `CLAUDE_CODE_TASK_LIST_ID=my-project claude` -> `~/.claude/tasks/my-project/` (interactive-mode page; env-vars page: "Set the same ID in multiple Claude Code instances to coordinate on a shared task list").
- Display modes: `teammateMode` setting / `--teammate-mode`: `"in-process"` (default), `"auto"`, `"tmux"`, `"iterm2"`. In-process: agent panel with arrow keys/Enter to view and message a teammate, `x` to stop, Ctrl+T toggles task list. Split panes need tmux or iTerm2+`it2`; "not supported in VS Code's integrated terminal, Windows Terminal, or Ghostty" (relevant: the user is on Windows -> in-process only).
- Spawning: Claude calls the Agent tool with a `name` while teams are enabled; "Claude Code doesn't ask you to confirm the launch". With teams enabled, any named subagent launches as a teammate. Teammates can be spawned from subagent definitions (`tools`, `model`, `disallowedTools`, `effort`, `autoCompactWindow`, body apply; `skills` and (for in-process) `mcpServers` are NOT applied; `permissionMode` not applied, see below).
- Interactive only: "In non-interactive mode with the `-p` flag, including Agent SDK sessions, Claude doesn't spawn teammates".
- Limits/limitations (quoted list): no session resumption with in-process teammates (`/resume`, `/rewind`); task status can lag (teammates sometimes fail to mark completed, blocking dependents); slow shutdown; "One team per session"; "No nested teams: teammates cannot spawn their own teammates" (so no depth); in-process teammate's subagents run foreground only; lead fixed for the session; "No per-teammate permission modes at spawn" (teammates start with the lead's mode; in-process teammates follow lead's acceptEdits/auto/bypass); no hard cap on teammate count, doc recommends 3-5; "isolation" in a subagent definition does not isolate a teammate (it runs in the main session's working directory); two teammates editing the same file overwrite each other, so split ownership by file.
- Model selection order and effort: teammate on lead's model inherits lead effort; definition `effort` applies for in-process teammates.
- Hooks: `TeammateIdle` (exit 2 = send feedback and keep working; JSON `continue:false` stops teammate; input `teammate_name`, `team_name` (deprecated), `agent_id` v2.1.290+), `TaskCreated` (input `task_id`, `task_subject`, `task_description?`, `teammate_name?`, `team_name?`; exit 2 or `{"decision":"block","reason":...}` prevents creation), `TaskCompleted` (same fields; exit 2 prevents completion). https://code.claude.com/docs/en/hooks
- Cost: "Agent teams use approximately 7x more tokens than standard sessions when teammates run in plan mode"; doc suggests Sonnet for teammates (costs page).
- Security: SendMessage between agents is flagged "from another Claude session, not from you"; a message can never grant permission/consent.

---

## 3. Plugins and "mods"

Sources: https://code.claude.com/docs/en/plugins-reference (manifest page, `plugins/manifest-reference.md`), `plugins/install.md`, `plugins/loading.md`, `plugin-marketplaces` (`plugins/create-marketplace.md`), `plugins/mods/overview.md`.

### What a plugin packages
Manifest `plugin.json` fields cover: skills, commands, agents, hooks, mcpServers, lspServers, outputStyles, workflows, `experimental.themes`, `experimental.monitors`, `experimental.evals`, `settings` (only `agent` and `subagentStatusLine` take effect), `userConfig`, `channels`, `dependencies`, `types` (.d.ts for mods). Also `bin/` (executables put on the Bash tool's PATH while enabled) and a mods hooks module. A statusline: only `settings.subagentStatusLine`/`agent` defaults; a general main `statusLine` is NOT listed as packageable (NOT FOUND for main status line).
Plugin subagents: `hooks`, `mcpServers`, `permissionMode` frontmatter are ignored.
### Layout
```
plugin/
  .claude-plugin/plugin.json   (only required key: name; manifest itself optional)
  skills/<name>/SKILL.md  commands/  agents/  hooks/hooks.json  .mcp.json  .lsp.json
  output-styles/  themes/  workflows/  monitors/monitors.json  bin/  scripts/  settings.json
```
Everything except `plugin.json` goes at plugin root, not inside `.claude-plugin/`. Components are namespaced `plugin-name:component` (e.g. agent `deploy-tools:reviewer`). A root `CLAUDE.md` in a plugin is NOT loaded.
Name restriction: `claude plugin validate` errors if name starts with `claude-`, `anthropic-`, `cc-plugin-` etc. (so "claude-maestro" is rejected; "maestro" is fine).
Validate: `claude plugin validate ./path`.

### Scripts and `${CLAUDE_PLUGIN_ROOT}`
YES. `${CLAUDE_PLUGIN_ROOT}` = absolute path of the installed version; `${CLAUDE_PLUGIN_DATA}` = `~/.claude/plugins/data/<id>/` persisted across updates; `${CLAUDE_PROJECT_DIR}`. Resolved in hook commands/args, MCP stdio `command/args/env`, LSP, monitors, and inline in skill/agent/command Markdown. Example in docs: MCP server `{"command":"node","args":["${CLAUDE_PLUGIN_ROOT}/server.js"]}`. Variables are NOT in the env of commands Claude runs through the Bash tool (use `bin/` on PATH or write the path via skill content substitution). `${CLAUDE_PLUGIN_ROOT}` changes on every plugin update, so keep state in `${CLAUDE_PLUGIN_DATA}`.
Node deps: on copy into cache Claude Code runs a locked install of `package.json` deps only if a lockfile (`bun.lock`, `npm-shrinkwrap.json`, `package-lock.json` v2/3) is present; no lifecycle scripts, registry packages only, 60 s timeout; otherwise install from a hook into `${CLAUDE_PLUGIN_DATA}`.
So a plugin can ship a Node dashboard server and launch it via an MCP stdio server entry, a hook, a `bin/` executable, or a `monitors/` entry (monitor = persistent background shell command; project-scope plugins' monitors do NOT load; not started with `-p`).

### Marketplaces
`.claude-plugin/marketplace.json` requires `name`, `owner`, `plugins[]` (each `name` + `source`). Sources: relative path (`./plugins/x`), `github`, `url`, `git-subdir`, `archive`, `npm`, `command`. A marketplace can be a local directory: `claude plugin marketplace add ./my-marketplace`; for a locally-added marketplace with relative-path plugins "the plugin loads in place ... Your edits take effect at the next session start or `/reload-plugins`, and you don't need to increase the version". Also git: `owner/repo[#ref]`, any git URL, hosted `marketplace.json` URL. Entry name must equal manifest name.

### Project enable/install
- Scopes: user (`~/.claude/settings.json`), project (`.claude/settings.json`, committed), local (`.claude/settings.local.json`).
- Project `.claude/settings.json` holds `enabledPlugins` (`"name@marketplace": true`) and `extraKnownMarketplaces` (registers marketplaces for the repo; the settings reference lists "Register marketplaces for a repository or an organization"; exact JSON shape NOT captured - see https://code.claude.com/docs/en/settings#extraknownmarketplaces). "A `.claude/plugins/` directory in a project is not scanned."
- Caveats: "Committing that entry turns the plugin on for your collaborators but doesn't download it to their machines, so each collaborator also runs `claude plugin install <name>@<marketplace> --scope project` once" - EXCEPT when the marketplace entry has a relative-path source (loads from the marketplace itself, "needs no install record") or a seed dir holds it. Repo plugins load only after workspace trust; marketplaces listed in `extraKnownMarketplaces` need the trust dialog (cloud sessions don't). Project-scope plugins: MCP servers need per-server approval; monitors don't load. Project-scoped plugins also load in worktrees of the repo.
- Skills-dir plugin alternative: a folder with `.claude-plugin/plugin.json` under project `.claude/skills/` loads as `<name>@skills-dir` (primary working dir only; trust required; blocked by some managed settings).
- Session-only: `--plugin-dir <path>` / `--plugin-url` / env `CLAUDE_CODE_PLUGIN_DIRS`; loads in place, never copied.

### Updates
- Version = manifest `version`, else marketplace entry `version`, else commit SHA (12 chars) for github/url/git-subdir and relative-path-in-git marketplace; `unknown` for npm/non-git local. A pinned manifest `version` freezes users until the string changes. Cached under `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`; old versions deleted 14 days after update.
- Auto-update: default ON only for official Anthropic marketplaces and claude.ai-added ones; OFF for any custom/local marketplace unless `autoUpdate` set on the `extraKnownMarketplaces` entry or toggled in `/plugin` > Marketplaces. When on: after the first message, random delay up to 10 min, then refresh; running session keeps loaded version, prompt "Run /reload-plugins to apply". Manual: `claude plugin update <plugin>@<marketplace>`, `/plugin` "Update marketplace". `claude plugin marketplace update` alone refreshes listings only.

### "Mods" - VERIFIED and exists
https://code.claude.com/docs/en/plugins/mods/overview.md : "A mod is a plugin that changes how Claude Code looks and behaves. It's made of JavaScript or TypeScript event handlers: Claude Code calls one when an event happens, such as a tool call, a submitted prompt, or a part of the interface being drawn, and the handler can watch the event, change it, or take it over."
- Capabilities: draw a pane beside the transcript or a band above the prompt (tabs, buttons, text fields); redraw built-in UI (tool call rows, spinner, dialogs); intercept/rewrite/answer tool calls and requests (even route a request to another model); add `/commands` running your function with no Claude turn; share state between handlers; call a model; timers, files, processes, network.
- Packaging: a plugin with `.claude-plugin/plugin.json`, `hooks/hooks.json` pointing at a hooks module (e.g. `hooks/register.js`) exporting `register(on)`; handlers like `on('tool.call', async ($, e, next) => ...)`, `on('ui.render', {component:'Spinner'}, ...)`, `$.ui.invalidate(...)`. Docs: mods/create, interface, events, api, reference, test, troubleshoot, admin. Installed like any plugin (`/plugin install x@marketplace`).
- Requires Claude Code v2.1.287+ (terminal), Desktop v2.1.286+, VS Code ext 2.1.299+. On by default. "Mods aren't sandboxed" and run with user permissions. Built-in examples: `/diff`, `AGENTS.md` loader. Samples: `anthropics/claude-code-playground/claude-code/mods` (`token-weather` draws a context-window forecast above the prompt; `blast-radius`; `replay-theater`) - a mod can "read each request's token usage" and chart it.
- Where they run: hooks run in `claude -p`/SDK too; drawing appears only in terminal, Desktop (not WSL sessions), VS Code panel; NOT in `-p`, cloud sessions.
- Turn off: `--safe-mode`, `disableAllHooks`, disable plugin; org control `allowManagedModsOnly`.
- Relevance: a mod is the only documented way to get an in-TUI dashboard pane (and a way to read per-request token usage). Settings hooks and statusline run outside Claude Code and can't draw.

---

## 4. Hooks

Source: https://code.claude.com/docs/en/hooks (288k chars; I read about 200k + saved segments; PostToolUse/PermissionRequest/Elicitation per-event detail not read in full).

### Events (full table in docs)
`SessionStart`, `Setup`, `UserPromptSubmit`, `UserPromptExpansion`, `PreToolUse`, `PermissionRequest`, `PermissionDenied`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `Notification`, `MessageDisplay`, `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `Stop`, `StopFailure`, `TeammateIdle`, `InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `DirectoryAdded`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `PreModelSwitch`, `PostModelSwitch`, `Elicitation`, `ElicitationResult`, `SessionEnd`.
Hook handler types: `command` (shell; also exec-form `args`), `http`, `mcp_tool`, `prompt`, `agent` (the latter two appear later in the page: `{"ok":true}` / `{"ok":false,"reason":...}` response). `Setup`/`SessionStart` only support command and mcp_tool.

### Common input (stdin JSON)
`session_id`, `prompt_id`, `transcript_path` ("may lag the in-memory conversation"), `cwd`, `scratchpad_dir` (v2.1.257+), `permission_mode`, `effort.level`, `hook_event_name`; plus `agent_id` ("Unique identifier for the subagent or in-process teammate the hook fires in") and `agent_type` (present inside a subagent or with `--agent`; empty string otherwise). `model` only on SessionStart (not always). Tool events add `tool_name`, `tool_input`, `tool_use_id`.
Per-event:
- `SessionStart`: `source` in {startup, resume, clear, compact, fork}. On resume/fork (v2.1.251+) also `seconds_since_last_response`, `context_tokens`, `prompt_cache_likely_expired`, `estimated_cache_write_usd`. `CLAUDE_ENV_FILE` available to persist env vars.
- `SubagentStart`: `agent_id`, `agent_type`; can return `additionalContext` into the subagent's context; cannot block creation.
- `SubagentStop`: `stop_hook_active`, `agent_id`, `agent_type`, `agent_transcript_path`, `last_assistant_message`, `background_tasks`, `session_crons`. Matcher is `agent_type`.
- `Stop`: `stop_hook_active`, `last_assistant_message`, `background_tasks`, `session_crons`. Doesn't run on user interrupt; API errors fire `StopFailure` (`error` = rate_limit, overloaded, authentication_failed, billing_error, ...).
- `PreCompact`: `trigger` (`manual`/`auto`), `custom_instructions` (what the user passed to `/compact`, else null). `PostCompact`: `trigger`, `compact_summary`.
- `SessionEnd`: `reason` in {clear, resume, logout, prompt_input_exit, other}; default timeout 1.5 s (`CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS`).
- `TeammateIdle`, `TaskCreated`, `TaskCompleted`: see section 2.

### What hooks can do
- Universal JSON output: `continue` (false stops Claude entirely), `stopReason`, `suppressOutput`, `systemMessage` (warning shown to the user), `terminalSequence`.
- Exit code 2 = block (effect per event; PostToolUse only shows stderr to Claude because the tool already ran).
- Top-level `decision: "block"` + `reason` for UserPromptSubmit, PostToolUse, Stop, SubagentStop, etc.
- `hookSpecificOutput` (with `hookEventName`): PreToolUse `permissionDecision` allow/deny/ask/defer + `permissionDecisionReason`, `updatedInput` (rewrite tool args); `additionalContext` (string injected as a system reminder; capped at 10,000 chars) for SessionStart, UserPromptSubmit, SubagentStart, Stop (keeps Claude working with non-error feedback), PostToolUse etc.
- `UserPromptSubmit` output: `decision`, `reason`, `additionalContext`, `sessionTitle`, `suppressOriginalPrompt`.
- `Stop`/`SubagentStop` with `decision:"block"` keep the agent working; loop protection: `stop_hook_active` + "8-consecutive-continuation cap" (`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`). `/goal` is "a built-in shortcut for a session-scoped prompt-based Stop hook".
- `PreCompact`: exit 2 or `decision:"block"` blocks compaction (blocking auto-compaction when over the limit makes the request fail); "Plain-text stdout becomes instructions for the compaction summary" (as seen in the event table); `systemMessage`/`continue` discarded. `PostCompact`: no decision control. A `SessionStart` hook with matcher `compact` can re-inject context after compaction ("Claude Code runs them and adds their output to the compacted context").
- No decision control: SessionEnd, StopFailure, PostCompact.
- AMBIGUOUS/NOT FOUND: whether a hook can itself trigger `/clear` or `/compact`. I found no hook output field that issues a slash command. The cross-session messaging page says commands in a message text such as `/compact` "arrive as plain text. Claude Code never executes it." A mod, however, can add commands, and "Submit a prompt as if you had typed it" is listed under what a mod can do (https://code.claude.com/docs/en/plugins/mods/overview.md); whether that can run `/clear` was NOT verified.

### Context-window usage visible to hooks / model
- Hook common input has NO generic context-usage field. Only SessionStart (resume/fork) gets `context_tokens`; `PreModelSwitch` gets `context_tokens` etc. (v2.1.251+). Agent-tool results include `totalTokens` and `usage` for the subagent's final request.
- NOT FOUND: any way for the model itself to read its own context %. `/context` (user command) shows a live breakdown; `/usage` Session block shows tokens.
- A hook could estimate usage by reading `transcript_path` (lags) - my inference, not documented.

### Statusline JSON (YES: both context and rate limits exposed)
Source: https://code.claude.com/docs/en/statusline. A script configured as `statusLine` receives JSON on stdin. Fields:
- `context_window.total_input_tokens`, `context_window.total_output_tokens`, `context_window.context_window_size` (200000 or 1000000), `context_window.used_percentage`, `context_window.remaining_percentage`, `context_window.current_usage` (token counts from last API call; `null` before first call and after `/compact` until next call), `exceeds_200k_tokens`. "`used_percentage` ... is calculated from input tokens only: `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`. It does not include `output_tokens`." `used_percentage`/`remaining_percentage` "may be `null` early in the session".
- `rate_limits.five_hour.used_percentage` (0-100), `rate_limits.five_hour.resets_at` (Unix epoch seconds), `rate_limits.seven_day.used_percentage`, `rate_limits.seven_day.resets_at`; `rate_limits.spend_limit.*` behind a Claude apps gateway. "`rate_limits`: appears only for claude.ai Pro, Max, and Ultra subscribers ... only after the first API response in the session. Each window ... may be independently absent, and Claude Code drops a window once its `resets_at` time passes."
- Also: `session_name`, `session_id`, `transcript_path`, `model`, `workspace.*` (incl. `git_worktree`), `worktree.*` (name, path, branch, original_cwd, original_branch), `effort`, `agent`, cost/duration fields, and a `prompt_cache` object.
- Statusline = shell script only; it cannot be used by the model directly, but the script can write the values to a file (e.g. `.maestro/state/usage.json`) that other processes/agents read (my suggestion; the docs only show printing). Plugins' `settings.json` can only default `agent` and `subagentStatusLine`, not the main `statusLine` (so the user must configure `statusLine` themselves or through project/user settings).
- Statusline refresh timing: refresh cadence rules are in the page ("A rate-limit window ... reaches its `resets_at` time" is one trigger); exact debounce NOT captured.

---

## 5. Context management and handoff

- Auto-compact: runs automatically near the window limit. Controls: `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` ("percentage (1-100) of the auto-compact window at which auto-compaction triggers ... can't raise the threshold, so values above the default percentage are ignored ... Applies to both main conversations and subagents"); `CLAUDE_CODE_AUTO_COMPACT_WINDOW` (100000-1000000 tokens); `/autocompact 500k` (per model, saved to `modelSettings`); subagent `autoCompactWindow`; `DISABLE_AUTO_COMPACT=1` (also disables idle compaction; manual `/compact` remains); `DISABLE_COMPACT=1` (disables both); `autoCompactEnabled` setting; `idleCompaction` setting (compacts an idle long conversation). Defaults per model: "Default auto-compact thresholds" section not captured; Haiku 5.5 quoted at about 967K of 1M. Source: env-vars, model-config.
- Manual: `/compact <focus instructions>` (e.g. `/compact focus on the auth bug fix`); CLAUDE.md `# Compact instructions` section is honoured (costs page); `/rewind` -> "Summarize from here/up to here"; PreCompact hook stdout adds instructions to the summary (see above) - note: manual vs auto are separated by matcher `manual`/`auto`.
- What survives compaction (context-window page): system prompt, project-root CLAUDE.md and unscoped rules (re-read from disk), auto memory, plan-mode plan, up to 5 recently touched files (<=5k tokens each), invoked skills (5k each / 25k total), background tasks keep running, SessionStart(`compact`) hook output; path-scoped rules and nested CLAUDE.md reload on demand; hook-added context is summarised away.
- `/clear` starts a new session (hooks: `SessionEnd` reason `clear`, then `SessionStart` source `clear`). `/clear` is user-typed; no documented tool/hook to trigger it programmatically (see section 4 ambiguity). The model has no `/clear` tool in the documented tools I saw (NOT FOUND).
- Handoff patterns documented:
  - Files: CLAUDE.md/memory/rules re-injected; a `SessionStart` hook (matchers `startup|resume|clear|compact`) can inject a handoff file via `additionalContext` or stdout (hooks-guide "re-inject context after compaction": https://code.claude.com/docs/en/hooks-guide.md#re-inject-context-after-compaction - referenced, not fetched).
  - `/rename` before `/clear`, then `/resume` to return (costs page).
  - `--fork-session`, `/fork` (copies the session into a new background session when agent view is on), `/subtask` (fork subagent).
  - Cross-session messaging (v2.1.224+ mac/Linux/WSL2, v2.1.234+ native Windows; on by default): `ListAgents` + `SendMessage`; per-session Unix socket / named pipe, plain text only, ~1M char cap; delivered between tool calls or starts a new turn when idle; `/list-agents` (`/peers`); can ask a session for a one-time notice when it goes idle (`notify_when_idle`, v2.1.236+); inbound policy `crossSessionInbound` accept|hold|refuse (default: held for approval when the receiving session bypasses permissions or the sender does; `-p` sessions need `crossSessionInbound:"accept"` in `--settings` to take messages unattended; bare mode doesn't bind a socket); hooks and Bash can post into own session via `CLAUDE_CODE_MESSAGING_SOCKET` + `CLAUDE_CODE_MESSAGING_TOKEN`. Source: https://code.claude.com/docs/en/cross-session-messaging.md
  - Shared task list across sessions: `CLAUDE_CODE_TASK_LIST_ID`.
- Headless/SDK new session with a prompt: VERIFIED. `claude -p "prompt"` (add `--bare` for deterministic startup; bare mode doesn't use subscription login, needs `ANTHROPIC_API_KEY`/provider creds, and skips hooks, plugins, CLAUDE.md etc.); `--output-format text|json|stream-json` (json carries `session_id`, `result`, `total_cost_usd`, usage metadata); `--continue`, `--resume <session_id | path/to/transcript.jsonl>`; `--append-system-prompt[-file]`, `--system-prompt`, `--agents <json>`, `--agent`, `--allowedTools`, `--permission-mode`, `--permission-prompts none`, `--max-budget-usd`, `--json-schema`, `--worktree`, `--settings`, `--plugin-dir`, `--mcp-config`, `--fork-session`. Pattern from docs: `session_id=$(claude -p "..." --output-format json | jq -r '.session_id'); claude -p "..." --resume "$session_id"`. Agent SDK (Python/TypeScript, https://code.claude.com/docs/en/agent-sdk/overview.md) offers the same loop with callbacks. `claude -p` can't spawn agent-team teammates but can spawn subagents. Interactive TUI: there is `/loop` (self-paced wake-ups), `/goal` (Stop-hook-based keep-working), `claude --bg` background sessions (agent view). A `claude -p` run is SIGTERM-safe; `claude -p` leaves resumable transcripts.
- NOT FOUND: a documented way for a running interactive session to be "restarted with a prompt" by an external process other than cross-session messaging (a message starts a new turn when the session is idle) or Remote Control.

---

## 6. Rate limits (5-hour / weekly) programmatically

- Statusline JSON: YES (see section 4): `rate_limits.five_hour.{used_percentage,resets_at}`, `rate_limits.seven_day.{used_percentage,resets_at}`; only for claude.ai Pro/Max/Ultra, only after the first API response of the session.
- `/usage` (interactive; shows plan usage bars for subscribers, plus per-session tokens). The footer/plan breakdown is local-history-based and approximate; usage endpoint can be rate-limited ("Showing last-known usage"). Not scriptable as a CLI subcommand in the docs I read (NOT FOUND: `claude usage`-style subcommand).
- `StopFailure` hook with `error: "rate_limit"` fires when a turn dies on rate limit; headless `system/api_retry` events carry `error: "rate_limit"`; `claude -p` json gives `total_cost_usd` (client-side estimate, not plan usage).
- Interactive auto-wait: since v2.1.234, "Claude Code waits in the open session and continues the task on its own after the limit resets" (`/rate-limit-options`, setting `autoContinueAtUsageLimit`).
- Team/Enterprise: seat allowance with rolling five-hour and weekly windows; Enterprise Analytics API / Console Claude Code Analytics API for aggregated numbers (not remaining-limit).
- Conclusion: the only programmatic live source for remaining 5h/weekly usage is the statusline script (writes values to disk -> PM/orchestrator reads). A mod handler could also be a route (mods can "read each request's token usage"), but rate-limit fields in mod APIs were NOT verified.

---

## 7. Worktrees

Source: https://code.claude.com/docs/en/worktrees.md
- `claude --worktree <name>` (`-w`) creates `.claude/worktrees/<name>/` at repo root on a new branch `worktree-<name>`; name omitted -> random e.g. `bright-running-fox`. Base branch default is "fresh": the repo's default branch on the remote (fetches if stale >24h); `worktree.baseRef: "head"` branches from current local HEAD instead (use this for subagents that must see in-progress/unpushed work). `--worktree "#1234"` / PR URL branches from a PR. Add `.claude/worktrees/` to `.gitignore`. `.worktreeinclude` (gitignore syntax) copies gitignored files (e.g. `.env`) into every created worktree. `WorktreeCreate`/`WorktreeRemove` hooks replace git logic entirely.
- Subagent `isolation: worktree`: temporary worktree; "automatically cleaned up if the subagent makes no changes"; a worktree with changes stays until the periodic sweep can remove it without losing work (sweep removes subagent/background-session worktrees older than `cleanupPeriodDays`, leaves ones holding changes/unpushed commits, ones from un-backgrounded `--worktree` sessions, and ones you made yourself with `git worktree add`). While an agent runs, a `git worktree lock` is held. Subagent worktree uses the same base-branch rule (default branch, not parent's HEAD). A subagent in its own worktree takes its CLAUDE.md/instruction files from the main conversation, not its worktree.
- Interactive exit: clean unnamed worktree is removed automatically; named sessions prompt; dirty ones prompt keep/remove. `-p` runs never auto-clean (lock left; use `git worktree unlock` then `git worktree remove`).
- Isolation enforcement: Edit/Write/NotebookEdit targeting the main checkout, Bash/PowerShell/Monitor commands whose cwd resolves to main checkout, git redirects (`git -C`, `GIT_DIR`, `cd` into main), and unverifiable command shapes are blocked, also for subagents spawned from an isolated session. `cp`/redirects writing into main checkout are NOT caught.
- Sharing: multiple agents CAN share one worktree (nothing prevents it; teammates default to the lead's working directory; "an `isolation` value in the subagent's frontmatter doesn't prevent it" - teammates run in the lead's directory; `isolation` on the Agent call itself prevents teammate launch). Docs warn: "Two teammates editing the same file leads to overwrites"; split ownership by file. Worktrees share the `.git` dir, project-scope plugins, and approved Bash permission rules (saved to main checkout's `.claude/settings.local.json`). Hook `${CLAUDE_PROJECT_DIR}` stays at the main root; use hook input `cwd` for the worktree path.
- Resuming: `claude --worktree <name> --resume` re-enters; session returns to its worktree on `--resume`/`--continue` (also headless). `EnterWorktree` / `ExitWorktree` tools let Claude switch worktrees.

---

## Quick answers for Maestro design

1. Nested subagents: yes, default depth 3 (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`), 20 concurrent. Agent defs support `effort`, `model`, `tools`, `disallowedTools`, `isolation: worktree`, `background`, `memory`, `hooks`, `skills`, `maxTurns`, `color`. Resume via `SendMessage` with agent ID/name (not Explore/Plan).
2. Agent teams: exist but experimental, interactive-only, in-process only on Windows; direct messaging + shared claimable, dependency-aware task list with file locking; state in `~/.claude/teams/` and `~/.claude/tasks/`; no nested teams; one team/session; no per-teammate permission mode; hooks `TeammateIdle`/`TaskCreated`/`TaskCompleted`.
3. Plugins can bundle agents, skills, commands, hooks, MCP, LSP, output styles, themes, monitors, `bin/`, scripts, partial settings, and "mods" (JS handlers that draw panes/commands inside Claude Code, v2.1.287+). Project enablement via `enabledPlugins` + `extraKnownMarketplaces`, local directory marketplaces supported (loaded in place, no copy); custom marketplaces do not auto-update by default.
4. Hooks: 33 events listed; `agent_id`/`agent_type` on subagent events; transcript_path in all; no generic context-usage field; statusline JSON exposes `context_window.*` and `rate_limits.*`.
5. Compaction: customizable (env overrides, `/autocompact`, `/compact <instructions>`, CLAUDE.md "Compact instructions", PreCompact stdout, SessionStart(compact) re-injection); `/clear` not triggerable by hook/model per docs (not found); headless via `claude -p`, `--resume`, `--continue`, Agent SDK; cross-session messaging for live sessions.
6. 5h/weekly remaining: only via statusline JSON (and `/usage` interactively).
7. Worktrees: under `.claude/worktrees/<name>`, branch `worktree-<name>`, auto-clean when unchanged, base = remote default branch unless `worktree.baseRef: "head"`; sharing one worktree among agents is possible but risky.

## Not checked / gaps
- GitHub CHANGELOG (https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md) not fetched.
- docs.anthropic.com location not checked.
- Exact JSON shape for `extraKnownMarketplaces` (see settings page anchor), default auto-compact thresholds table, PostToolUse/PermissionRequest hook details, hooks-guide page, mods API reference (rate limits/commands), Agent SDK pages.
