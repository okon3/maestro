# Paseo capabilities for a multi-agent dev framework

Researched 2026-11-06. Read-only: loaded skills `paseo`, `paseo-help`, `paseo-handoff`, `paseo-plugin`; fetched paseo.sh docs (llms.txt, orchestration, orchestration-workflows, mcp, schedules, agent-profiles, skills, cli, sdk/reference, sdk/events, plugins/reference, plugins/hooks, claude-code, workspaces, worktrees); called `list_profiles` and `list_providers` (read-only).

Source tags: [S:paseo], [S:handoff], [S:help], [S:plugin] = skills; [D:name] = https://paseo.sh/docs/name.md.

Observed on this host: `list_profiles` returns an empty list (no profiles configured). Enabled providers: `claude`, `codex`, `ollama-local` (a Claude-type custom provider). Copilot, OpenCode, Pi etc. are unavailable.

## 1. Agents creating and driving agents

Yes. With "Enable Paseo tools" on (Settings -> host -> Agents; `daemon.mcp.injectIntoAgents`, default false; new or reloaded agents only) an agent gets [D:orchestration] [D:mcp]:
- `create_agent`: required title, `provider` as `provider/model`, initialPrompt; optional workspaceId, notifyOnFinish, settings (modeId, thinkingOptionId, features), labels, background. [S:paseo]
- `send_agent_prompt` by agentId. Agent-scoped default is `steer` for a running turn, falling back to interrupt; `activeTurnBehavior` overrides. Messages to one recipient are delivered after two quiet seconds; the call returns a queued receipt. [S:paseo]
- `get_agent_status` (lifecycle state, capabilities, pending permissions), `get_agent_activity` (curated recent timeline), `list_agents` (filters cwd, statuses, sinceHours), `cancel_agent` (abort turn, keep agent), `archive_agent`, `kill_agent`, `update_agent` (name, labels, mode, model, thinking at runtime), `set_agent_mode`. [D:mcp]
- Permissions: `list_pending_permissions`, `respond_to_permission` (a PM can approve or deny workers' requests). [D:mcp]
- Terminals and workspace scripts (`create_terminal`, `start_workspace_script`, ...). [D:mcp]

Receiving messages from children:
- `notifyOnFinish` defaults to true for agent-scoped calls: the parent is notified of completion, error, or permission request (this is the "paseo-system" message). Guidance: finish the turn and wait for the notification, do not poll. [S:paseo] [D:mcp]
- Child-to-parent messages: agents can prompt any agent on the same host by ID, including ones they did not launch and across workspaces. Give the worker the PM's agent ID and it can `send_agent_prompt` back. [D:orchestration-workflows] [S:paseo]
- There is no dedicated mailbox primitive. Coordination is prompt-to-agent, finish notifications, and reading status/activity.
- CLI equivalents: `paseo run --no-wait`, `paseo send`, `paseo wait <id>`, `paseo logs <id> --tail N`, `paseo permit ls/allow/deny`, `paseo ls`. [D:cli]

Providers/models and isolation:
- Each worker may use any provider/model configured on the host (e.g. `claude/opus`, `codex/gpt-5.4`). Mixing providers is explicitly supported, including for independent review. [D:orchestration] [D:orchestration-workflows]
- Workspaces: `create_workspace` with `isolation: "worktree"` (modes `branch-off`, `checkout-branch`, `checkout-pr`; `baseBranch`, `branchName`, `worktreeSlug`) or `local`; then `create_agent` with that `workspaceId`. Setup hooks and `paseo.json` scripts run on worktree creation; `.worktreeinclude` copies gitignored files such as `.env`. [S:paseo] [D:worktrees]
- Parentage vs placement: a child created in another workspace remains the creator's subagent (Subagents track) and also appears as a tab in its own workspace. Detaching to top level is a user-only action (`paseo agent detach <id>`), not an MCP tool. [D:mcp] [S:paseo]
- Cross-host: `serverId` on create/list/send/status tools (`list_hosts`); CLI `--host` reaches remote daemons. [S:paseo]
- Profiles: `list_profiles` returns human-saved bundles (provider, model, mode, thinking, features) with "When to use" notes. There is no `profile` parameter on `create_agent`; the orchestrator copies the fields. Good for declaring roles. None exist on this host yet. [D:agent-profiles] [S:paseo]
- Per-role tool limits: `agents.providers.<id>.paseoTools.disabledTools` (e.g. remove `create_agent`, `send_agent_prompt`, `kill_agent` from worker providers) or `enabled:false`. Custom providers do not inherit it via `extends`; a running session keeps the catalog it launched with; it is not a security boundary if the agent has a shell. [D:mcp]

## 2. Heartbeats and schedules

- Schedule: cron-driven; each run starts a NEW agent (prompt, cwd, provider, optional timezone, maxRuns, expiresIn). Full MCP surface: create, list, inspect, pause, resume, update, logs, run_once, delete. Run workspaces are archived on finish by default (`archiveOnFinish`, changeable only in the app UI). [D:schedules] [D:mcp]
- Heartbeat: cron-driven prompt sent back into ONE existing agent, preserving its conversation. MCP: `create_heartbeat` (prompt, cron, timezone, name, maxRuns, expiresIn) and `delete_heartbeat` only; no update or pause (delete and recreate). The CLI can also change the cron period. Intended for reminders, CI babysitting, and "continue this migration in small steps, delete the heartbeat when done, expire after two hours". [S:paseo] [D:schedules] [D:orchestration-workflows]
- Use for a PM: a heartbeat on the PM session (every 5-10 min, with maxRuns/expiresIn) makes it re-read worker status (`list_agents`, `get_agent_status`), nudge workers, and pick up work if a notification was missed or a session was interrupted. It keeps the PM's context because the prompt lands in the same conversation. Caveat (not documented): behavior when the PM is mid-turn (agent prompts default to steer). Keep heartbeat prompts idempotent ("if nothing changed, do nothing") and delete them when the project ends. A schedule fits fresh independent jobs (nightly QA sweep), not resuming the PM. (Recommendation is my inference.)
- Hub (optional hosted service) can start agents from external events (GitHub, Slack, Discord, Linear) instead of cron. [D:schedules]

## 3. Handoff

- `paseo-handoff`: calls `list_profiles` first, picks a profile (or the user-named one), optionally `create_workspace` (worktree), then `create_agent` titled `[Handoff] <task>` with a self-contained briefing (Task, Context, Relevant files, Current state, What was tried, Decisions, Acceptance criteria, Constraints). The receiver starts with zero context. It stays the caller's subagent until the user detaches it; the skill says not to wait or poll. [S:handoff] [D:skills]
- It is a context-transfer pattern, not a "swap the session under the same chat" feature. Nothing read says a thread or tab can be re-pointed at a fresh agent session. The user's thread is the agent's own conversation (tab); a handed-off agent is a different agent/tab (Subagents track, or top-level after detach). So replacing a PM means the user moves to the new agent's tab; the old conversation stays with the old agent. To keep continuity, persist state in files (task board, decisions, agent IDs) and point the briefing at them. (Inference from the docs; not explicitly documented.)
- Related skills: `paseo-committee` (two independent planners), `paseo-advisor` (second opinion). [D:skills]
- Existing agents keep their conversation across turns (`send_agent_prompt`). Resuming archived agents is hinted at in plugin docs ("closed agents ... until resumed") but not documented in detail.

## 4. Context usage, compaction, rate limits

- Context usage: the SDK agent handle exposes `lastUsage` = "token counts, cost, and context-window use from the last turn" [D:sdk/reference]. MCP `get_agent_status` is described as lifecycle state, capabilities, pending permissions, so a PM may not see context use via MCP; a plugin or SDK script can. I did not find a documented context meter in the UI.
- Compaction: no Paseo-level compaction feature documented; it is the provider's own (Claude Code auto-compaction).
- Rate limits/quotas: `paseo usage`, `paseo usage ls --refresh --agent <id>`, `paseo usage inspect <report-id>` (and `--json`) show account quotas, windows and balances per provider account (five-minute cache; failures carry reasons). SDK `listUsage()` returns normalized subscription windows and balances (Paseo 0.11+). Plugins can add usage sources (`server.registerUsageSource`); the app has a host-wide Usage modal. [D:cli] [D:sdk/reference] [D:plugins/reference]
- Claude Code in Paseo uses the normal Claude plan limits, no separate pool, so parallel workers share one quota. [D:claude-code]
- `lastError` and turn outcomes are exposed per agent; hook `agent.turn.after` carries `outcome`. [D:sdk/reference] [D:plugins/hooks]

## 5. Plugins and a team dashboard

- Trusted, unsandboxed local plugins. Global switch `pluginsEnabled` in `config.json` (must ask the user before enabling). Commands: `paseo plugin init/install/reload/logs/ls`. Client (React Native components) + server (daemon subprocess with Node access) + shared Zod contracts. Unified panel props and `addAgentPanel` need Paseo 0.13+. [S:plugin] [D:plugins/reference]
- Contributions: `addScreen` with `addSidebarHeaderItem`/`addSidebarFooterItem`; `addWorkspacePanel`/`addAgentPanel` (tab beside agents/terminals/files/diffs, `locations: ["workspace","explorer"]`, persisted per-tab state via `useTabState`); `addFilePanel`; Command Center items; slash commands; composer pills (beside Tasks/Subagents); timeline transformers/renderers and daemon-appended timeline rows; attachment sources; themes; plugin RPC (`defineRpc`, `server.handle`, `useRpc`); usage sources; providers. [S:plugin] [D:plugins/reference]
- Data access: `usePaseo()` and server-handler `{ paseo }` cover workspaces, agents (create, send, `waitForFinish`, subscribe, `lastUsage`, `pendingPermissions`, `activeTurn`, `parentAgentId`), terminals, providers, config. `useAgent(id, selector)` and `useWorkspace(id, selector)` give live cached state; `client.paseo.agents.list({subscribe})` streams the agent directory. Server hooks (`agent.create.before/after`, `agent.turn.before/after`, `agent.permission.before/after`, `workspace.*`, `worktree.*`) can observe or react. Note: the skill text says `server.on`/`server.before`, while the hooks docs page says `server.addHook(name, handler)`; check against the installed version. [S:plugin] [D:plugins/hooks]
- Answer: yes, a live team dashboard is feasible as a plugin screen (with sidebar item) or as a workspace/Explorer panel next to the agents. It could list PM, architect, implementers, QA and reviewer with status, active turn, usage, pending permissions, and open agents via `navigation.openAgent`. Benefits over a separate web page: live agent state without a polling backend, same host/auth, theming, one-click navigation. Costs: React Native primitives only (no HTML/CSS), colors from `theme.colors`, trusted unsandboxed install, project data (task board file) needs a server RPC to read. A standalone web app via the TypeScript SDK remains possible. Desktop-only is fine; mobile compatibility is just an authoring checklist.

## 6. Limits and caveats

- Paseo tools are off by default; enable per host, then reload existing agents. Worktree/branch/PR checkouts need `create_workspace` first.
- Permissions: workers in `default` mode prompt, and permission requests arrive as notifications the PM must triage (`respond_to_permission`), or workers run in `acceptEdits`/`auto`/`bypassPermissions` (bypass is flagged dangerous). Claude modes here: plan, default, acceptEdits, auto, bypassPermissions.
- Cost/quota: every worker is a full session on the same plan or provider account; parallel agents burn quota quickly (inference). Monitor with `paseo usage`. Worktrees multiply disk and setup cost (setup hook such as `npm ci` per worktree).
- Concurrency: no documented agent cap. Messages are debounced two seconds; steering may fall back to interrupt and cut a worker mid-task.
- Notifications arrive when the parent is idle; a PM cannot block on a worker inside a turn except via CLI `paseo wait` if it has shell access.
- No heartbeat pause/update; `archiveOnFinish` not settable via MCP. Detach is user-only. Tool-catalog limits are not a security boundary. Plugins are unsandboxed.
- Paseo subagents vs native provider subagents: native ones give a read-only timeline and are managed by the provider; Paseo subagents are full sessions you can talk to, with any provider and their own workspace. [D:orchestration-workflows]
- App/daemon version skew causes bugs; diagnose with `paseo daemon status --json` and `paseo provider diagnostic <p>`. Never restart the daemon from inside an agent. [S:help]

## 7. Recommendation (PM + architect + 2 implementers + QA + reviewer)

Take from Paseo:
- Roles as real sessions: PM is the user-facing Paseo agent; architect, two implementers, QA and reviewer are Paseo subagents (`create_agent`), because they need their own conversations, provider/model choice (e.g. reviewer on Codex for independent judgment, implementers on a cheaper Claude model), and the user can open and talk to any of them.
- Each implementer in its own worktree workspace (branch-off main). Architect and reviewer read-only (plan mode or instructed). QA in the worktree of the change under test, with the project's browser/terminal.
- One profile per role with "When to use" notes (architect, implementer, qa, reviewer) so the PM launches deterministically; `paseoTools.disabledTools` on worker providers so only PM (maybe architect) can create or kill agents.
- `notifyOnFinish` completion and permission notifications as the main event channel; workers report back by finishing with a concise final message or by `send_agent_prompt` to the PM's agent ID (put it in every briefing).
- A heartbeat on the PM (about every 5-10 min, `expiresIn` a few hours, idempotent check-and-nudge prompt) as watchdog and resume-after-interruption; schedules for recurring fresh jobs.
- Handoff for replacing a bloated PM: use the `paseo-handoff` briefing format, but keep authoritative state (task board, decisions, agent IDs) in repo files since the new agent is a new tab.
- `paseo usage` and `lastUsage` for quota and context monitoring; optionally a plugin screen/panel as the team dashboard.

Take from Claude Code native subagents:
- Short, synchronous, disposable, read-only work inside one agent's turn: codebase exploration, grep-style inventories, small mechanical edits, quick test runs, and context isolation to keep the PM's context small. No workspace, notification or permission plumbing is needed. Each Paseo worker can also use native subagents for its own fan-out.

Rule of thumb: Paseo agents for long-lived work needing a different provider/model, a separate worktree, user visibility or interaction; native subagents for short, blocking, disposable tasks.

Gaps to prototype before committing: (a) whether PM-side MCP can read context usage (probably only SDK/plugin), (b) heartbeat behavior when the PM is mid-turn, (c) how a replaced PM appears to the user (new tab vs same thread), (d) permission-prompt load on workers in `default` mode.
