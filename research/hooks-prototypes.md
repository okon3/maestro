# Hooks / context / usage prototypes (point A2)

Date: 2026-11-06. Claude Code 2.1.319, Windows 11, Git Bash. Subscription type reported by `claude auth status`: enterprise (claude.ai login).
Lab repo: `E:\Projects\maestro-lab\hooks\` (git repo, commit 242b6ec). Nothing outside the lab was modified except this file.

Lab files:
- `context-usage.mjs`: transcript -> context size (exported `contextUsage(path, windowOverride)` + CLI).
- `hook.mjs`: one handler for all hook events. Logs every hook stdin to `logs/hooks.jsonl` and implements the warning, PreCompact instructions and SessionStart(compact) re-injection.
- `statusline.mjs`: dumps statusline stdin to `logs/statusline.jsonl`.
- `.claude/settings.json`: project hooks (UserPromptSubmit, PostToolUse, Stop, PreCompact, PostCompact, SessionStart, SubagentStart, SubagentStop, StopFailure, SessionEnd) + statusLine. `.claude/agents/{l1,l1b,l2}.md`: nesting test agents. `.maestro/handoff.md`: handoff test file.
- `results/`: raw outputs of the runs (run1..run7, hook logs).

Practical gotchas found on the way:
- Project-level `.claude/settings.json` hooks DO run in `claude -p` (no trust prompt in this setup).
- Git Bash mangles a leading `/compact` into `C:/Program Files/Git/compact`. Use `MSYS_NO_PATHCONV=1` (or PowerShell) when passing slash commands to `claude -p`.
- `claude -p` without `</dev/null` waits 3 s for stdin. Always redirect stdin.
- `claude usage` / `claude status` are NOT subcommands: they are sent to the model as a prompt (cost a model call). Don't run unknown words as subcommands.
- `--permission-mode bypassPermissions` with custom agent creation was refused by the auto mode classifier ("Create Unsafe Agents"). Use `--allowedTools "Bash(sleep:*)" "Agent"` instead.

---

## 1. Context usage from the transcript

Verdict: WORKS (fast, accurate to within ~0.5% vs `/context`). One caveat: the window size is not in the transcript.

Data findings (transcripts are JSONL; `type:"assistant"` lines carry `message.usage` and `message.model`, `isSidechain`):
- Formula: `context = input_tokens + cache_read_input_tokens + cache_creation_input_tokens` of the LAST main-chain assistant message. This equals the prompt size of that request. `output_tokens` are not in the request that produced them; they will be in the next request's input, so adding them only anticipates the next turn (adds 0.1% here). Matches the statusline doc ("input only, no output").
- Streamed assistant messages appear as several lines with the same usage; reading the last one is fine.
- Skip `isSidechain:true` lines and `model:"<synthetic>"`.
- After a compaction the transcript has a `system` line with `subtype:"compact_boundary"` and `compactMetadata.preTokens`. Until the next assistant message arrives, the last usage is stale. The script returns `{postCompactNoUsageYet:true, preCompactTokens}` in that case.
- Window size is NOT stored in the transcript (checked: no `contextWindow`, model id is `claude-opus-5-5` without `[1m]`). Where to get it:
  - `claude -p --output-format json` result: `modelUsage.<model>.contextWindow` (observed `1000000` for opus-5-5). Same field is in the SDK result.
  - `/context` output: `Tokens: 27.9k / 1m (3%)`.
  - statusline JSON `context_window.context_window_size` (documented; not run headless).
  - `SessionStart` hook input has `model` (only), so a plugin would need a model->window table or a user config.
  - The script uses: `--window` arg > env `MAESTRO_CONTEXT_WINDOW` > heuristic (context already >200k => 1M) > 200k. The heuristic is WRONG for small contexts on a 1M model (it reported 13% instead of 2.6% on this account's opus-5-5). Recommendation: keep an explicit config value `contextWindow` (default 1000000 for Opus 5.5 on this account) in the plugin; optionally learn it from the `contextWindow` field of the json result.

Commands and output (real transcripts, read-only):
```
node context-usage.mjs ...\E--Projects-Agriturismo\ae65c8c9-....jsonl   (22 MB)
{"model":"claude-opus-5-5","contextTokens":535714,"outputTokens":804,"window":1000000,"percent":53.57,...,"scannedBytes":262144}
node context-usage.mjs ...\8a1b0452-....jsonl     -> contextTokens 414692, 41.47%
node context-usage.mjs ...\fd64699b-....jsonl     -> contextTokens 278160, 27.82% (this very session)
```
Validation vs `/context` (headless `MSYS_NO_PATHCONV=1 claude -p "/context" --resume <id>` on the lab session):
`/context` = `27.9k / 1m (3%)`; script = `27802` tokens (2.78%). Match. (`/context` also lists "Autocompact buffer 33k" separately; it is not counted in the 27.9k.)
Also: json result `usage` of run 1 = 11388+15072+2 = 26462; script on the transcript = 26462. Exact.

Runtime: 22 MB transcript = 69 ms wall time including Node startup (reads only the last 256 KB chunk; reads further backwards in 256 KB chunks if needed). Fine for a hook.

Recommendation: ship `context-usage.mjs` as a plugin script (`${CLAUDE_PLUGIN_ROOT}/scripts/`), with the window from plugin config, and the post-compaction case handled.

---

## 2. Hook injection of a warning

Verdict: WORKS. The model receives the warning both on UserPromptSubmit and PostToolUse.

Setup: hooks `UserPromptSubmit` and `PostToolUse` -> `node hook.mjs`; above `MAESTRO_THRESHOLD_PCT` (default 1) the script prints
`{"hookSpecificOutput":{"hookEventName":"<event>","additionalContext":"MAESTRO CONTEXT WARNING [code ZEBRA-7731]: ..."}}`.
Command:
```
claude -p "First run the bash command 'echo hello'. Then repeat verbatim every hook-provided warning mentioning MAESTRO ..." --resume <session> --output-format json </dev/null
```
Observed (trimmed): the model quoted two warnings, "Before the tool call (UserPromptSubmit)": `MAESTRO CONTEXT WARNING [code ZEBRA-7731]: context window is 13.23% full (26462/200000 tokens)...` and "After the tool call (PostToolUse:Bash)": `... 13.33% full (26652/200000 ...)`. The hook sees the transcript including the previous turn's usage (the 2nd value had grown by the tool turn), so `transcript_path` is fresh enough at PostToolUse. On the very first prompt of a new session no assistant message exists yet -> `{error:"no assistant usage found"}` (script emits nothing).
Hook input keys: `session_id, transcript_path, cwd, prompt_id, permission_mode, effort, hook_event_name` (+ `agent_id`, `agent_type` inside subagents; I skip the warning when `agent_id` is set so only the PM session is warned). In later runs the model kept receiving the warning at every tool call (it is re-injected each time: add a rate limit, e.g. only when crossing a new 5% band, tracked in a state file keyed by session_id, to avoid noise and token cost).

Recommendation: PostToolUse + UserPromptSubmit hooks calling the script; thresholds e.g. 50% (advise), 70% (write handoff now), 85% (compact now), each warned once per band per session; state in `${CLAUDE_PLUGIN_DATA}`. The warning text should include the exact next action (which file to write, which command to ask the user/PM tool to run).

---

## 3. Guided compaction (PreCompact + SessionStart source=compact)

Verdict: WORKS, including headless triggering.

Trigger: `MSYS_NO_PATHCONV=1 claude -p "/compact keep only the fact that the user asked to echo hello" --resume <session> --output-format json </dev/null` (the slash command is executed in `-p` when it is the prompt; result text is empty). Without `MSYS_NO_PATHCONV` the text reached the model as a prompt and no compaction ran.
Hook order observed in `logs/run3-hooks.jsonl`:
1. `SessionStart` source `resume` (with `seconds_since_last_response`, `context_tokens`, `prompt_cache_likely_expired`, `estimated_cache_write_usd`)
2. `PreCompact` `{"trigger":"manual","custom_instructions":"keep only the fact ..."}`
3. `SubagentStop` (the compaction runs through an internal agent; its `agent_transcript_path` is under `subagents/`; this event will also appear in Maestro SubagentStop logs: filter by `agent_type`)
4. `SessionStart` `{"source":"compact","model":"claude-opus-5-5"}`
5. `PostCompact` `{"trigger":"manual","compact_summary":"<analysis>...<summary>..."}`
- PreCompact stdout (plain text "preserve the secret marker PINEAPPLE-42 ...") was honoured: the summary text contains `PINEAPPLE-42` and discusses it.
- SessionStart(compact) hook returned `additionalContext` with the contents of `.maestro/handoff.md` (codeword KUMQUAT-99). In a following `--resume` run asking "quote any MAESTRO HANDOFF text" the model replied with the exact text and `KUMQUAT-99`. So the re-injected text persists in the post-compaction context.
- Transcript: `compact_boundary` system line (`compactMetadata.trigger/preTokens/preservedSegment`) then `isCompactSummary` user message. After compaction context was 27.8k (from 27.97k; tiny session, so no size benefit, but flow verified).
- `custom_instructions` of `/compact` and PreCompact stdout are both used. `trigger` distinguishes manual/auto.
Limitation: auto-compaction was not triggered (would need ~900k tokens). Documented to fire the same hooks with `trigger:"auto"`.

Recommendation: PM writes `.maestro/handoff.md` (state, in-flight tasks/agent ids, next step) when warned; PM (or the user/orchestrator via a `claude -p "/compact <focus>" --resume <id>` against a stopped session) compacts; PreCompact prints the standing preservation rules; SessionStart(compact) injects the handoff (cap 10,000 chars). Also consider `SessionStart` matcher `startup|resume|clear|compact` so the same re-injection works after `/clear`. A running Paseo session can't be given `/compact` by a hook; that must be sent by Paseo (send_agent_prompt "/compact ..." as a user message to the agent) or typed by the user.

---

## 4. Nested sub-agents (level 2) and notifications

Verdict: WORKS, with an important rule: a level-1 agent receives the level-2 background completion only if it is still running; if it ends its turn first, the notification goes to the root session.

Setup: agents `l1`, `l1b` (level 1) and `l2` (level 2, tools: Bash) in `.claude/agents/`. Root run: `claude -p "Use the Agent tool to launch subagent_type 'l1[b]' in the FOREGROUND ..." --output-format json --allowedTools "Bash(sleep:*)" "Agent" </dev/null`.

Run A (`l1` "launch l2 in background and wait for the notification", no way to block): l1 launched l2 (`run_in_background`), then ended its turn immediately ("level-2 agent is running in the background"). `SubagentStop` for l1 fired at 13:23:00, 23 s before l2 finished. When l2 finished, the notification reached the ROOT session as a new turn (a `UserPromptSubmit` hook fired with prompt `<task-notification><task-id>...<status>completed</status><summary>Agent "..." finished</summary>...`, containing the result), and the root reported `LEVEL2-RESULT-5521`. l1 never got it.

Run B (`l1b`: launches l2 in background then keeps working by calling `sleep 6` repeatedly): l1b received the notification while running ("right after my 3rd sleep call, ~18 s in") and reported the exact result `LEVEL2-RESULT-8842`. The l1b transcript `subagents/agent-<id>.jsonl` contains the `<task-notification>` (5 matches); the l2 transcript has none. `subagent_stats` in the json result: `spawned 2, max_depth 2, spawned_by_subagents 1, started_in_background 1`.

Hooks (`results/run5-hooks.jsonl`, run 6 log): SubagentStart and SubagentStop fire for level-2 agents too, with `agent_id` and `agent_type` (`l1b` then `l2`):
```
SubagentStart aa761335df09144e1 l1b
SubagentStart aa8961b8db2c515cd l2
SubagentStop  aa8961b8db2c515cd l2   (result in last_assistant_message)
SubagentStop  aa761335df09144e1 l1b
```
SubagentStop fields: `session_id, transcript_path, cwd, prompt_id, permission_mode, agent_id, agent_type, effort, stop_hook_active, agent_transcript_path, last_assistant_message, background_tasks, session_crons`. No parent id field: nesting must be reconstructed from event order or the `subagents/` transcripts. PostToolUse inside a subagent has `agent_id/agent_type`. `transcript_path` in subagent events is the ROOT session transcript, so a context check in a subagent hook would measure the PM, not the agent (use `agent_transcript_path` on SubagentStop, or skip when `agent_id` is set).

Recommendation: team-lead sub-agents that delegate to level-2 workers should either (a) launch them in the foreground (blocks; result comes back directly), or (b) launch them in the background and stay busy/wait with a bounded loop (e.g. `Bash sleep N` polling for notification), or (c) end their turn and let the root PM receive the completion notification (in that case tell the PM). Do not instruct a level-1 agent to "wait" without a blocking action: it will simply finish. Also the tool result note says "the user can send it another message and re-activate the agent" (SendMessage), so (c) can be combined with resuming l1 by SendMessage.

---

## 5. Usage / rate limits

Verdict: PARTIALLY. A non-Paseo, non-interactive source exists: the `rate_limit_event` messages in `claude -p --output-format stream-json --verbose`. Statusline and CLI subcommands do not provide it headlessly.

- Statusline in headless: configured `statusLine` command (dump of stdin) was NOT executed in any `-p` run (no `logs/statusline.jsonl` after 10+ runs, in json and stream-json mode). The stream only contains `system/ui_status` with `plugin:"project-statusline"`, `text:null`. So the statusline script only runs in interactive/TUI sessions (documented fields `rate_limits.five_hour/seven_day.used_percentage/resets_at` were not verifiable here, and the docs say only for Pro/Max; this account is `enterprise` per `claude auth status`).
- CLI subcommands (`claude --help`): agents, attach, auth, auto-mode, doctor, gateway, import, install, logs, mcp, plugin, purge, respawn, rm, setup-token, stop, ultrareview, update. No `usage`/`status` subcommand. `claude auth status` gives login info only (no usage).
- Stream-json (OBSERVED, run7, enterprise login) the CLI itself emits per run:
```
{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","resetsAt":1793988600,"rateLimitType":"five_hour","overageStatus":"rejected","overageDisabledReason":"org_level_disabled","isUsingOverage":false,
 "unifiedWindows":{"five_hour":{"utilization":0.04,"resetsAt":1793988600,"status":"allowed"},"seven_day":{"utilization":0.58,"resetsAt":1794013200,"status":"allowed"}}}, ...}
