# Wayfinder map: superseded (2026-11-06)

The owner decided on 2026-11-06 that the direction of `team-workflow/flusso-team-agenti.html`
replaces this map. Maestro is a standalone personal Claude Code plugin, published on
`okon3/maestro`. It is not a consolidation of `orchestrate` or `codegenesis`, which are at most
sources of ideas. It is built now and measured on real GOALs (option B: light per-task cost and
time records, with the Agriturismo 7C pilot compared with 7B). A full eval harness is a later GOAL.

Closed research (04, 05, 06, 18) stays valid as input.

| Ticket | Where it went |
|---|---|
| 001 Efficiency metrics | Option B: per-task records of tokens, time, owner interventions and rework, written by the plugin (decision record "Measurement approach") |
| 002 Eval case source and shape | Postponed to the later eval-harness GOAL |
| 003 Human in the loop during evaluation | Postponed to the later eval-harness GOAL |
| 007 Eval test set v0 | Postponed to the later eval-harness GOAL |
| 008 Eval harness v0 | Postponed to the later eval-harness GOAL |
| 009 Baseline over lineages | Replaced by the 7B (old rules) vs 7C (Maestro) comparison |
| 010 Trunk lineage | Decided: the team-workflow design (evolution of prompt v4) is the trunk; `orchestrate`/`codegenesis` are not consolidated |
| 011 Adaptation to existing repo | Covered by the M-2 project templates and the Agriturismo migration |
| 012 Greenfield setup | Covered by the M-2 project templates |
| 013 Enforcement layer | Decided: classic plugin hooks (events, context and usage thresholds, compaction); mods not required |
| 014 Distribution and release | Decided: own marketplace in `okon3/maestro` on GitHub; projects install from it |
| 015 Model routing and lanes | Decided: Sonnet by default, Opus for hard tasks, never Fable; the architect picks model and effort per task (Q5) |
| 016 Authoritative state | Decided: Backlog.md in the project repo (D2, bake-off in `research/tracker-bakeoff.md`) |
| 017 Write maestro v1 spec | Replaced by the HTML design document as source of truth |
