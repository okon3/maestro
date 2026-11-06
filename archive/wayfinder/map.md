# Map: maestro, the unified orchestration plugin

> **Superseded on 2026-11-06.** The owner chose the direction of the team-workflow design (`team-workflow/flusso-team-agenti.html`): Maestro is a standalone personal plugin published on `okon3/maestro`, built now and measured on real GOALs (option B) instead of after a full eval harness. This map is kept for history only; see `archive/wayfinder/SUPERSEDED.md` for where each open ticket went.

<!-- label: wayfinder:map -->

## Destination

A locked v1 design spec for **maestro**, the single Claude Code plugin that
consolidates the three existing orchestration lineages, where every
architectural choice that affects accuracy or cost is backed by a measurement;
plus the evaluation harness and test set that produced those measurements,
already built and run against the current lineages as the baseline.
Implementing maestro v1 is the next effort, not this one.

## Notes

**Domain.** Claude Code plugin engineering (skills, agents, hooks,
marketplaces); multi-agent orchestration for software development; evaluation
of LLM agents.

**Efficiency** means the balance between accuracy and cost. Cost is total:
tokens across all models, wall-clock time, human interventions, rework.
Measured, never guessed (v4 §1).

**Lineages under consolidation**

- Prompt v1→v4: `prompts/orchestrator-prompt-v4.md` in this repo. Provider-agnostic
  prose spec, tracker-first, capability-first routing, no enforcement.
