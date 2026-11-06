# 06 — Claude Mods / Function Hooks

Research ticket for **maestro** (Claude Code orchestrator plugin). Accessed 2026-09-18.

Evidence is tagged: **[doc]** official documentation, **[src]** read in repo source,
**[local]** verified on this machine, **[inf]** inferred, **[thread]** maintainer statement in the issue thread.

---

## Summary

**Verdict: usable now behind a flag — `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`, on the installed Claude Code 2.1.276 (Windows 11). Not documented, not announced, API explicitly unstable.**

- "Claude Mods" is the product name; **function hook** is the primitive. A mod is an ordinary plugin whose `hooks/hooks.json` names a `modules` entry pointing at a `.ts`/`.tsx` file. **[src]**
- The model is Koa/Express middleware: `register(on, options)` registers hooks `($, e, next)`; registration order is nesting; five tiers `prepend → user → append → builtin → core`. **[src]**
- `$` is the *only* door — no ambient `fs`/`net` in the plugin realm; every method on `$` is a hookable event, and every event is a method on `$`. **[src] [thread]**
- 33 hookable engine events + ~50 op events + `classic.*` wrappers over today's shell hooks + `*` wildcard. **[src]**
- **Verified locally on 2.1.276:** `claude plugin validate` performs static side-effect analysis (unconditionally); `claude plugin test` runs real hook tests (flag-gated). **[local]**
- **Verified locally:** a `user`-tier mod can **deny** an `agent.spawn`, **rewrite the model** on it, and capture **per-agent token usage** at `turn.complete`. This is the core of what maestro needs. **[local]**
- Zero official documentation: `code.claude.com/docs/en/hooks` documents only the 33 classic string-event hooks; no page mentions mods, function hooks, or `modules`. **[doc]**
- Zero CHANGELOG entries across 7063 lines — the feature has never shipped in a released version note. **[src]**
- Anthropic's own `$.telemetry` mod is **internal builds only**; maestro cannot depend on it. **[src]**
- Timeline: "shipping in N weeks" as of 2026-09-09; issue still open, 197 comments, last maintainer reply 2026-09-16. **[src]**

---

## Programming model (`register` / `on` / `$` / `next`)

A hooks-module exports exactly one function. Its signature **[src]**
(`mods/types/claude-code.d.ts`):

```ts
export type Register = (on: On, options: PluginOptions) => unknown
export type HooksModule = { register: Register }
export type PluginOptions = Readonly<Record<string, string | number | boolean | readonly string[]>>
```

`options` comes from the existing plugin-level `userConfig` mechanism — no new config layer. **[src]**

Verbatim from the architecture PDF (Listing 1), the canonical example:

```ts
export function register(on) {
  on("tool.call", ($, e, next) => {
    if (e.tool === "Bash" && e.command == "rm -rf /")
      return { deny: "Destructive command blocked by hook" }
    return next(e)
  })
}
```

**`next` composition.** Hooks fold as `on(X,A), on(X,B), on(X,C)` → `X = A(B(C()))`. Earlier
registration = outer = more authority. Five placements are expressible with plain promise
rules **[src, PDF §2.2]**:

| placement | form |
| --- | --- |
| before | `$.ui.log(...); return next(e)` |
| after | `const r = await next(e); …; return r` |
| during | `const p = next(e); …; return p` (floating) |
| instead | `return { deny: "no tools allowed" }` (never call `next`) |
| modifying | `return next({ ...e, timeout: 30 })` |

`next` is frozen, built once per dispatch per hook, and carries dispatch-scoped facts that
cannot be read through `$` without regress **[src]**:

```ts
readonly to:     (e, tier: TargetTier) => Promise<…>  // skip tiers; managed tiers only
readonly signal: AbortSignal                          // fires when the chain returns/cancels
readonly is:     (pattern, e) => e is …               // type predicate, for hooks on '*'
readonly event:  N                                    // this event's name
readonly origin: { plugin: string; tier: Tier }       // who raised this dispatch
readonly trace:  readonly TraceEntry[]                // per-link plugin, tier, ms, in/out
```

`TraceEntry` is the observability jackpot: `{ index, plugin, tier, event, outcome, reason?, ms, chunks?, received, returned }`. **[src]**

