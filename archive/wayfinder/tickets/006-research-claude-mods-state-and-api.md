---
id: 6
title: "Research: Claude Mods state and API surface"
type: research
status: closed
assignee: Luca Regazzi
blocked_by: []
created: 2026-09-18
closed: 2026-09-18
---

## Question

What are Claude Mods (function hooks) today, what can they hook and do, and
are they usable now?

Establish: release status and timeline; the `register(on, options)` /
`on(event, ($, e, next))` model; the full event list found in `/mods` sources
and types (`session.*`, `command.*`, `process.*`, `ui.*`, `engine.*`, tool and
agent events if any); what `$` exposes (`session`, `http`, `env`, `telemetry`,
others); the manifest shape (`hooks.json` with `modules`); `claude plugin test`
and the mock kit; whether `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` does anything
on the installed 2.1.276; composition and admin control (`sec-default`,
`prependPlugins`). Close with: what an orchestrator plugin could enforce or
measure via mods that classic hooks cannot, and the risk of building on an
unreleased surface.

## Context pointers

- https://github.com/anthropics/claude-code/issues/91870 (PDF and videos
  linked there)
- https://github.com/anthropics/claude-code/tree/main/mods

## Resolution

Full report: [Claude Mods / Function Hooks](../research/06-claude-mods.md).

- **Usable now behind a flag.** `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` works on
  the installed 2.1.276 (verified locally). Undocumented, absent from the
  CHANGELOG, API declared unstable. The gate is an env override over a
  server-side rollout flag, so a session can gain or lose the feature without
  a version bump: maestro must degrade to classic hooks.
- **Model.** A mod is a plugin whose `hooks/hooks.json` carries
  `modules: ["./register.ts"]`; `register(on, options)` registers Koa-style
  hooks `($, e, next)`; registration order is nesting across tiers
  prepend, user, append, builtin, core. Every `$` method is an event and every
  event is a `$` method. Surface: 33 engine events, about 50 op events,
  `classic.*` wrappers over today's shell hooks, `*` wildcard.
- **Verified locally, decisive for maestro:** a user-tier mod can deny an
  `agent.spawn`, rewrite its model via `next({...e, model})`, and capture
  per-agent usage at `turn.complete` (agentId, model, input, output and cache
  tokens). `$.session.usage()` returns context tokens and `cost.usd`.
- **Tooling.** `claude plugin test` runs hook tests (flag-gated, hidden from
  `claude plugin --help`); `claude plugin validate` performs static
  side-effect analysis with the flag off.
- **Risks.** Enterprise `sec-default` sits outermost and skips the user tier
  on `agent.spawn` and `agent.offer`: spawn interception breaks in a managed
  org, while `tool.call`, `prompt.submit`, `turn.*` and `session.*` still
  pass. Hooks that throw or return a wrong shape are silently skipped, so
  enforcing hooks must be fail-closed. `$.telemetry` is internal-builds only;
  use `$.store` plus `$.http.fetch` or OTEL instead.