- `orchestrate` plugin 0.4.0:
  `C:\Git\Iconsulting\iconsulting-skill\plugins\orchestrate\` (Iconsulting
  marketplace). Opus hub + `PLAN.md` + per-repo binding, five agents, four Node
  hooks, escalation ladder, Fable goal review. Its `SPEC.md` is the shape a
  spec should take.
- `codegenesis` 0.1.0 (Riccardo Piva):
  https://gitlab.iconsulting.biz/generative-ai/genai-app-codegenesis-plugin.
  Specification pipeline (`.specs/`, master-context, micro-tasks MT-xxx),
  bash-heavy skills, one Python validation hook, a priori cost estimates.

**Related material**

- Claude Mods / function hooks:
  https://github.com/anthropics/claude-code/issues/91870 and `/mods` in that
  repo. Unreleased as of 2026-09-18.
- `skill-creator` eval harness (`~/.agents/skills/skill-creator`): with-skill
  vs baseline runs, assertions, grader, benchmark with mean ± stddev. Reference
  pattern for single runs.
- Iconsulting marketplace conventions:
  `C:\Git\Iconsulting\iconsulting-skill\CONTRIBUTING.md`.

**Vocabulary**

- *Lineage*: one of the three existing implementations. *Iteration*: a
  versioned candidate of the orchestrator under test (a lineage or a future
  maestro build).
- *Eval case*: task statement + fixture repo at a known commit + acceptance
  criteria or ground truth (+ hidden intent doc if the human side is
  simulated). *Test set*: the agreed collection of cases.
- *Run*: one execution of one iteration on one case. *Harness*: what runs and
  measures. *Baseline*: the runs of the current lineages on the test set.
- *Hub*: the orchestrating session. *Lane / worker*: a delegated subagent.
  *Brief*: the per-task contract handed to a lane. *Binding*: the per-repo
  facts file the protocol consumes. *Tracker*: where goals and tasks are
  authoritative.

**Skills.** `grilling`, `domain-modeling`, `research`, `prototype` are not
installed; sessions do them inline. Grilling follows the user's standing rule:
one question at a time, with a recommendation.

**Standing preferences.** Artifacts in English, conversation in Italian.
Measurement before opinion. Minimal tooling: no new framework without a
reason. Atomic commits; never commit unless asked. Company name spelled
`Iconsulting`.

**Execution override.** This map carries task tickets that build things (test
set, harness, baseline, and the final spec assembly), because the design
decisions are gated on measurements and the destination is a document.

**Environment.** Windows 11, PowerShell, Claude Code 2.1.276, models
Fable/Opus/Sonnet/Haiku, Paseo host available, `glab` authenticated to
gitlab.iconsulting.biz, `gh` not installed.

## Decisions so far

<!-- one line per closed ticket: [title](tickets/NNN-slug.md): gist -->

- [Research: how coding-agent orchestration is evaluated elsewhere](tickets/004-research-how-agent-orchestration-is-evaluated.md): grade end state, never trajectory; no benchmark covers orchestrators end to end; the baseline needs a bare-session control arm at equal cost; three harness designs, with historical MR replay for signal and `claude plugin eval` as the gate.
- [Research: Claude Mods state and API surface](tickets/006-research-claude-mods-state-and-api.md): usable now behind `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` on 2.1.276 but undocumented and server-gated; a user-tier mod verifiably denies `agent.spawn`, rewrites its model and captures per-agent usage; classic-hook fallback mandatory; `sec-default` breaks spawn interception in managed orgs.
- [Research: what Claude Code exposes today for measuring cost, time and behaviour](tickets/005-research-claude-code-measurement-surface.md): every metric is capturable on 2.1.276 without mods; subagent transcripts plus `.meta.json` give the full agent tree, the persisted `cost-state` entry and headless `modelUsage` give USD per model including subagents; `claude plugin eval` already ships a multi-run ablation runner, so the custom harness should cover only cost and telemetry.
- [Research: model routing, cascades and role-based model assignment elsewhere](tickets/018-research-model-routing-elsewhere.md): learned routers are out of reach by three orders of magnitude of data; cascades lose to pre-routing unless an external check exists; evidence never puts a weaker model at the top and the executor costs about 6x the planner; "Sonnet hub + Fable spec" is the measured advisor pattern, fragile on consult rate; the baseline to beat is the strong model alone at `low` effort; a per-task record schema for quarterly review is proposed.

## Not yet specified

- **Eval budget and statistical power**: repetitions per case, spend per
  iteration, what difference counts as real. Sharpens after the metrics and
  the baseline.
- **Continuous evaluation**: whether the harness runs on every plugin change,
  on which subset, from where. Depends on the harness shape and its cost.
- **Hub session lifecycle**: context thresholds, handoff, relaunch, lock; keep
  `orchestrate`'s mechanics or redesign. The baseline will show whether
  context exhaustion is a real failure mode.
- **Specification front-end**: whether a codegenesis-style requirements →
  specs → micro-tasks stage becomes an optional entry point of maestro.
  Depends on the trunk decision.
- **Paseo host adapter**: direct Fable dialogue and auto-handoff as an optional
  host integration, or dropped. Depends on trunk and enforcement decisions.
- **Evaluating onboarding itself**: drop-in adaptation and greenfield setup
  don't fit task-level eval cases and need their own check. Depends on how
  adaptation and greenfield are decided.
- **Multi-session concurrency**: several hubs or several humans on one repo
  (v4 §8). Unclear whether v1 needs it.
- **Routing review loop**: research 18 rules out learned routers on data
  volume and proposes a per-task record (routing rule version and reason,
  task features as declared at dispatch, outcome, advisor consults, cost
  split by cache read/write, price list version). Left to sharpen: where the
  record lives, and the cadence and owner of the review that adjusts the
  routing rule. Needs the metrics and the routing decision first.
- **Relationship with Indyco's `issue-lifecycle` skill**: named in
  `orchestrate`'s SPEC as the interactive engine. Depends on the
  authoritative-state decision.

## Out of scope

- Implementing maestro v1: follows the spec as a separate effort.
- Agent runtimes other than Claude Code (v4's provider-agnosticism): the
  deliverable is a Claude Code plugin.
- Evolving codegenesis's own pipeline as a product (owned by Riccardo Piva):
  only what maestro absorbs is in scope.
- A general-purpose LLM evaluation platform: the harness serves maestro only.
