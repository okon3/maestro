---
id: decision-11
title: Tests until a separate test author exists
date: '2026-11-06T13:56:00Z'
status: accepted
---
## Context

A3: a separate test author was postponed.

## Decision

The implementer writes tests, but the architect specifies acceptance cases (given/when/then) that map 1:1 to named tests and reviews the tests first; code review checks test quality; QA is the final independent net.

## Consequences

The plugin ships no test-author agent in M-2.