**Matchers.** `on(event, matcher, hook)` takes a partial of `e`, matched substructurally
(object = all keys match; array = any element matches; else equality), and narrows `e`.
`on('tool.call', { tool: 'Bash' }, …)`, `on('ui.render', { component: 'Pane' }, …)`. **[src]**

**Streaming.** `turn.step` is the only streaming event; its hook is an async generator over
`TurnStepChunk`. **[src] [thread]**

**Recursion.** A hook is never re-entered while its own frame is dispatching — the engine
skips it silently and runs every other hook. So a `prompt.submit` hook may call
`$.prompt.submit(...)` safely, and `*`-hooks still audit it. **[src, PDF §6.4]**

**Error semantics.** A hook that throws, exceeds its budget, or returns/passes the wrong
shape is **skipped** and the chain routes around it. **[local]** — observed verbatim:
`probe's turn.complete hook was skipped: probe: next() passed an argument with no { answer }`.
`on(...).catch(($, e, err) => …)` is the declared fail-closed spelling. **[thread]**

**Isolation.** A Bun Worker around the whole plugin realm, `node:vm` per plugin; the contract
is only "no ambients". p99 target ~50µs/hook. **[thread]**

---

## Event inventory

### Engine events (33) — hookable, payload → result

| event | payload fields | return / `next` semantics | source |
| --- | --- | --- | --- |
| `engine.create` | `EngineCreateInput` | returns the `$` table; `{...await next(e), myNoun}`. The one event **not** reachable as `$.noun.event` | d.ts, PDF §4.1 |
| `plugin.register` | `name, tier, root, version?, provenance, uses{events,calls,env{reads,writes}}` | `{allow:true}` \| `{refuse:string}` — gate which plugins may exist | d.ts |
| `session.start` | `cwd, surface, isInteractive` | `SessionStartResult` | d.ts |
| `session.receive` | `SessionReceiveInput` | `SessionReceiveResult` | d.ts |
| `session.compact` | `SessionCompactInput` | `SessionCompactResult` \| `SessionCompactSkipped` | d.ts |
| `session.attach` / `session.detach` | `SessionAttach/DetachInput` | corresponding result | d.ts |
| `turn.start` | `text, turnId` | `TurnStartResult` | d.ts |
| `turn.step` | `turnId, index, model, effort?, messageCount, agentId?` | **streaming**: `HookStream<TurnStepChunk, TurnStepResult>`; result has `answer, toolUses, stopReason, usage: TurnUsage\|null` | d.ts |
| `turn.complete` | `answer, durationMs, isAborted, turnId, agentId?, usage?, reason` | `{ text, usage? }` | d.ts |
| `tool.call` | `ToolCallEnvelope & { agentId? }` (tool, input, tool_use_id…) | `{result, context?, ref?, text?}` \| `{deny}` \| `{isError:true,…}`. **Not calling `next` is what prevents the tool running**; `deny` only tells the model | d.ts, thread |
| `tool.check` | `tool, input, tool_use_id?` | `{decision, reason?, rule?}` — permission check, parallelizable guard | d.ts |
| `tool.describe` | `ToolDescribeInput` | `ToolDescribeResult` | d.ts |
| `tool.register` | `Required<ToolSpec>` | `OpValue` \| `{deny}` | d.ts, sec-default |
| `tool.list` | `NoArgs` | `ToolInfo[]` | d.ts |
| `agent.offer` | `agent, description, source, provider: Origin` | `{ isOffered: boolean }` — controls whether an agent is offered at all | d.ts |
| `agent.spawn` | `tool_use_id, prompt, description, subagentType, provider, model?, parentModel, parentAgentId?, permissionMode?, background, fork, name?, cwd?` | `{model, agentId?}` \| `{deny}` | d.ts |
| `prompt.submit` | `text, attachments?, context?, turnId?, wait, origin` | `{text, context?, origin?}` \| `{drop: string}` | d.ts |
| `prompt.fill` / `prompt.suggest` | `PromptFill/SuggestInput` | corresponding result | d.ts |
| `prompt.section` / `prompt.context` | `PromptSection/ContextInput` | system-prompt sections / context blocks | d.ts |
| `skill.prompt` | `SkillPromptInput` | `SkillPromptResult` | d.ts |
| `attribution.text` | `AttributionTextInput` | `AttributionTextResult` | d.ts |
| `command.run` | `CommandRunInput` (command, args, origin, presentation) | `{ text? }` | d.ts, diff |
| `command.describe` | `CommandDescribeInput` | `CommandDescribeResult` | d.ts |
| `config.set` / `config.describe` | `ConfigSet/DescribeInput` | corresponding result | d.ts |
| `ui.render` | `component, props, surface, viewport, requestId` | `RenderElement` — rewrite props before, wrap/replace after | d.ts, PDF §3.2 |
| `ui.resolve` | `ResolveInput` | `ElementTable` — the surface's element constructors | d.ts |
| `ui.press` / `ui.input` / `ui.select` / `ui.message` | `plugin, element, component, …` | interaction results | d.ts |
| `ui.scroll` / `ui.focus` | `UiScroll/FocusInput` | corresponding result | d.ts |

