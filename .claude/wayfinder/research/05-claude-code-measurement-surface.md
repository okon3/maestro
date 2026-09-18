# Claude Code measurement surface for the maestro eval harness

Scope: what Claude Code **2.1.276** (native build, Windows 11, `C:\Users\lregazzi\.local\bin\claude.exe`) exposes today for
measuring an orchestrated run from outside/alongside it, **without** the unreleased "Claude Mods / function hooks" feature.

Evidence legend used throughout:
- **[D]** documented on the official docs (URL in Sources, accessed 2026-09-18)
- **[V]** verified locally on this machine (read-only transcript inspection, `claude --help`, string inspection of the shipped binary)
- **[I]** inferred — plausible from adjacent evidence, not confirmed

## Summary

1. Everything maestro wants to measure is obtainable today; nothing needs function hooks.
2. The richest single source is the **transcript JSONL tree**: `~/.claude/projects/<slug>/<session>.jsonl` plus a per-session
   `<session>/subagents/agent-<id>.jsonl` + `.meta.json` sidecar that gives the full agent tree with `parentAgentId` and `spawnDepth`. **[V]**
3. Transcripts also carry a `cost-state` entry with `totalCostUSD`, per-model `modelUsage` (tokens + `costUSD`), API/tool/wall
   durations and lines added/removed — i.e. the `/usage` numbers, persisted. **[V]**
4. Per-subagent cost/behaviour comes for free in the Agent tool result: `totalTokens`, `totalDurationMs`, `totalToolUseCount`,
   `resolvedModel`, `usage`, `toolStats`. **[V]**
5. Headless `claude -p --output-format json` is the cleanest harness entrypoint: `total_cost_usd`, `modelUsage`, `usage`,
   `duration_ms`, `duration_api_ms`, `num_turns`, `permission_denials`, `session_id`, and `subagent_stats.spawned`. **[D/V]**
6. `--max-budget-usd` exists as a real flag; **`--max-turns` is absent from `claude --help` on 2.1.276** (cap turns per-agent instead). **[V]**
7. OpenTelemetry gives near-real-time cost/token counters attributed by `model`, `query_source` (`main`/`subagent`/`auxiliary`) and
   `agent.name`, plus `tool_result` events with `duration_ms` — and a `console` exporter for offline capture. **[D]**
8. Classic hooks cover the whole lifecycle including `SubagentStart`/`SubagentStop` with `agent_id`/`agent_type`, and
   `PostToolUse`/`PostToolUseFailure` with `tool_use_id` — enough for per-tool timing and per-agent attribution. **[D]**
9. Human interruptions are observable (`[Request interrupted by user]` markers, `permission_denials`, `tool_decision` sources). **[V/D]**
10. Bonus: **`claude plugin eval`** already ships a scored, multi-run, ablation-capable plugin eval runner with `--json`, `--max-cost-usd`
    and `--concurrency` — maestro's harness should wrap it rather than reinvent the scaffolding. **[V]**

---

## Field inventory

