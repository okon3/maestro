---
id: TASK-5.4
title: 'Project playbook: learnings from agent reports, curated at GOAL close'
status: To Do
assignee: []
created_date: '2026-11-06T18:11:00Z'
labels: []
dependencies: []
parent_task_id: TASK-5
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request 2026-11-06. Agents add a LEARNINGS field (max 2-3, only costly or recurring, with the verified solution) to their final report; the receiver logs learning.proposed events. At GOAL close the PM promotes (one line), merges or drops each, and prunes .maestro/playbook.md (sections per role, cap ~40 lines per role). Each agent receives only its role's section in its brief. Project rules go to AGENTS.md with owner approval, not to the playbook. Maestro-framework friction is collected only when .maestro/config.json has frameworkFeedback: true (our pilot and lab projects); a later command may draft an issue for okon3/maestro that only the user publishes. Apply after the 7C pilot; update the spec.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 LEARNINGS field in implementer, qa-explorer, code-reviewer and architect reports
- [ ] #2 PM curation and pruning step at GOAL close with a size cap
- [ ] #3 Briefs carry the role's playbook section
- [ ] #4 frameworkFeedback opt-in setting for Maestro friction
- [ ] #5 Spec updated
<!-- AC:END -->
