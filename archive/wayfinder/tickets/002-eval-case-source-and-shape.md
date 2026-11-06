---
id: 2
title: Choose the source and shape of eval cases
type: grilling
status: open
assignee:
blocked_by: []
created: 2026-09-18
closed:
---

## Question

Where do eval cases come from, and what does one contain?

Decide:

- **Source**: (a) historical real tasks from Iconsulting repos, replayed on the
  pre-merge commit with the merged MR as ground truth; (b) synthetic tasks on
  purpose-built fixture repos, controlled and shareable; (c) subsets of public
  benchmarks (they measure the model more than the orchestrator); (d) a mix,
  and in what proportion.
- **Coverage**: stacks that must be represented (.NET, Python, TypeScript, …),
  task kinds (feature, bugfix, refactor, multi-file, ambiguous spec), size of
  the v0 set.
- **Confidentiality**: whether client code may be used, and where fixtures
  live (this repo, a fixtures repo, GitLab).
- **Shape**: what a case file records; whether a hidden intent document is
  needed (depends on how the human side is simulated, ticket 3).

## Context pointers

- `glab` is authenticated to gitlab.iconsulting.biz; Indyco satellite projects
  are candidates for historical tasks.
- Research ticket 4 surveys how public benchmarks build their cases.
- Research 4: public sets are contaminated (SWE-bench Verified retired
  2026-02-23); historical MR replay is its recommended signal source (design
  C); `claude plugin eval` has no Windows sandbox, so Bash-driven suites run
  under WSL2, which matters for .NET fixtures.
