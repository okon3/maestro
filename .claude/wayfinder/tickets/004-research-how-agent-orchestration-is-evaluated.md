---
id: 4
title: "Research: how coding-agent orchestration is evaluated elsewhere"
type: research
status: closed
assignee: Luca Regazzi
blocked_by: []
created: 2026-09-18
closed: 2026-09-18
---

## Question

What evaluation designs exist for coding agents and multi-agent orchestration,
and which parts transfer to measuring an orchestrator plugin inside Claude Code
rather than a model?

Cover at least: the SWE-bench family (Verified, Pro, Multimodal),
Terminal-Bench, Aider polyglot, τ-bench and other user-simulation setups,
AgentBench, Anthropic's published guidance on agent evals, LLM-as-judge for
code changes, cost-normalized reporting (pass@k vs dollars, "accuracy at
budget"), and the `skill-creator` harness pattern. For each: unit of
evaluation, ground truth, how cost and time are reported, how variance is
handled, known pitfalls (contamination, judge bias, flakiness). Close with two
or three candidate harness designs for maestro and their trade-offs.

## Resolution

Full report: [How coding agents and multi-agent orchestration are evaluated](../research/04-agent-eval-landscape.md).

- **Grade end state, never trajectory.** Every credible benchmark checks
  fail-to-pass plus must-not-break tests (SWE-bench), an accepted container
  state (Terminal-Bench) or a database against an annotated goal (tau-bench).
  Anthropic's 2026 eval guidance says the same.
- **Public task sets are the wrong core.** SWE-bench Verified was retired by
  OpenAI on 2026-02-23 for contamination and defective tests.
- **Nothing mainstream measures an orchestrator end to end** on long dev
  work. Closest pieces: SWE-EVO, TheAgentCompany (checkpoint partial credit,
  simulated colleagues), Terminal-Bench/Harbor (multi-step task format, cost
  columns, 95% confidence intervals).
- **Threat to the premise:** at equal thinking-token budget single agents
  match or beat multi-agent systems (arXiv 2604.02460); Anthropic's own
  multi-agent post attributes about 80% of variance to token usage. Any
  orchestrator-versus-bare-session claim needs a cost-equalised control arm.
- **MAST** (arXiv 2503.13657) is the best failure taxonomy: 14 modes, 41.8%
  spec/design, 36.9% inter-agent misalignment, 21.3% verification. Candidate
  accuracy sub-dimensions.
- **`claude plugin eval` exists**: two-arm with/without-plugin delta, 3
  runs per case, 6 grader types, USD cost, `--max-cost-usd`, CI exit code.
  Limits: 200 turns, 3600 s, non-interactive, no Windows sandbox backend
  (Bash suites run under WSL2, which collides with .NET fixtures).
- **Human in the loop.** Simulated users inflate success by about 14 points
  versus real humans, and swapping the simulator model moves scores 9 points;
  no benchmark scores behaviour at an approval gate. Recommended: measure the
  AFK segment, freeze a canned-answer table, keep a small live-human
  calibration subset, report HITL load as a separate axis.
- **`skill-creator` is the right shape with the wrong machinery**:
  contaminated baseline, no USD, stddev printed for n=1, sign-flipped delta in
  improve mode.
- **Three harness designs**: A = `claude plugin eval` on the AFK segment
  (permanent gate, blind to gates and per-lane cost); B = own headless runner
  with OTel cost capture and a scripted user (sees everything, weeks of work);
  C = historical GitLab MR replay with an offline judge (cheap, realistic,
  blind to the human loop). Recommendation: C for signal, A as the gate, B
  only if gate behaviour or per-lane cost turns out decisive.