| Metric we want | Mechanism | Exact field / event | Attribution granularity | Reliability caveats on 2.1.276 |
|---|---|---|---|---|
| Total USD for a run | headless JSON | `result.total_cost_usd` | session (whole tree, subagents included) | Client-side estimate from a bundled price table; can drift from the bill. Zeroed on `error_during_execution` after a crash. **[D]** |
| Total USD (no headless run) | transcript | `{"type":"cost-state"}` → `totalCostUSD` | session | Verified present in real transcripts; **not in the docs** → treat as internal/unstable. Reset by `/clear`. **[V]** |
| Total USD (live) | statusline stdin JSON | `session.total_cost_usd` | session | Zod schema in binary: `session:{total_cost_usd,total_api_duration_ms,total_duration_ms,total_lines_added,total_lines_removed,model_usage}`. Fires only while a statusline script is configured. **[V]** |
| USD + tokens per model | headless JSON | `result.modelUsage[<model>].{costUSD,inputTokens,outputTokens,cacheReadInputTokens,cacheCreationInputTokens,costBasis}` | model (tree-wide) | `modelUsage` is the only result field that counts subagents *and* splits by model. `costBasis` ∈ `list`/`managed`/`unknown` (needs ≥2.1.246). **[D]** |
| USD + tokens per model (transcript) | transcript | `cost-state.modelUsage["claude-opus-5[1m]"].{inputTokens,outputTokens,cacheReadInputTokens,cacheCreationInputTokens,webSearchRequests,costUSD}`, `hasUnknownModelCost` | model | Same undocumented caveat; note the model key includes the `[1m]` context suffix. **[V]** |
| Tokens per message (input/output/cache_read/cache_creation) | transcript | assistant entry → `.message.usage.{input_tokens,output_tokens,cache_read_input_tokens,cache_creation_input_tokens,cache_creation.ephemeral_5m_input_tokens,cache_creation.ephemeral_1h_input_tokens,service_tier,inference_geo,iterations[]}` | single API response | Per-message `output_tokens` is a **placeholder** taken at `message_start` — never sum it. Parallel tool calls share one `message.id`: dedupe by `.message.id`. **[D/V]** |
| Cumulative main-loop tokens | headless JSON | `result.usage` | session, **main loop only** | Excludes subagents by design. Also under-reports on `error_max_budget_usd`. **[D]** |
| Which model actually ran | transcript | `.message.model`; plus `.advisorModel`, `.effort`, `.perTurnEffort` | per API response | Resolution order is per-invocation `model` → agent frontmatter → `CLAUDE_CODE_SUBAGENT_MODEL` → main model, so the transcript is the only ground truth. **[D/V]** |
| Which model a subagent ran | Agent tool result | `toolUseResult.resolvedModel` (e.g. `claude-sonnet-5`) | subagent | Present on completed Agent calls. **[V]** |
| Wall-clock time | headless JSON | `result.duration_ms`, `result.duration_api_ms`; also (binary zod) `ttft_ms`, `ttft_stream_ms`, `time_to_request_ms`, `first_content_frame_ms` | session | The extra timing fields are in the shipped schema but undocumented → optional. **[V]** |
| Wall-clock / API / tool split (no headless) | transcript | `cost-state.{totalDuration,totalAPIDuration,totalAPIDurationWithoutRetries,totalToolDuration,startTime}` | session | `totalAPIDuration - totalAPIDurationWithoutRetries` ≈ time burned on retries. Undocumented. **[V]** |
| Per-turn duration | transcript | `{"type":"system","subtype":"turn_duration","durationMs":…,"messageCount":…}` | turn | Verified in 2.1.276 transcripts; undocumented. **[V]** |
| Number of agents spawned | headless JSON | `result.subagent_stats.spawned` + `subagent_stats.requested.{background,foreground,unset}`, spawns started in background, spawns by agent type, deepest spawn depth | session | Field is in the shipped result zod schema (`subagent_stats`, optional) and self-describes "refused or failed launch is not counted". Not in public docs → verify per version. **[V]** |
| Number of agents spawned (offline) | transcript tree | count of `~/.claude/projects/<slug>/<session>/subagents/agent-*.jsonl` | session | Storage path is documented. Files are pruned after `cleanupPeriodDays` (default 30). **[D/V]** |
| Agent tree / nesting depth | transcript sidecar | `<session>/subagents/agent-<id>.meta.json` → `{agentType,description,toolUseId,parentAgentId,spawnDepth,requestShape,requestNonInteractive}` | subagent | Exactly the join key needed: `toolUseId` links back to the parent's `tool_use` block. Undocumented file format. **[V]** |
| Agent tree (live stream) | stream-json | `assistant`/`user` messages with `parent_tool_use_id`; `--forward-subagent-text` to also get text/thinking at every nesting depth | subagent | Needs `--output-format stream-json --verbose`. Nested-subagent forwarding needs ≥2.1.219. **[D]** |
| Per-agent tokens / duration / tool count | Agent tool result | `toolUseResult.{status,agentId,agentType,resolvedModel,totalDurationMs,totalTokens,totalToolUseCount,usage,toolStats}` | subagent | `toolStats = {readCount,searchCount,bashCount,editFileCount,linesAdded,linesRemoved,otherToolCount}`. Only on the `user` entry that carries the Agent tool result. **[V]** |
| Per-agent context growth | transcript | sum `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` on the entry whose `tool_use` id equals the hook's `tool_use_id` | subagent window | This is exactly the attribution trick in `C:\Git\Iconsulting\iconsulting-skill\plugins\orchestrate\hooks\context-guard.mjs` (tail-read the transcript, match `tool_use_id`, fall back to last non-sidechain assistant entry). **[V]** |
| Sidechain flag | transcript | `.isSidechain` — `false` in the main `<session>.jsonl`, `true` in `subagents/agent-*.jsonl`; subagent entries also carry `.agentId`, `.attributionAgent`, `.attributionSkill`, `.attributionPlugin` | entry | Main-session file contains **no** sidechain entries on 2.1.276 (verified: 79 753 entries, all `false`) — subagent content lives only in the sidecar files. **[V]** |
| Tool calls (count + names) | transcript | assistant `.message.content[] .type=="tool_use"` (`id`, `name`, `input`); result side on the paired `user` entry (`toolUseResult`, `sourceToolAssistantUUID`) | tool call | `wireToolInputs` appears on entries where inputs were rewritten. **[V]** |
| Tool calls (live) | OTEL log event | `claude_code.tool_result` → `tool_name`, `tool_use_id`, `success`, `duration_ms`, `error_type`, `tool_input_size_bytes`, `tool_result_size_bytes`, `decision_source` | tool call | `duration_ms` here is the cheapest per-tool timing available without traces. Tool *parameters* need `OTEL_LOG_TOOL_DETAILS=1`. **[D]** |
| Per-tool timing (hooks) | hooks | `PreToolUse` / `PostToolUse` / `PostToolUseFailure`, keyed on `tool_use_id`; also `PostToolBatch.batch_tool_use_ids` | tool call | Hooks give you wall-clock deltas you compute yourself; add `agent_id` from the payload to attribute per agent. **[D]** |
| Per-tool timing (traces) | OTEL traces (beta) | spans `claude_code.tool` (`duration_ms` incl. permission wait), `claude_code.tool.execution` (`duration_ms`, `success`), `claude_code.tool.blocked_on_user` (`duration_ms`, `decision`) | tool call, agent (`agent_id`, `parent_agent_id`) | Requires `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1`; beta, so schema may move. Best available per-agent LLM-request timing (`claude_code.llm_request` carries `agent_id`, `ttft_ms`, `attempt`, token counts). **[D]** |
| Retries | stream-json | `system/api_retry` → `attempt`, `max_retries`, `retry_delay_ms`, `error_status`, `error`, `no_response.{waited_ms,retry_wait_ms}` | API request | Only in `stream-json`. First two `apiKeyHelper` 401/403 retries are silent but still counted in `attempt` (≥2.1.246). **[D]** |
| Retries / API errors (offline) | transcript | `{"type":"system","subtype":"api_error"}` entries; also `model_refusal_fallback` | turn | Verified present across local transcripts. Undocumented shape. **[V]** |
| API errors (live) | OTEL log event | `claude_code.api_error` → `request_id`, `status_code`, `error` | API request | **[D]** |
| Turn-ending failures | hooks | `StopFailure` → `error_type` ∈ `rate_limit`/`overloaded`/`billing_error`/… ; `error_message` | session | Hook output is ignored for this event (observe-only). **[D]** |
| Human interruptions (esc) | transcript | literal markers `[Request interrupted by user]` and `[Request interrupted by user for tool use]` in message content | turn | Verified in local transcripts; string-matching, so brittle across versions. **[V]** |
| Human interruptions (permission prompts) | headless JSON | `result.permission_denials[]` | session | With `--permission-prompts none`, denials also stream as `permission_denied` system messages. Needs ≥2.1.259 for the flag. **[D]** |
| Human interruptions (decisions) | OTEL | metric `claude_code.code_edit_tool.decision` (`decision`, `source` ∈ `user_permanent`/`user_temporary`/`user_abort`/`user_reject`); event `claude_code.tool_decision` | tool call | `source` is what separates "a human answered" from "a rule/hook answered". **[D]** |
| Human interruptions (prompt count) | hooks | `Notification` with matcher `permission_prompt` / `idle_prompt` / `agent_needs_input`; `PermissionRequest`; `PermissionDenied` (`denial_reason`) | tool call | The clean way to count "times the run needed a human". **[D]** |
| Turns | headless JSON | `result.num_turns` (+ `queued_turn_count`, optional) | session | `--max-turns` is **not** in `claude --help` on 2.1.276 (verified absent); the binary still contains `error_max_turns` / "Reached maximum number of turns". **[V]** |
| Lines of code changed | transcript | `cost-state.{totalLinesAdded,totalLinesRemoved}`; per-agent `toolStats.{linesAdded,linesRemoved}` | session / subagent | OTEL equivalent: `claude_code.lines_of_code.count`. **[V/D]** |
| Commits / PRs | OTEL | `claude_code.commit.count`, `claude_code.pull_request.count` | session | Counter only, no attribution to a tool call. **[D]** |
| Active vs idle time | OTEL | `claude_code.active_time.total` with `type` ∈ `user`/`cli` | session | Useful to separate "agent working" from "waiting on a human". **[D]** |
| Hook overhead / hook firing | transcript | `{"type":"system","subtype":"stop_hook_summary", hookCount, hookInfos, hookErrors, hookAdditionalContext, preventedContinuation, stopReason, hasOutput, toolUseID}` | hook batch | Most frequent system subtype in local transcripts (1 384 occurrences) — cheap signal that maestro's own hooks ran. Undocumented. **[V]** |
| Hook overhead (live) | stream-json | `--include-hook-events` → `hook_started` / `hook_progress` / `hook_response` messages | hook invocation | `stream-json` only; flag verified in `claude --help`. **[V/D]** |
| Hook overhead (traces) | OTEL traces | span `claude_code.hook` → `hook_event`, `hook_name`, `num_hooks`, `duration_ms`, `num_success`, `num_blocking`, `num_non_blocking_error` | hook batch | Needs `ENABLE_BETA_TRACING_DETAILED=1` + a beta tracing endpoint. **[D]** |
| Plugin actually loaded | stream-json | `system/init` → `plugins[] {name,path}`, `plugin_errors[] {plugin,type,message}`, `mcp_servers[]`, `mcp_server_errors[]`, `capabilities[]` | session | The CI gate for "maestro was in fact active". `plugin_errors` key is omitted when empty. **[D]** |
| Session identity / join key | all | `session_id` (result, hooks, OTEL `session.id`), `sessionId` + `uuid` + `parentUuid` + `requestId` + `promptId` in transcript, `prompt.id` + `event.sequence` + `message.uuid` on OTEL events | session / prompt / message | `prompt.id` is the correlation key that ties OTEL events to one user prompt. Needs ≥2.1.196 for the hook `prompt_id`. **[D/V]** |
| In-session human-readable totals | slash commands | `/usage` (Session block: `Total cost`, `Total duration (API)`, `Total duration (wall)`, code changes, usage-by-model, `Prompt cache (main)`), `/context`, `/insights` (HTML to `~/.claude/usage-data/report.html`), `/stats` (backed by `~/.claude/stats-cache.json`: `modelUsage`, `dailyModelTokens`, `totalSessions`, …) | session / machine | `/cost`, `/stats`, `/context` strings all still exist in the 2.1.276 binary, but the docs now describe `/usage` as the cost view. `/usage` plan-breakdown figures are approximate and machine-local. **[V/D]** |

