---
id: decision-4
title: Backlog.md is the tracker, installed globally at a pinned version
date: '2026-11-06T13:56:00Z'
status: accepted
---
## Context

Hands-on bake-off of Backlog.md 1.55.3 and beads 1.3.4 (research/tracker-bakeoff.md); D2.

## Decision

Backlog.md is the tracker; beads is only a fallback. Mitigations: only PM and architect create tasks, from one repo; claims go through a mkdir-lock wrapper; scope in frontmatter `references` (`scope:<glob>`); dependencies and scope read with `task view --json`; init with `--agent-instructions none`; status events via `on_status_change`. Backlog.md is a global prerequisite pinned to 1.55.3 (global install updated on 2026-11-06); the plugin checks its presence and version at session start and prints the install command when needed.

## Consequences

Agents edit tasks through the CLI or MCP, never by hand, so hooks fire.