`RenderComponent` union (the hookable drawings): `AskUserQuestion, UserMessage,
AssistantMessage, ToolUse, ToolResult, ToolGroup, CommandOutput, Spinner, TurnDuration,
InfoNotice, SessionMode, PromptHint, AbovePrompt, Pane`. **[src]** The internal permission-request
component is deliberately **not** hookable. **[thread]**

### Op events (~50) — every other `$` method is also hookable

`model.complete`, `model.classify`, `model.fork`, `audio.play`, `audio.speak`, `mcp.call`,
`session.{cwd,model,turns,id,messages,repo,surface,surfaces,authorize,usage}`, `turn.abort`,
`tool.list`, `tool.register`, `command.{list,register}`, `config.list`, `agent.list`,
`ui.{toast,status,log,notice,invalidate,open,close,blit}`, `fs.{read,write,list,exists,stat,ancestors}`,
`store.{get,set,delete,keys}`, `clock.{now,sleep,after,every}`, `http.fetch`, `process.run`,
`settings.read`, `env.{get,set}`. **[src]**

### Special patterns

| pattern | meaning | source |
| --- | --- | --- |
| `*` | every event, including nouns other plugins add; `e` is `unknown`, narrow with `next.is` | PDF §6.3 |
| `classic.<Event>` | wraps today's shell hooks 1:1 with identical in/out data (`classic.PreToolUse`, …). `ClassicHookEvent = HookInput['hook_event_name']` | d.ts, thread |
| `classic.*` | union of all classic hooks | sec-default |
| glob-ish (`tool.*`) | type-safe glob matching on `on` | thread |

---

## `$` affordances

`$` = `EngineInterface extends CoreEngineInterface`; plugins declaration-merge new nouns. **[src]**

| noun | methods | notes |
| --- | --- | --- |
| `plugin` | `name`, `root` (plain fields) | identity of the running plugin |
| `session` | `messages, cwd, model, turns, id, repo, surfaces, surface, usage, compact, authorize` | `usage() → { context: {tokens?, window, percent?, breakdown?}, rateLimits[], cost?: {usd} }` — **the context-threshold and cost primitive** |
| `turn` | `abort` | kill a runaway turn |
| `agent` | `spawn`, `list` | `list() → AgentInfo[] { id, description, type, status, parentId?, spawnedBy?, name? }` — the agent tree, with plugin attribution |
| `tool` | `list, call, check, register` | `check` = permission decision without executing |
| `command` | `list, run, register` | register real slash commands from a mod |
| `prompt` | `submit, fill, suggest` (+ `section`, `context` as events) | `submit` is prompts only; use `command.run` for commands **[thread]** |
| `model` | `complete, fork, classify` | `fork → { text, usage: {input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens} }` — own model calls, metered |
| `ui` | `notice, invalidate, blit, resolve, log, ask, toast, status, open, close, scroll, focus` | `open/close` = panes; `ask` = ask the human; `resolve` = surface element table |
| `fs` | `read, write, list, exists, stat, ancestors` | no ambient fs; admin-restrictable by hooking `fs.read` |
| `process` | `run(argv, init)` | the escape hatch to non-TS tooling **[thread]** |
| `http` | `fetch(url, init)` | remote log shipping / policy daemons |
| `store` | `get, set, delete, keys` | plugin-scoped KV persistence |
| `clock` | `now, sleep, after, every` | `after`/`every` return a cancellable `Timer`; mockable |
| `settings` | `read(args?)` | `{ source: 'policy' }` reads managed settings |
| `env` | `get, set` | statically enumerated by `validate` |
| `mcp` | `call(server, tool, args?)` | direct MCP invocation |
| `audio` | `play, speak` | |
| `telemetry` *(mod-provided)* | `log, mark` | **internal builds only** — absent on external builds, call throws **[src]** |