```
  `utilization` is a 0..1 fraction (here 4% of the 5h window and 58% of the weekly window). It appeared right after the first assistant message of a minimal run (cost: one trivial `claude -p "Reply OK"` call). This is client output from the official CLI, not a private API call. It is not shown in `--output-format json` (single result object). I did not find it in the docs I have (`claude-code-capabilities.md` only mentions `system/api_retry`), so treat the schema as undocumented/unstable.
- `StopFailure` hook: configured; could not be triggered (no rate limit hit); documented to fire with `error:"rate_limit"` on rate-limit-terminated turns. Not verified.
- `/usage` in headless was not tried (interactive command; I avoided it).

Recommendation: for the Maestro plugin, a tiny "usage probe" script that runs `claude -p "Reply OK" --output-format stream-json --verbose </dev/null --model <cheapest>` and extracts the last `rate_limit_event` gives 5h/7d utilization and reset times without Paseo (costs a few thousand tokens; run rarely, e.g. at wave boundaries; use `--no-session-persistence` and a cheap model to limit cost; note the probe may itself write a transcript otherwise). Additionally, if the PM runs inside Paseo/SDK, the same `rate_limit_event` message likely flows through the SDK stream (not verified; check Paseo). If the user also uses an interactive session, a statusline script can write `rate_limits`/`context_window` to `.maestro/state/usage.json` (documented, only works interactively and may be absent for enterprise). Add a `StopFailure` hook that records `rate_limit` stops and the reset time so the orchestrator knows to pause.

---

## Summary table

| # | Experiment | Verdict |
|---|---|---|
| 1 | Context % from transcript | Works; 69 ms on 22 MB; matches `/context`; window must be configured (not in transcript) |
| 2 | additionalContext warning | Works (UserPromptSubmit and PostToolUse); need once-per-band throttle |
| 3 | PreCompact / SessionStart(compact) | Works; headless `/compact` works (watch Git Bash path mangling) |
| 4 | Nested sub-agent notifications | Works if the level-1 agent stays alive; otherwise goes to root; Subagent hooks fire at level 2 with agent_id/agent_type |
| 5 | 5h/weekly usage | Partial: `rate_limit_event` in stream-json yields 5h/7d utilization; statusline never runs headless; no CLI usage subcommand |
