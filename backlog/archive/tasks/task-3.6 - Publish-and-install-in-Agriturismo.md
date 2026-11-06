---
id: TASK-3.6
title: Publish and install in Agriturismo
status: Done
assignee:
  - '@architect'
created_date: '2026-11-06T14:30:00Z'
updated_date: '2026-11-06T14:56:00Z'
labels: []
dependencies:
  - TASK-3.5
references:
  - scope:E:/Projects/Agriturismo/.claude/settings.json
  - scope:E:/Projects/Agriturismo/AGENTS.md
  - scope:E:/Projects/Agriturismo/PLAN.md
  - scope:E:/Projects/Agriturismo/.gitignore
parent_task_id: TASK-3
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wave 4. Merge goal/TASK-3 into main, push (publication), install Maestro in Agriturismo from the GitHub marketplace, run init, migrate PLAN.md (history archived, future GOALs into Backlog.md) and replace the SOL/Luna/Terra rules in AGENTS.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 okon3/maestro main contains the validated plugin
- [x] #2 Agriturismo .claude/settings.json registers the okon3 marketplace and enables maestro@okon3; .gitignore no longer ignores all of .claude/
- [x] #3 Agriturismo PLAN.md is short; GOAL history archived in a file; open GOALs and milestones 7C onward are in Backlog.md
- [x] #4 Agriturismo AGENTS.md keeps its product rules and replaces the multi-agent section with the Maestro block; npm test, lint and build still pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Published ab749d1 to okon3/maestro. Agriturismo: marketplace registered and plugin installed at project scope (version ab749d1e4b2d), all maestro: skills and agents visible in a session; adoption merged into master 619c5d8; 282 tests, lint and build pass. Finding: project marketplaces need 'claude plugin install --scope project' once per machine; README and init skill updated.
<!-- SECTION:NOTES:END -->
