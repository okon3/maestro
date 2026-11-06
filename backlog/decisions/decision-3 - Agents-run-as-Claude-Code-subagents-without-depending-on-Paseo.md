---
id: decision-3
title: Agents run as Claude Code subagents without depending on Paseo
date: '2026-11-06T13:56:00Z'
status: accepted
---
## Context

Paseo agents and Claude Code subagents were both viable (research/paseo-capabilities.md, research/claude-code-capabilities.md). Nesting of subagents was verified (D1).

## Decision

Agents run as Claude Code subagents (nesting depth 3, 20 concurrent). The plugin must work without Paseo; optional extras may use Paseo when present (for example usage).

## Consequences

Plugin subagents ignore `permissionMode`, `hooks` and `mcpServers` in their frontmatter, so hooks live at plugin level and filter by `agent_type`.