Adding a noun, verbatim from the architecture PDF (Listing 3):

```ts
on("engine.create", async ($, e, next) => {
  const below = await next(e)
  return { ...below, store: createStore(below) }
})
```

A step may **add** or **withhold** nouns but never **replace** one — changing what a method
does is a hook on that method. **[src, PDF §4.2]**

---

## Manifest, loading, testing, admin control

**Manifest.** No new plugin type. Beside any existing `command`/`prompt`/`agent`/`http`
hook entries, `hooks/hooks.json` gains one key **[src]**:

```json
{ "description": "…", "modules": ["./register.ts"] }
```

A mod that adds a noun points `plugin.json` at its type contract: `"types": "./types/index.d.ts"`
— a declaration file with no imports that exports the noun's types and declares it on
`EngineInterface`. **[src]** Extensions accepted: `.js`, `.ts`, `.jsx`, `.tsx`. **[src, PDF §1]**

**Loading and order.** `prepend` (admin) → `user` (installed, topo-sorted by declared
`dependencies`) → `append` (admin) → `builtin` (bundled mods) → `core`. Within a plugin,
registration order. **[src]** Run from source with `claude --plugin-dir mods/diff`. **[src]**
`/plugin-types` writes the `claude-code.d.ts` declarations into the authoring project and
lists every available `$` affordance when the flag is on. **[thread]**

**Validation.** `claude plugin validate <path>` refuses a module that touches `$` other than
as `$.noun.event(...)` (e.g. `$[expr]`), so side effects are statically determinable.
**[src] [thread]** — **[local]** on 2.1.276 this already emits the full analysis, *with the
flag off too*:

```
  > types ./types/index.d.ts declares on $: $.telemetry
  > ./register.ts hooks: engine.create
  > ./register.ts calls: $.env.get, $.http.fetch, $.session.authorize, $.session.id, $.session.model
  > ./register.ts env writes: nothing
  > ./register.ts env reads: CLAUDE_CODE_CUSTOM_OAUTH_URL, …
```

That analysis is exactly `PluginRegisterUses` on the `plugin.register` event — so an admin
plugin can gate registration on a declared side-effect set. **[src] [inf]**

**Test kit.** `claude plugin test [dir]` runs every `*.test.ts`/`*.test.tsx` under `dir`,
each file in a child of the binary, in an environment like the one hooks run in; imports
come from `claude-code/testing`. **[local, verbatim `--help`]** A test receives the engine's
own `$` and a plugin's `on`; hooks the test registers sit **beneath** the mod (where the
rest of the world would be) and an unanswered call throws, naming its event. `tier('user')`
declares which tier the mod loads in. **[src]**

`mock` answers the world beneath, noun by noun: `mock.env(on, vars)`, `mock.store(on, entries)`,
`mock.clock(on)` → `{ now, advance, set, settle, sleep }`. `$.ui.press({ plugin, key })`
presses a rendered `Button`. **[src]** Note: `mock.store` registers `store.*` hooks beneath the
mod; it does **not** put `.store` on the test's own `$` — assert with a spy hook on `store.set`.
**[local]**

**Admin control.** Managed settings stay a file; `prependPlugins` names the whole prepend
tier and the org places `sec-default@builtin` in it (or omits it). **[src]** Enforcement is
plugin order, not a new permission system:

- which plugins may exist → hook `plugin.register`, return `{refuse}`
- which nouns exist → hook `engine.create`, return fewer nouns than `next(e)` gave you
- audit everything → one prepended hook on `*` reading `next.origin` / `next.event`
- restrict a method → just hook the method (`fs.read`, `tool.call`, …)

`next.to(e, tier)` (skip tiers) is **refused outside a managed tier**, so `--plugin-dir`-loading
`sec-default` yields a plugin that can only pass. When several prepend plugins request
different skip targets, the engine takes the lowest. **[src] [thread]**

`sec-default` itself adds no policy — it only keeps an org's classic hooks, managed prompt
content, `settings.read`, MCP allowlist and managed tool/agent subjects out of the `user`
tier's reach, keyed on the pinned `e.provider.tier`, failing closed. **[src]**