### Anonymised sample transcript line (subagent assistant entry, field shape only)

```json
{"type":"assistant","uuid":"<uuid>","parentUuid":"<uuid>","timestamp":"2026-09-18T11:12:13.456Z",
 "sessionId":"<session-uuid>","agentId":"a19bff0af495b07ac","isSidechain":true,
 "attributionAgent":"Explore","attributionSkill":"<plugin>:<skill>","attributionPlugin":"<plugin>",
 "advisorModel":"claude-opus-5","effort":"xhigh","perTurnEffort":"xhigh",
 "requestId":"req_<id>","apiBlockIndex":0,"cwd":"<cwd>","version":"2.1.276","gitBranch":"main",
 "message":{"id":"msg_<id>","model":"claude-opus-5","role":"assistant","type":"message",
   "stop_reason":"tool_use",
   "content":[{"type":"tool_use","id":"toolu_<id>","name":"Bash","input":{"...":"..."}}],
   "usage":{"input_tokens":2,"output_tokens":581,"cache_read_input_tokens":90829,
     "cache_creation_input_tokens":1087,
     "cache_creation":{"ephemeral_5m_input_tokens":1087,"ephemeral_1h_input_tokens":0},
     "service_tier":"standard","inference_geo":"global"}}}
```

### Transcript layout verified on this machine

