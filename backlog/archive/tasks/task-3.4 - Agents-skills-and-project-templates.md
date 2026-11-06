---
id: TASK-3.4
title: Agents, skills and project templates
status: Done
assignee:
  - '@impl-1'
created_date: '2026-11-06T14:15:00Z'
updated_date: '2026-11-06T14:56:00Z'
labels: []
dependencies: []
references:
  - scope:plugins/maestro/agents/implementer.md
  - scope:plugins/maestro/agents/qa-explorer.md
  - scope:plugins/maestro/agents/code-reviewer.md
  - scope:plugins/maestro/skills/{pause
  - resume
  - triage-qa
  - periodic-review
  - decision
  - init}/**
  - scope:plugins/maestro/templates/**
  - scope:plugins/maestro/test/templates*
parent_task_id: TASK-3
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wave 2. Write the remaining agent definitions and skills, consistent with the architect agent, the PM skill and the start-goal skill (written by the architect), the HTML spec and the contracts; plus the project templates and the init skill that installs Maestro data in a project.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 implementer, qa-explorer and code-reviewer agents follow the spec roles and the architect protocol (preflight, claim/release, tests per AC, report format; QA black box with short missions; reviewer on a tag range with three finding grades)
- [x] #2 Skills pause, resume, triage-qa, periodic-review, decision and init exist with frontmatter per research/plugin-format-reference.md section 6
- [x] #3 init creates .maestro/config.json, .maestro/handoff.md stub, .gitignore and .gitattributes entries, Backlog.md init with on_status_change -> maestro event, statuses, and an AGENTS.md section, never overwriting existing content (test: init_templates_are_idempotent)
- [x] #4 claude plugin validate passes for the plugin
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Integrated by the architect. 40 tests (+1 by architect). Opus, 693 s. Architect fixed: doctor sh check, worktree follows remote goal branch, architect protocol (tracker in main checkout, Ready before corrections, plugin root in brief, task reports, no double release), contract event list, spec skill list.
<!-- SECTION:NOTES:END -->