---

## What maestro can enforce/measure with mods that classic hooks cannot

Classic JSON hooks **already cover**: block a tool before it runs (`PreToolUse` + exit 2 /
`permissionDecision`), react after (`PostToolUse`), inject prompt text
(`UserPromptSubmit`), observe subagent start/stop (`SubagentStart`, `SubagentStop`,
`TaskCreated`, `TaskCompleted`), session and compaction boundaries (`SessionStart`,
`PreCompact`, `PostCompact`, `Stop`, `SessionEnd`), model switches
(`PreModelSwitch`/`PostModelSwitch`). **[doc]** That is enough for "workers never commit"
(deny `Bash git commit` on `PreToolUse`) and for coarse run logging. It is out-of-process
(one shell spawn per event), sees JSON-on-stdin only, has no return channel richer than a
decision, and cannot draw.

Mods add, specifically:

1. **Intercept an Agent spawn and rewrite or deny it.** `agent.spawn` carries `subagentType,
   prompt, model?, parentModel, parentAgentId?, background, fork, cwd?, provider`. A hook can
   `{deny}` it, or `next({...e, model, prompt, cwd})` to *rewrite* it. **[local — verified: a
   `forbidden` subagentType was denied and never reached core; an allowed one was rewritten to a
   different model and core saw the rewritten value.]** Classic hooks can observe a subagent
   starting; they cannot rewrite its model, prompt, or cwd, nor deny it by type.
   → This is the enforcement point for *"lanes spawn only from a written brief"*: deny any
   `agent.spawn` whose `prompt` does not reference an existing brief path (checkable in-hook via
   `$.fs.exists`), and for *"hub lock"*: deny concurrent spawns by inspecting `$.agent.list()`.
2. **Deny an agent *type* before it is even offered.** `agent.offer → { isOffered: false }`
   removes a lane from the menu entirely. No classic equivalent. **[src]**
3. **Observe model per call, and attribute usage per subagent.** `turn.step` and
   `turn.complete` both carry `agentId?` plus `usage: TurnUsage = ModelForkUsage & { model }`
   — `input_tokens`, `output_tokens`, `cache_read_input_tokens`,
   `cache_creation_input_tokens`, and the resolved `model`. `turn.step` also carries `effort`.
   **[local — verified: a `turn.complete` hook captured `{model, 4 token counters}` for
   `agentId: 'sub-7'` and persisted it via `$.store.set`.]** Classic hooks get no token counts
   at all; this is the entire "tokens per model, per agent" requirement.
4. **Cost and context thresholds as a first-class read.** `$.session.usage()` returns
   `{ context: {tokens, window, percent, breakdown}, rateLimits[], cost: {usd} }`. A hook on
   `prompt.submit` or `turn.start` can read it and `{drop}` / `$.session.compact()` /
   `$.turn.abort()` above a threshold. Classic hooks have no usage or cost API. **[src]**
5. **Attribute *everything* to a causer.** `next.origin = { plugin, tier }` plus
   `next.trace[] = { index, plugin, tier, event, outcome, ms, received, returned }` gives a
   per-link, per-plugin, timed audit of the whole chain. One prepended `on('*')` is a complete
   cost/latency log, including every call other plugins make on `$`. **[src]**
   `AgentInfo.spawnedBy` names the plugin that started an agent; `parentId` gives the tree.
6. **Draw a cost pane.** `ui.open` + `on('ui.render', { component: 'Pane' })` renders a real
   pane beside the transcript, on terminal *and* desktop, with `Box/Text/Button/Select/Code`
   resolved from the surface — this is precisely how the built-in `diff` mod is implemented.
   `ui.press`/`ui.focus`/`ui.scroll` make it interactive. **[src]** Classic hooks cannot draw
   anything; at best they print to stdout.
7. **Enforce "workers never commit" structurally, not by string match.** A `tool.call` hook
   sees `agentId`, so the rule becomes "deny `git commit` when `e.agentId !== undefined`"
   rather than pattern-matching commands globally. `tool.call` also fires for tool calls made
   *inside* a subagent **[thread]**, and for MCP tools as well as built-ins **[thread]**.
   `tool.check` allows a guard to run *concurrently* with the rest of the chain.
8. **In-process, typed, ~50µs.** No shell spawn per event, full LSP/type narrowing on `e`,
   and a real test kit (`claude plugin test`) so the protocol is unit-testable — maestro's
   invariants become a test suite, not prose. **[local] [thread]**
