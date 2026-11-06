---
id: decision-10
title: Agents run in auto permission mode
date: '2026-11-06T13:56:00Z'
status: accepted
---
## Context

A2; an attempt to use bypassPermissions was refused by the classifier.

## Decision

Agents run in auto permission mode; if a permission prompt can surface, it is forwarded to the owner. Agents never change permission mode.

## Consequences

None beyond the decision itself.