```
~/.claude/projects/<slug>/
  <session-id>.jsonl                      # main conversation, all entries isSidechain:false
  <session-id>/subagents/agent-<id>.jsonl # one per subagent, isSidechain:true, carries agentId
  <session-id>/subagents/agent-<id>.meta.json
  <session-id>/tool-results/<tool_use_id|token>.txt|.pdf   # offloaded large tool results
~/.claude/stats-cache.json                # /stats backing store
~/.claude/history.jsonl                   # prompt history
~/.claude/telemetry/1p_failed_events.*.json
```

Entry `type` values seen across local transcripts **[V]**: `assistant`, `user`, `attachment`, `system`, `last-prompt`,
`atis-latch`, `queue-operation`, `ai-title`, `custom-title`, `file-history-snapshot`, `file-history-delta`, `mode`,
`permission-mode`, **`cost-state`**.
`system` subtypes seen **[V]**: `stop_hook_summary`, `turn_duration`, `api_error`, `local_command`, `away_summary`,
`informational`, `model_refusal_fallback`.

### Hook events available to classic hooks (2.1.276) **[D]**

32 events: `SessionStart`, `Setup`, `UserPromptSubmit`, `UserPromptExpansion`, `PreToolUse`, `PermissionRequest`,
`PermissionDenied`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `Notification`, `MessageDisplay`,
`SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `Stop`, `StopFailure`, `TeammateIdle`,
`InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `DirectoryAdded`, `FileChanged`, `WorktreeCreate`,
`WorktreeRemove`, `PreCompact`, `PostCompact`, `PreModelSwitch`, `PostModelSwitch`, `Elicitation`, `ElicitationResult`.
(`SessionEnd` is referenced only by the hook-timeout table on the same page — treat its presence as **[I]** until confirmed.)

Common payload on every event: `session_id`, `prompt_id`, `transcript_path`, `cwd`, `scratchpad_dir`,
`permission_mode`, `effort.level`, `hook_event_name`; inside a subagent also `agent_id` and `agent_type`.
Tool events add `tool_name`, `tool_input`, `tool_use_id`, and `tool_output` / `tool_error`.
`SubagentStart`/`SubagentStop` carry `agent_id`, `agent_type` (+ `last_assistant_message` on stop) and support a
matcher on agent type. Hooks inherit the parent environment **except `OTEL_*` exporter variables** — relevant if
maestro wants a hook to push its own telemetry.

`PreModelSwitch` / `PostModelSwitch` (`from_model`, `to_model`, `requested_by`) are the only event-level signal for
mid-run model changes, which matters for "which model actually ran".