9. **Wrap the existing hooks rather than replace them.** `classic.*` lets maestro keep any
   shell hooks it already has and compose over them, including `next.to(e, 'core')` to bypass
   other plugins' function hooks for a given classic event. **[src] [thread]**

Caveat: **do not build on `$.telemetry`** — it is added by an internal-only mod and absent on
external builds. Use `$.store` + `$.http.fetch` (or OTEL) for maestro's own cost log. **[src]**

---

## Risks

- **Unreleased, undocumented surface.** No page on `code.claude.com/docs` mentions mods,
  function hooks, or `modules`; the hooks page documents only the classic string events.
  Zero CHANGELOG entries in 7063 lines. The `mods/README.md` states plainly: *"hooks modules
  load only where function hooks are enabled, and the API these mods are written against may
  change between releases without notice."* Anything maestro builds now is against a moving target.
- **Breaking changes are still landing.** The thread shows `fs.readFile` → `fs.read`,
  `next.origin` string → object, and `next.to` / `next.trace` / `on(...).catch` all added
  *after* the original post. Error semantics were still explicitly "very up in the air"
  (fail-open vs skip) as of 2026-09-03, and settled toward "skip the hook, route around it"
  — which I confirmed locally. A protocol that must *enforce* cannot rely on a hook that the
  engine may silently skip: wrap every enforcing hook in `try/catch` (or `.catch`) and prove
  fail-closed by construction, per the maintainer's own guidance.
- **Flag may flip either way.** Gating in the 2.1.276 bundle is
  `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS ?? gate("tengu_plugin_hooks_modules", false)` AND-ed with
  a condition that also requires hooks not to be disabled (`--bare` / `zr("hooks")`). **[local]**
  So it is a server-side GrowthBook rollout with a local env override: a session can gain or
  lose the feature without a version change, and maestro must degrade to classic hooks.
- **Enterprise `sec-default` interplay.** On a machine with managed settings, or for a Team/
  Enterprise org, `sec-default` is seated **outermost** and calls `next.to(e, 'append')` on
  `agent.spawn`, `agent.offer`, `tool.describe`, `command.describe`, `settings.read`,
  `prompt.section/context`, `skill.prompt`, `attribution.text`, and `classic.*` — **skipping
  the entire `user` tier** whenever the subject's `e.provider.tier` is `prepend`/`append`.
  maestro installed as a user-tier plugin would therefore **never see** `agent.spawn` for
  policy-provided agents in such an org, and its `tool.register` can be denied outright when
  managed `allowedMcpServers` is set. Mitigation: ship maestro so an admin can list it in
  `prependPlugins`; but then `next.to` becomes available to it, which is itself a privilege
  an org must consciously grant. Note maestro's most important hooks — `tool.call`,
  `prompt.submit`, `turn.*`, `session.*`, `agent.list`, `engine.create` — are in
  `sec-default`'s "everything else / passes" row, so token accounting and commit-blocking
  survive; **spawn interception is the part at risk**.
- **Ordering is not maestro's to control.** Within the user tier, order comes from a topo-sort
  over declared `dependencies` plus the user's stated order; the maintainer's own answer to
  "how do I ensure correct order" was, in part, "a community mod manager" and "ask Claude".
  An orchestrator that must be authoritative wants to be *outermost*, which in practice means
  the prepend tier, which means an admin.
- **Windows caveats.** Everything I ran worked on Windows 11 / 2.1.276 (native `claude.exe`,
  Bun-based, ~224 MB). Two notes: `claude plugin test` is **hidden from `claude plugin --help`**
  even with the flag on (only `claude plugin test --help` reveals it), so CI discoverability is
  poor; and the CLI reports plugin paths with backslashes (`hooks\register.ts`) while
  `hooks.json` / import specifiers use forward slashes — fine in practice, but any
  path-comparison logic in a mod must normalise. No Windows-specific failure observed.
  `$.process.run` takes `argv` as an array, which avoids shell-quoting hazards on Windows.
- **Render hooks are a shared, contended surface.** Any plugin may wrap any hookable
  component; a cost pane competes with other mods, and the maintainer reported a 1.4 s
  first-draw in one user's terminal. The permission-request component is intentionally
  unhookable, so maestro cannot decorate approval prompts.