### OpenTelemetry, condensed **[D]**

Enable: `CLAUDE_CODE_ENABLE_TELEMETRY=1`, then `OTEL_METRICS_EXPORTER` / `OTEL_LOGS_EXPORTER` /
`OTEL_TRACES_EXPORTER` ∈ `otlp | prometheus (metrics only) | console | none`, `OTEL_EXPORTER_OTLP_PROTOCOL`,
`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, export intervals
`OTEL_METRIC_EXPORT_INTERVAL` (60 000 ms default) / `OTEL_LOGS_EXPORT_INTERVAL` (5 000) / `OTEL_TRACES_EXPORT_INTERVAL`.

Metrics: `claude_code.session.count`, `claude_code.cost.usage` (USD), `claude_code.token.usage`,
`claude_code.lines_of_code.count`, `claude_code.commit.count`, `claude_code.pull_request.count`,
`claude_code.code_edit_tool.decision`, `claude_code.active_time.total`.
Cost/token attributes that matter to maestro: `model`, **`query_source` ∈ `main`/`subagent`/`auxiliary`**, `effort`,
`speed`, **`agent.name`** (redacted to `custom` for user-defined agents), `skill.name`, **`plugin.name`** (redacted to
`third-party` for non-official plugins), `mcp_server.name`; the token counter adds `type` ∈ `input`/`output`/`cacheRead`/`cacheCreation`.
Session id on metrics is controlled by `OTEL_METRICS_INCLUDE_SESSION_ID` (default true).

Events (logs): `claude_code.user_prompt`, `claude_code.assistant_response` (`model`, `request_id`, `message.uuid`),
`claude_code.tool_result`, `claude_code.tool_decision`, `claude_code.api_request`, `claude_code.api_error`; all carry
`prompt.id` and `event.sequence` for correlation.

**Offline capture**: `console` exporter for metrics/logs/traces → redirect stdout/stderr of the `claude -p` process to a
file. There is **no documented file exporter**; the nearest thing is `OTEL_LOG_RAW_API_BODIES=file:/directory`
(raw API request/response bodies to disk), which is a debugging firehose, not a metrics sink.

### Headless / CLI flags verified in `claude --help` on 2.1.276 **[V]**

Present: `-p/--print`, `--output-format text|json|stream-json`, `--input-format`, `--include-hook-events`,
`--include-partial-messages`, `--forward-subagent-text`, `--replay-user-messages`, `--verbose`,
**`--max-budget-usd <amount>`** (print mode only), `--fallback-model <list>`, `--model`, `--effort`,
`--permission-mode acceptEdits|auto|bypassPermissions|manual|dontAsk|plan`, `--permission-prompts host|none`,
`--permission-prompt-tool`, `--allowedTools`/`--disallowedTools`, `--tools`, `--append-system-prompt(-file)`,
`--system-prompt(-file)`, `--agents <json>`, `--plugin-dir <path>` (repeatable, dir or `.zip`), `--plugin-url`,
`--mcp-config`, `--strict-mcp-config`, `--settings`, `--setting-sources user,project,local`, `--session-id <uuid>`,
`-r/--resume`, `-c/--continue`, `--fork-session`, `--no-session-persistence`, `--add-dir`, `--json-schema`,
`--bare`, `--safe-mode`, `--restricted`, `-d/--debug [filter]`, `--debug-file <path>`, `--autocompact`, `--worktree`.

Absent from help on 2.1.276: **`--max-turns`** (documented on the CLI reference page as print-mode only; the binary
contains `error_max_turns` and `Reached maximum number of turns`, so the cap exists internally). Note: `claude --version`
short-circuits before option validation, so `claude --bogus-flag --version` exits 0 — **flag existence cannot be probed
that way**; the help text is the reliable local check.

Plugin subcommands present **[V]**: `claude plugin validate <path> [--json] [--strict]`,
`claude plugin details <name>` (component inventory + projected token cost),
`claude plugin list|install|uninstall|enable|disable|update|init|tag|prune|marketplace`, and
**`claude plugin eval [target]`** with `--ablation none|with-without`, `--case <glob>`, `--tag`, `--runs <n>`
(default `case.runs ?? 3`), `-j/--concurrency 1..8`, `--model`, `--judge-model` (default haiku), `--max-cost-usd`,
`--threshold 0..1`, `--json [path]`, `--report <path>`, `--output-dir`, `--no-publish`, `--trust-plugin`,
`--allow-tools`, `--mocks record|off`, `--scaffold`, `--keep-temp`, `--verbose`; plus `claude plugin eval init`.
Eval cases live in `<eval dir>/**/case.yaml` (or `prompt.md` + `graders/*.md`), default dir `evals/`.
There is **no `claude plugin test`** subcommand.

---

## Gaps and workarounds

| Gap | Workaround |
|---|---|
| **No USD figure per subagent.** The Agent tool result gives `totalTokens`/`usage`/`resolvedModel` but no cost; `modelUsage` is tree-wide. | Price it yourself: take each subagent's transcript `.message.usage` (dedupe by `.message.id`), multiply by the rate for `.message.model`. Cross-check the sum against `result.total_cost_usd`. Or assign distinct models per agent role so `modelUsage` becomes a per-role breakdown. Alternatively use OTEL `claude_code.cost.usage` filtered on `agent.name`, accepting that user-defined agent names are redacted to `custom`. |
| **`agent.name` / `plugin.name` redaction in OTEL** for user-defined agents and third-party plugins. | Attribute from the transcript tree instead (`meta.json.agentType` is the real name), or give each maestro agent a distinct `model`/`effort` so the surviving attributes still separate them. |
| **No `--max-turns` flag** on 2.1.276. | Cap per agent with `maxTurns` in agent frontmatter / `--agents` JSON, and cap the whole run with `--max-budget-usd`. Detect the cap from the partial-output marker in the Agent result and, for the session, from the `error_max_turns` / `error_max_budget_usd` result subtypes. |
| **No file exporter for OTEL.** | `OTEL_*_EXPORTER=console` plus redirection of the process's output to a log file, with export intervals dropped to ~1 000 ms; or run a local `otel-collector` writing to a file. Console output interleaves with `-p` output → keep the data channel on stdout (`--output-format json`) and telemetry on stderr, or use the collector. |
| **`cost-state`, `turn_duration`, `stop_hook_summary`, `subagent_stats`, `agent-*.meta.json` are undocumented.** | Pin the harness to a Claude Code version, assert the fields exist at harness start-up, and fall back to the documented `result.*` fields when a field is missing. Record `version` (present on every transcript entry) with every measurement. |
| **Per-tool wall time is not in the transcript.** Only some tools record `durationMs` in `toolUseResult` (WebFetch, search); Bash does not. | Either OTEL `claude_code.tool_result.duration_ms` (documented, no beta flag), or compute deltas from `PreToolUse`/`PostToolUse` hook wall-clock keyed on `tool_use_id`, or derive from the `timestamp` of the assistant `tool_use` entry vs the paired `user` tool-result entry (coarse: includes permission wait). |
| **Human interruption count has no first-class field.** | Combine `result.permission_denials[]`, `Notification`(`permission_prompt`, `agent_needs_input`) hook counts, OTEL `tool_decision.source ∈ user_*`, and the `[Request interrupted by user]` transcript markers. In a headless eval run the right answer is usually zero-by-construction (`--permission-mode` + `--permission-prompts none`), and any non-zero denial count is itself the metric. |
| **`result.usage` excludes subagents** — easy to under-report by an order of magnitude in an orchestrated run. | Never use `result.usage` for totals; use `modelUsage` (and `total_cost_usd`). |
| **Per-message `output_tokens` is a placeholder.** | Read output tokens from `result.usage`/`modelUsage`, or from `message_delta` stream events with `--include-partial-messages`. |
| **Retry counts are stream-only.** | Run with `stream-json` and tee the stream; or post-hoc count `system/api_error` transcript entries and use `cost-state.totalAPIDuration - totalAPIDurationWithoutRetries` as a retry-time proxy. |
| **Subagent transcripts are garbage-collected** after `cleanupPeriodDays` (default 30). | Copy the whole `<session>/` directory into the eval artifact folder at the end of every run. |
| **`total_cost_usd` is an estimate**, and `[1m]`-suffixed or unrecognised models can price as `unknown` (`costBasis`, `hasUnknownModelCost`). | Assert `hasUnknownModelCost == false` / `costBasis != "unknown"`; otherwise apply your own price table to `modelUsage` token counts. Never compare runs across a Claude Code upgrade without re-baselining. |
| **A plugin can silently fail to load**, invalidating a whole arm of an experiment. | Gate every run on `system/init.plugin_errors` being absent/empty and `plugins[]` containing `maestro`; run `claude plugin validate --strict` in CI beforehand. |

---

## Recommended capture strategy for the maestro eval harness

### Mechanism per metric (one primary, one cross-check)

| Metric | Primary | Cross-check |
|---|---|---|
| USD total | `result.total_cost_usd` | `cost-state.totalCostUSD`; own pricing of `modelUsage` |
| USD / tokens per model | `result.modelUsage` | sum of transcript `.message.usage` grouped by `.message.model` |
| Wall-clock | `result.duration_ms` | the harness's own stopwatch around the child process |
| API time / retry time | `result.duration_api_ms` | `cost-state.totalAPIDuration(WithoutRetries)` |
| Agents spawned | `result.subagent_stats.spawned` | number of `subagents/agent-*.jsonl` files |
| Agent tree / depth | `agent-*.meta.json` (`parentAgentId`, `spawnDepth`, `toolUseId`) | `parent_tool_use_id` chain in the stream |
| Per-agent tokens / duration / tool count / model | Agent tool result `toolUseResult` | subagent transcript replay |
| Tool calls (count, names, success) | transcript `tool_use` + paired `toolUseResult` | OTEL `claude_code.tool_result` |
| Per-tool latency | OTEL `claude_code.tool_result.duration_ms` | `PostToolUse` hook timestamps keyed on `tool_use_id` |
| Retries | `system/api_retry` stream events | transcript `system/api_error` entries |
| Human interruptions | `result.permission_denials` + `Notification` hook counter | `[Request interrupted by user]` markers |
| Turns | `result.num_turns` | `system/turn_duration.messageCount` |
| Lines changed | `cost-state.totalLines*` | per-agent `toolStats.lines*` + `git diff --numstat` |
| "maestro was active" | `system/init.plugins` / `plugin_errors` | `attributionPlugin` on subagent entries |

Keep OTEL as the *behavioural* channel (per-tool latency, decisions, retries in near-real-time) and the transcript plus
headless result as the *accounting* channel. Do not try to reconcile OTEL cost counters with `total_cost_usd` to the cent —
they come from the same estimates but are aggregated differently.

### Run procedure sketch

```powershell
# 0. preflight (once per harness version)
claude --version                                  # pin: expect 2.1.276
claude plugin validate .\plugins\maestro --strict
claude plugin details maestro                     # projected token cost of the plugin itself

# 1. per case: isolated workspace + fixed session id
$case      = "refactor-auth"
$runId     = [guid]::NewGuid().ToString()
$work      = "C:\eval\work\$runId"                # git worktree or fresh clone of the fixture repo
$artifacts = "C:\eval\runs\$runId"
New-Item -ItemType Directory -Force $artifacts | Out-Null

# 2. telemetry: console exporter, fast flush, no network dependency
$env:CLAUDE_CODE_ENABLE_TELEMETRY = "1"
$env:OTEL_METRICS_EXPORTER        = "console"
$env:OTEL_LOGS_EXPORTER           = "console"
$env:OTEL_METRIC_EXPORT_INTERVAL  = "1000"
$env:OTEL_LOGS_EXPORT_INTERVAL    = "1000"
$env:OTEL_RESOURCE_ATTRIBUTES     = "eval.run_id=$runId,eval.case=$case,eval.arm=with_maestro"
# bound the agent tree so a runaway run cannot dominate the budget
$env:CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH = "2"
$env:CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS = "6"

# 3. the run itself: headless, streamed, hook events included, budget-capped
$sw = [Diagnostics.Stopwatch]::StartNew()
claude -p (Get-Content ".\cases\$case\prompt.md" -Raw) `
  --session-id $runId `
  --output-format stream-json --verbose --include-hook-events --forward-subagent-text `
  --plugin-dir .\plugins\maestro `
  --model opus --permission-mode acceptEdits --permission-prompts none `
  --allowedTools "Read,Grep,Glob,Edit,Write,Bash,Agent" `
  --max-budget-usd 5 `
  --add-dir $work `
  2> "$artifacts\otel-console.log" | Tee-Object "$artifacts\stream.jsonl" | Out-Null
$sw.Stop()

# 4. harvest
#    a. result line -> the accounting record
Get-Content "$artifacts\stream.jsonl" |
  Where-Object { $_ -match '"type":"result"' } |
  Set-Content "$artifacts\result.json"
#    b. init line -> proof the plugin loaded (fail the case if plugin_errors is non-empty)
#    c. the whole transcript tree, before cleanupPeriodDays eats it
$slug = "C--eval-work-$runId"        # derive from $work: drive colon and separators -> '-'
Copy-Item -Recurse "$env:USERPROFILE\.claude\projects\$slug" "$artifacts\transcripts"
#    d. code outcome
git -C $work diff --numstat | Set-Content "$artifacts\numstat.txt"
```

Then reduce, per run, into one flat record:

- from `result.json`: `total_cost_usd`, `modelUsage`, `duration_ms`, `duration_api_ms`, `num_turns`,
  `subagent_stats`, `permission_denials`, `is_error`, `subtype`
- from `stream.jsonl`: count of `system/api_retry` grouped by `error`, count of `Agent` `tool_use` blocks, hook
  `hook_started`/`hook_response` pairs, the `parent_tool_use_id` tree
- from `transcripts/`: last `cost-state` entry, the `turn_duration` series, per-subagent `agent-*.meta.json` plus the
  matching `toolUseResult` metrics, per-message `usage` grouped by model (deduped by `.message.id`)
- from `otel-console.log`: `tool_result` durations and `tool_decision` sources
- from the harness: wall-clock (`$sw.Elapsed`), `numstat`, and the case's own correctness graders

Design notes:

- **Fixed `--session-id`** is the single join key across the result JSON, the transcript directory name, hook payloads and
  OTEL `session.id`. Do not let Claude Code generate it.
- **Two arms per case** (with and without the maestro plugin) using the *same* prompt and the same seed workspace; that is
  the only way the cost numbers mean anything. `claude plugin eval --ablation with-without` already implements exactly this
  pattern — strongly consider running maestro's behavioural graders through `claude plugin eval --json` and keeping a custom
  harness only for the cost/telemetry side that `plugin eval` does not record.
- **At least 3 runs per case** (`plugin eval` defaults to `case.runs ?? 3`); agent-tree size varies a lot run to run on Opus 5.
- **`--bare` deliberately not used**: it skips plugin sync and hooks, which is exactly what is being measured. For a hermetic
  baseline arm prefer `--safe-mode` or a narrowed `--setting-sources`, and record which one was used.
- Run cases **sequentially** (or with a small `-j`) — parallel runs share one rate limit and will pollute `duration_api_ms`
  and the retry counts.

---

## Sources

Official docs, all accessed **2026-09-18**:

- Hooks reference — https://code.claude.com/docs/en/hooks (event list, payload fields, exit codes, env vars, timeouts)
- Monitoring usage / OpenTelemetry — https://code.claude.com/docs/en/monitoring-usage (env vars, metrics, events, traces beta, console exporter)
- CLI reference — https://code.claude.com/docs/en/cli-reference (flags, stream-json examples)
- Run Claude Code programmatically (headless) — https://code.claude.com/docs/en/headless (`--output-format`, `system/init`, `system/api_retry`, `permission_denials`, subagent message forwarding, background-task exit behaviour)
- Track cost and usage — https://code.claude.com/docs/en/agent-sdk/cost-tracking (`total_cost_usd`, `modelUsage`/`model_usage`, `usage` excludes subagents, placeholder `output_tokens`, crash recovery, `costBasis`)
- Subagents (Claude Code) — https://code.claude.com/docs/en/sub-agents (frontmatter incl. `model`/`maxTurns`, foreground vs background, spawn depth, concurrency limit, subagent transcript path, Agent tool result contents)
- Subagents in the SDK — https://code.claude.com/docs/en/agent-sdk/subagents (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`, `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`, `maxBudgetUsd`, `error_max_budget_usd`, Agent-vs-Task tool naming, `parent_tool_use_id`)
- Manage costs — https://code.claude.com/docs/en/costs (`/usage` Session block, prompt-cache line, `modelPricing`, `/insights`, OTEL as the only per-user streaming option)
- Referenced but not usable via fetch: https://code.claude.com/docs/en/agent-sdk/typescript (`SDKResultMessage`, `ModelUsage`) — the page's type tables did not render through the fetch tool; result-field names were instead verified against the shipped binary (below).

Local verification notes (Windows 11 Enterprise 26200, all read-only):

- `claude --version` → `2.1.276 (Claude Code)`; binary at `C:\Users\lregazzi\.local\bin\claude.exe`.
- `claude --help`, `claude plugin --help`, `claude plugin eval|validate|details --help` — flag and subcommand inventory above; `--max-turns` confirmed absent from help output, `--max-budget-usd` and `--include-hook-events` confirmed present; no `plugin test` subcommand.
- Transcript inspection with `jq` over `~/.claude/projects/**` (38 project directories): entry `type` census, `system` subtype census, `cost-state` shape, `turn_duration` shape, `stop_hook_summary` key list, the Agent-tool `toolUseResult` metric block, the subagent directory layout, `agent-*.meta.json` shape, `isSidechain` distribution (79 753 main-file entries, all `false`; 55/55 `true` in a sampled `agent-*.jsonl`), and per-message `usage` key sets. Nothing beyond field names and the anonymised sample above was extracted.
- Result-schema field names confirmed by string inspection of `claude.exe` (embedded zod schema fragments): `duration_ms`, `duration_api_ms`, `ttft_ms`, `ttft_stream_ms`, `time_to_request_ms`, `first_content_frame_ms`, `is_error`, `api_error_status`, `api_error_code`, `num_turns`, `result`, `stop_reason`, `total_cost_usd`, `usage`, `modelUsage`, `subagent_stats` (with `spawned`, `requested.{background,foreground,unset}`, plus spawn-by-type and deepest-spawn breakdowns), `permission_denials`, `queued_turn_count`, `structured_output`; statusline payload `session.{total_cost_usd,total_api_duration_ms,total_duration_ms,total_lines_added,total_lines_removed,model_usage}`; presence of the `error_max_turns` and `error_max_budget_usd` result subtypes.
- Working attribution example read: `C:\Git\Iconsulting\iconsulting-skill\plugins\orchestrate\hooks\context-guard.mjs` — it tail-reads `transcript_path` (512 KB window), finds the entry whose `message.content[]` contains a `tool_use` with `id == hook.tool_use_id`, sums `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` from that entry's `message.usage`, falls back to the last non-`isSidechain` assistant entry when `tool_use_id` is absent, and keys per-window state on `agent_id` (subagent) or `session_id` (main). This is the reference pattern for per-agent attribution from a classic hook.