- **Not all surfaces.** The internal prototype supported terminal + local Claude Code Desktop;
  other surfaces were "tbd". A pane-based cost UI may not exist everywhere maestro runs.

---

## Sources

**GitHub issue** (all accessed 2026-09-18 via unauthenticated GitHub API; `gh` not installed)
- https://github.com/anthropics/claude-code/issues/91870 — "Mods - make Claude 10x more
  extensible", @poteat, opened 2026-09-03T18:00:23Z, updated 2026-09-18T05:04:58Z, **open**,
  197 comments, labels `enhancement` / `area:hooks` / `area:plugins`.
  Community update 2026-09-09: *"We're shipping in N weeks"*, product name "Claude Mods",
  and public acknowledgement of `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude`.
- Maintainer comments read in full (all 197 fetched; @poteat's 24 quoted where load-bearing),
  notably 2026-09-04 (`next.trace`, `/plugin-types`), 2026-09-06 (`tool.call` sees subagent
  tool calls; `$.fs` admin restriction), 2026-09-07 (`classic.*`, `next.to`, the five tiers),
  2026-09-11 (`turn.step` async generators, ordering/topo-sort), 2026-09-16 (mods as an
  agent-runtime/orchestration API), last maintainer reply 2026-09-16T18:58:28Z.

**Architecture PDF** — downloaded with `curl` to the OS temp dir and extracted with
`pdftotext -layout` (8 pages, PDF 1.4, 284.7 KB); extraction fully succeeded.
- https://github.com/user-attachments/files/31802150/EXTERNAL.Function.Hooks.Core.Architecture.pdf
  — "Function Hooks: Core Architecture", Alice Poteat, August 2026, Anthropic.
  §1 A Module of Hooks · §2 Algebra (order is nesting, five placements, who orders the plugins)
  · §3 Events (event object, render events, interaction events) · §4 The Engine Interface
  (the fold, the shape, the types) · §5 Enterprise Management · §6 Miscellanea (matchers,
  bottom hook, `*`, recursion, philosophy).

**The 9 demo videos** (titles as listed in the issue; not watched — video assets):
Basic — ① *A hook as a function*, ② *A hook that says no*, ③ *Plugins can draw now*,
④ *Admin control as a hook*. Advanced — ⑤ *Order is nesting*, ⑥ *Press a plugin's button*,
⑦ *Every event at once*. Case studies — ⑧ *One sentence. One plugin*,
⑨ *Change what Claude Code shows*. (Thumbnails AI-generated; demos stated to be real binaries.)

**Repository source** (`anthropics/claude-code`, `main`, raw.githubusercontent.com, 2026-09-18)
- `mods/README.md` — the mod model, testing, noun contracts, early-access disclaimer
- `mods/tsconfig.json` — `jsxFactory: "h"`, `include: ["types", "*/types/**/*.d.ts", "*/hooks", "*/tests"]`
- `mods/types/claude-code.d.ts` — **407 575 bytes / 10 772 lines**; primary source for
  `CoreEngineInterface`, `EngineEventOf`, `EngineResultOf`, `OpEventOf`, `On`, `Next`,
  `Register`, `Tier`/`TIERS`, `TraceEntry`, `AgentSpawnInput`, `TurnUsage`, `SessionUsage`,
  `Mock`, `MockClock`, `RenderComponent`
- `mods/sec-default/` — `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.ts`,
  `README.md` (60 files total in tree)
- `mods/diff/` — same, plus `hooks/register.ts` (22 289 bytes, read in full) and
  `tests/{register,git,views}.test.ts` (779 files total)
- `mods/telemetry/` — same, plus `types/index.d.ts` (the noun-contract example);
  **all 81 files downloaded** for the local test run
- `CHANGELOG.md` — 7063 lines, latest 2.1.276; **no match** for
  `mods|function hook|hooks-module|engine.create|plugin test`

**Official documentation** (accessed 2026-09-18)
- https://code.claude.com/docs/en/hooks — **NO MENTION** of mods, function hooks, `modules`,
  `register(on, options)`, or `$`. Documents 33 classic string events (`SessionStart`, `Setup`,
  `UserPromptSubmit`, `UserPromptExpansion`, `PreToolUse`, `PermissionRequest`,
  `PermissionDenied`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `Notification`,
  `MessageDisplay`, `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `Stop`,
  `StopFailure`, `TeammateIdle`, `InstructionsLoaded`, `ConfigChange`, `CwdChanged`,
  `DirectoryAdded`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`,
  `PostCompact`, `PreModelSwitch`, `PostModelSwitch`, `Elicitation`, `ElicitationResult`,
  `SessionEnd`).
- A site-scoped web search for "function hooks" / "Claude Mods" / "hooks module" returned
  **no `code.claude.com` documentation pages** — only the GitHub repo, the issue, and
  third-party blogs. Conclusion: **no official documentation exists yet.**
- https://code.claude.com/docs/en/server-managed-settings — referenced by the maintainer for
  the "managed settings stay a file, you need endpoint management" answer.

### Local verification notes

Machine: Windows 11 Enterprise 10.0.26200. All checks non-interactive; no interactive session
started, nothing installed, nothing modified outside the OS temp dir.

| check | result |
| --- | --- |
| `claude --version` | `2.1.276 (Claude Code)` |
| `Get-Command claude` | `C:\Users\lregazzi\.local\bin\claude.exe`, 224.3 MB native binary; versions dir holds 2.1.268 / 2.1.273 / 2.1.276 |
| `claude plugin --help` (flag on **and** off) | identical; **no `test` subcommand listed** |
| `claude plugin test --help` **with** flag | full help: *"Runs a function-hooks plugin's tests: every `*.test.ts` and `*.test.tsx` under dir … A test file imports its kit from `'claude-code/testing'`. Exits 1 when a test fails."* |
| `claude plugin test --help` **without** flag | falls back to generic `plugin` help → **subcommand is flag-gated** |
| binary string grep (`2.1.276`) | `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` ×9, `engine.create` ×75, `agent.spawn` ×62, `ui.press` ×36, `session.start` ×32, `ui.resolve` ×29, `prependPlugins` ×18, `plugin.register` ×14, `plugin test` ×12, `sec-default` ×9, `hooks-module` ×8, `claude-code/testing` ×4 |
| gating logic (verbatim from bundle) | `var _Ue=()=>a.CLAUDE_CODE_ENABLE_FUNCTION_HOOKS??P("tengu_plugin_hooks_modules",!1); var OQn=()=>_Ue()&&r9();` with `r9=()=>!rS()&&!zr("hooks")&&!eg()` — env override over a GrowthBook flag defaulting to **off**; string *"overridden by the CLAUDE_CODE_ENABLE_FUNCTION_HOOKS environment variable"* also present |
| `claude plugin validate` on the real `mods/telemetry` | **passed, exit 0**, and printed the `$`-contract line plus the full static side-effect analysis (hooks / calls / env reads / env writes) — **with the flag both on and off** |
| `claude plugin test` on the real `mods/telemetry` (81 files) | **11 pass / 0 fail, exit 0, 4.06 s** — Anthropic's own built-in mod tests run unmodified on this machine |
| purpose-written probe mod (temp dir), `agent.spawn` + `turn.complete` | `validate` passed, reporting `hooks: agent.spawn, turn.complete` / `calls: $.store.set`; `test` → **3 pass / 0 fail** |
| probe assertion 1 | a `{deny}` returned from a user-tier `agent.spawn` hook **stopped the spawn before core** (the core-seated hook never ran) |
| probe assertion 2 | `next({ ...e, model: 'rewritten-model' })` — core observed the **rewritten model** |
| probe assertion 3 | a `turn.complete` hook read `usage` (`model` + 4 token counters) for `agentId: 'sub-7'` and persisted it with `$.store.set` |
| error semantics (observed) | passing a malformed event to `next` → `probe's turn.complete hook was skipped: probe: next() passed an argument with no { answer }`; runtime shape checking is enforced and the offending hook is **skipped**, not fatal |
| test-kit gotcha (observed) | `mock.store(on, {})` answers `store.*` beneath the mod but does **not** add `.store` to the test's own `$` (`undefined is not an object (evaluating '$.store.get')`); assert with a spy hook on `store.set` |

Temp artifacts (safe to delete): `%TEMP%\fh.pdf`, `%TEMP%\fh.txt`, `%TEMP%\claude-code.d.ts`,
`%TEMP%\mods\`, `%TEMP%\tel\`, `%TEMP%\probe\`, `%TEMP%\*.json`.
