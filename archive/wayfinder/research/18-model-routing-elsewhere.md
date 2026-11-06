# Model routing, cascades and role-based model assignment elsewhere

Research asset for [Research: model routing, cascades and role-based model assignment elsewhere](../tickets/018-research-model-routing-elsewhere.md).
All sources accessed **2026-09-18** unless stated otherwise.

## Summary

1. Learned routers are a real technique with real numbers, but every published saving is measured on **single-turn QA benchmarks**, not on multi-step coding tasks. None transfers to maestro as evidence.
2. RouterArena, the one independent comparison, finds *all* routers below oracle, one commercial router ranked #12 for over-selecting expensive models, and some routers at baseline accuracy for **378% of the cost**. Router marketing runs well ahead of router measurement.
3. Training a router takes ~65k preference pairs plus ~120k judge-labelled samples. A team producing hundreds of tasks a year is off by three orders of magnitude. **Learned routing is not available to maestro and will not become available.**
4. Cascades are weaker than their reputation. A 2026 decision-theoretic analysis finds a cheap **pre-generation router beat cascades on 4 of 5 datasets**, mostly by never paying the cheap model's generation cost. This supports pre-routing over escalate-on-failure.
5. Verification is the binding constraint on cascades: self-reported uncertainty "consistently exhibits low alignment" with correctness. Cascades only work where an external check exists — tests, a compiler, a diff.
6. The strongest result in the literature is not routing but **role asymmetry**: planner quality dominates executor quality, and reversing a good role assignment costs up to 36% accuracy.
7. Aider's 2024 architect/editor split was real (+3 to +10 points) but its cause — models splitting attention between reasoning and edit format — has largely been engineered away. On the current polyglot leaderboard **a single model tops every architect pair**.
8. On the hub question the evidence is one-sided: **every measured orchestrator runs the strong model at the top.** Anthropic's API even rejects an agent more capable than its advisor. Nothing credible describes a cheap hub over strong specialists.
9. That is cheaper than it sounds: the executor reads ~200x more input tokens and costs ~6x more per task than the planner. A strong hub is a small share of the bill.
10. The realistic design is **rule-based pre-routing plus a strong-advisor escape hatch**, with a per-task cost line logged from day one so routing can be reviewed by a human quarterly — reviewed, not learned.

## Approaches compared

| Approach | Routing signal | Data needed | Reported savings / quality delta | Failure modes | Operational burden |
| --- | --- | --- | --- | --- | --- |
| **RouteLLM** (LMSYS, ICLR 2025) | Query embedding / preference model; 4 variants (similarity-weighted ranking, matrix factorisation, BERT, causal LLM) | ~65k Chatbot Arena preference pairs (64 models) + ~1.5k MMLU gold + ~120k GPT-4-judge samples on Nectar | MT-Bench: 95% of GPT-4 quality with 14% of calls to GPT-4; "up to 3.66x" cost saving. Blog: >85% (MT-Bench), 45% (MMLU), 35% (GSM8K) | Benchmark distribution != production; two-model setting only; authors: "performance between different routers trained on the same dataset can vary widely on the same benchmark without a clear explanation" | Train and host a model; re-tune per model pair (transfer is partial) |
| **OpenRouter Auto Router** (powered by Not Diamond) | Prompt classified into ~30 task types, then ranked by **aggregate community spend** over a trailing 7-day window, filtered by `cost_tier` | None from the user (uses OpenRouter's global traffic) | **No published accuracy or savings numbers** | Popularity != fitness for your task; beta; multi-turn stickiness; silent fallback to defaults if classification fails; opaque | Zero — one model slug |
| **Not Diamond** (commercial) | Not disclosed | Not disclosed | Marketing: "5%+" accuracy, "20%+" cost; one customer case "+39% average accuracy". Calculator projects $1.2M/yr for 1,000 engineers | RouterArena ranks it **#12**, "frequently selects expensive models" | Vendor API; no visibility into the rule |
| **Martian** | Proprietary "model mapping" | Not disclosed | No primary benchmark found | Product availability unstable (router page went dark, then reappeared) | Vendor API |
| **Research routers** (CARROT, RouterDC, GraphRouter, IRT-Router, vLLM Semantic Router, ...) as measured by **RouterArena** | Mixed: embeddings, difficulty classifiers, hidden-state probes | RouterArena itself is ~8,400 queries / 9 domains / 44 categories | Best: "roughly 35% lower cost with under 2% accuracy degradation" (CARROT, vLLM-SR) | "All routers fall short of the oracle"; worst cases hit "baseline-level accuracy while incurring 378% of the cost"; explicit-representation methods "demonstrate poor robustness"; RouteLLM and vLLM-SR add significant latency, others sub-100ms | High: training data, serving, monitoring |
| **FrugalGPT** cascade (2023) | Learned scorer over the cheap model's *output*, thresholded | Labelled in-domain set to fit scorer and thresholds | "up to 98%" cost reduction matching GPT-4 on some datasets | Pays cheap generation before deciding; undetectable errors pass the scorer; per-dataset threshold fitting | Per-domain calibration, redone whenever models change |
| **AutoMix** (2024) | Few-shot **self**-verification plus a POMDP **meta**-verifier over the verifier's noise | Few-shot examples only, no training | ">50%" cost reduction at comparable performance across 5 datasets | All 5 datasets are reading comprehension (CNLI, CoQA, NarrativeQA, QASPER, Quality) — no code, no multi-step agency; self-verification is the weak link | Moderate; the POMDP needs tuning |
| **Cascades, decision-theoretic view** (Bouchard 2026) | Any deferral signal | — | Negative result: "optimized subsequence cascades do not deliver practically meaningful held-out gains"; a **pre-generation router beat cascades on 4 of 5 datasets** | Cascade performance "limited primarily by structural cost" — the cheap model always generates first | — |
| **Bandit / online routers** (BaRP, OrcaRouter, MetaLLM, MixLLM) | Contextual bandit over the logged outcome of the chosen arm; Thompson sampling | A production log stream. BaRP reports beating offline routers by ">=12.46%" but **states no minimum sample count**; OrcaRouter needs an offline bootstrap corpus | BaRP: ">=2.45%" over the largest LLM, with cost/quality tunable at inference without retraining | Exploration deliberately routes some traffic suboptimally; needs continuous traffic; cold start | High: needs a serving loop, real-time metrics, and volume |
| **Aider architect/editor** | **Fixed role split**, no per-task routing | None | 2024: +5.3pp (o1-preview 79.7 to 85.0), +3.1pp (Sonnet self-pair), +10.3pp (o1-mini 61.1 to 71.4). 2026 polyglot: best architect pair 78.2%, **below** gpt-5 solo at 88.0% | Two round trips, higher latency and cost; top 2024 configs used the `whole` format, "probably not practical for interactive use"; the advantage shrank as models learned edit formats | Trivial: two config keys |
| **OpenHands per-agent LLM** | **Fixed role assignment** in `config.toml` (`[agent.X] llm_config`, plus a reserved `[llm.draft_editor]`) | None | No published numbers. Docs advise "cheaper models for tasks that don't require high-quality responses, like repository exploration or simple file operations" | Untested assumption that exploration is the cheap part | Trivial: config file |
| **Claude Code subagent frontmatter** | **Author-declared**: `model` (`haiku`/`sonnet`/`opus`/`fable`/full ID/`inherit`) plus `effort` (`low`...`max`) plus `maxTurns` | None | Docs: "Control costs by routing tasks to faster, cheaper models like Haiku". Diagnostic rule: "Did it not know enough?" to a bigger model; "Did it not try hard enough?" to more effort | Static; a mis-declared lane stays silently wrong; a subagent's context window is sized by *its own* model, not the parent's | Nil — it is the plugin's native mechanism |
| **Anthropic advisor pattern** (cheap executor consults a strong advisor mid-task) | The **executor decides** when it is stuck | None | Sonnet 4.6 + Opus 4.6 advisor: **74.8% vs 72.1%** on SWE-bench Multilingual (+2.7pp) at **-11.9% cost per task**. Haiku 19.7% to 41.2% on BrowseComp. Opus 5 + Fable 5.1 advisor: +3.5 points over Opus 5 alone at about the same cost | **The consult rate is the fragile term**: "a pairing that consults on most tasks at the default effort can fall to consulting on almost none when effort is lowered, and then scores below the executor alone." Also loses by over-consulting: matched the advisor alone for 2.6x the cost on a chart-reading benchmark | Low, but the consult prompt must be tuned and the rate monitored |
| **Anthropic orchestrator pattern** (strong coordinator, cheap workers) | Coordinator decomposes; no learned routing | None | Easy BrowseComp slice: Fable 5 coordinator + 1 Sonnet 5 worker at about half the average cost of Fable 5 alone, **$12 vs $33 at p90**. 21.6M-token corpus with 130 planted bugs: **$246-293 vs $468-552 per episode (47-55% saving) for 10-12 points of accuracy loss**, 2.3h vs 15-20h | "On the full, harder BrowseComp set, the economics reversed." Where work is one dependent chain or fits one context, "in every such case measured, the coordinator's model alone at lower effort came out ahead" | Moderate; Anthropic's own bar: "A multi-model configuration must beat the single model's whole curve" |
| **Rule-based / heuristic routing** | Declared task features: length, domain tag, presence of tests, blast radius | None | No rigorous published evaluation of a *feature-declared* scheme. Surveys call it "predictable, transparent, and fast" and recommend it for "well-defined, simple workflows"; router papers call the same thing "brittle heuristics" | Drifts silently; humans mis-declare features; no calibration | Lowest — a table in a spec |

## Planner/executor and architect/editor splits

**Does a strong planner plus a cheap executor match a strong executor? For decomposable work with an external check, yes — and the asymmetry is large.**

- **AgentCARD** (arXiv 2606.20629, 2026) is the most directly relevant study: planner/executor and planner/verifier/executor teams over MCP-Atlas, MedAgentBench, FinanceBench, IMO-AnswerBench and **SWEBench-Lite**, with four API and four self-hosted models. Heterogeneous teams reach "up to 44% accuracy improvement" over budget-equivalent homogeneous pairs and "12x lower per-task cost" while matching the strongest homogeneous baseline. **Reversing the role assignment costs "36% accuracy loss"** — the direction of the split matters more than the pairing.

  *Caveats that matter for maestro.* Which role is critical is **domain-dependent, not universal**: MedAgentBench is planner-critical (Shapley value 29.0% vs 3.0%) while FinanceBench, IMO-AnswerBench and MCP-Atlas are **executor**-critical. "Per-role best model differs from per-task best model in 4 of 5 benchmarks." Orchestration overhead was excluded from the cost model (asserted as "<5% of LLM cost"), and only two- and three-role pipelines were tested.

- **The cost asymmetry is the argument for spending at the top.** AgentCARD measures the executor at "6x more dollars per task than the planner" because it reads "roughly 200x more input tokens" across multi-turn work. A strong hub is therefore cheap in absolute terms; a strong worker pool is not.

- **PEAR** (arXiv 2510.07505; ACL Findings EACL 2026) ablates planner and executor strength directly: "a weak planner degrades overall clean task performance more severely than a weak executor." A GPT-5 planner with a **GPT-5-nano** executor scores 86.55 +/- 3.94 (separate memory), essentially matching stronger-executor pairs; degrading the *planner* to Gemini-2.0-flash drops utility to "about 30%", against roughly 50% when only the executor is weakened. Also: memory is "essential for the planner" but gives "only marginal improvements" on the executor.

  *Caveats.* Tool-use and web tasks, not repository engineering; the benchmark's primary focus is adversarial robustness rather than cost. One arXiv version was withdrawn over an authorship error, so cite the EACL Findings version.

- **Aider architect/editor, 2024 — the honest version.** Separating "code reasoning" from "code editing" raised every pair tested: o1-preview 79.7 to **85.0%** (with o1-mini *or* deepseek as editor), Sonnet 3.5 self-paired 77.4 to 80.5%, gpt-4o self-paired 71.4 to 75.2%, o1-mini 61.1 to **71.4%**. The authors' hypothesis is mechanical, not about intelligence: "the model has to split its attention between solving the coding problem and conforming to the edit format." Note that **a cheap editor was as good as an expensive one** — o1-mini and deepseek both reached 85.0% — which is the cleanest published instance of "strong planner plus cheap executor".

  *Caveat, and it is decisive.* The top configurations used the `whole` edit format, which the authors themselves call "probably not practical for interactive use with aider". More importantly the effect was a workaround for a defect that has since been fixed: on the **current polyglot leaderboard** (225 hardest Exercism exercises across C++, Go, Java, JavaScript, Python, Rust) the best architect row, o3 (high) + gpt-4.1, scores **78.2% at $17.55**, while **gpt-5 (high) solo scores 88.0% at $29.08** and gpt-5 (low) reaches 81.3% at $10.37. A single modern model beats the split on both axes. Treat the 2024 numbers as a historical artefact of edit-format brittleness, not a standing design principle. Leaderboard rows are community-submitted at different dates and architect rows are sparse, so "nobody tested a better pair recently" remains a live alternative explanation.

- **The Harness Effect** (Writer Inc., arXiv 2607.06906, July 2026): 22 locked enterprise tasks, six models (Claude Sonnet 4.6, Gemini 3.1, Gemini Flash 3.5, Qwen 3.6, GLM 5.1, Palmyra X6), two orchestration layers with models held constant. Better orchestration cut cost per task 41%, wall-clock 44% and tokens 38% at quality parity (0.78 to 0.81 overall). The finding relevant here: "quality gains are capability-dependent: a model's gain correlates almost perfectly with its baseline strength (**r=0.99, n=6**)." **Scaffolding amplifies a capable model; it does not rescue a weak one.** A widely repeated secondary claim that delegation scored ~0.85 on the two strongest models and collapsed to ~0.45 on the fast tier does not appear in the abstract — treat it as unverified.

## Evidence on the hub model

**Nothing credible describes a cheaper coordinator over stronger specialists. Every measured configuration runs the strong model at the top.**

- **Anthropic's multi-agent research system** (June 2025): Claude **Opus 4 as lead agent with Sonnet 4 subagents** "outperformed single-agent Claude Opus 4 by 90.2% on our internal research eval". From the same write-up: "token usage by itself explains 80% of the variance"; multi-agent systems use "about 15x more tokens than chats"; and "upgrading to Claude Sonnet 4 is a larger performance gain than doubling the token budget on Claude Sonnet 3.7". They flag coding as the weak fit: "some domains that require all agents to share the same context or involve many dependencies between agents are not a good fit for multi-agent systems today."

- **Anthropic's orchestrator measurements keep the frontier model as coordinator in every case**: a Fable 5 coordinator with Sonnet 5 workers on the easy BrowseComp slice, and a frontier coordinator with 25 workers on the 21.6M-token bug-finding corpus. There is no published variant with the cheap model coordinating.

- **The platform enforces it.** In the Managed Agents advisor roster: "The advisor model must meet a minimum capability bar, and **the agent's own model must not be more capable than its advisor**; models of equal capability can pair." An invalid pairing is rejected with a 400 validation error. Anthropic has hard-coded "never put the weaker model in the judging seat".

- **A frequently cited number does not survive contact with the primary source.** Secondary write-ups claim a Fable 5 orchestrator with Sonnet 5 workers reached "96% of the score at 46% of the cost" on the **full** BrowseComp set (86.8% at $18.53 per problem against 90.8% at $40.56). Anthropic's own cost-and-intelligence page reports the easy-slice win and then says of the full set: "**On the full, harder BrowseComp set, the economics reversed.**" Until that 86.8/90.8 table is located in a primary Anthropic page, do not plan against it.

- **The one pattern that does put a cheaper model in the driving seat is the advisor**, and it is the closest published analogue to ticket 015's "Sonnet hub + Fable spec >= Opus hub" hypothesis. A Sonnet or Haiku executor runs the task end to end and consults Opus when it hits a decision it cannot resolve. Measured: Sonnet 4.6 + Opus 4.6 advisor **74.8% vs 72.1%** on SWE-bench Multilingual at **-11.9% cost per task**; Haiku 19.7% to 41.2% on BrowseComp at 85% less than Sonnet solo (still 29% below it); Opus 5 + Fable 5.1 advisor **+3.5 points** over Opus 5 alone at roughly equal cost. Note the shape carefully: the cheap model **drives**, the strong model supplies **judgment on demand**. It is not a cheap hub commanding strong workers.

  Two published failure modes to design against, both about the **consult rate**:
  - *Under-consulting.* "An executor at low effort can stop detecting that it is stuck: a pairing that consults on most tasks at the default effort can fall to consulting on almost none when effort is lowered, and then **scores below the executor alone**." Anthropic's mitigation is prescriptive prompting — "one call before substantive work and one before finishing, about two to three calls per task".
  - *Over-consulting.* On a chart-reading benchmark the same pairing "matched Fable 5.1 alone at `medium` for 2.6x the cost" because it consulted on nearly every task.
  - The stated baseline to beat: "first price the advisor's model alone at low effort".

- **Per-token price is the wrong unit, and this cuts against a cheap hub.** Anthropic: "compare models on cost per completed task". On SWE-bench Pro, **Fable 5.1 at `low` effort solved 88.6% at $0.54 per solved task against Sonnet 5 at default effort solving 77.4% at $0.84** — eleven points better for 35% less money, at five times the per-token price. Independently, a Databricks benchmark over engineers' real merged pull requests found Sonnet 5 cost *more* per task than Opus 4.8 despite being 1.7x cheaper per token, because it read and reasoned through 1.9x more tokens (reported via Arize; the primary Databricks post was not read).

- **Industry tiering is thinner than it looks.** Cursor's Composer "Fast" and "Standard" tiers are a latency and hardware distinction with "no quality difference in the model itself" — not capability routing. No usable public description of Devin's or Codex's internal model tiering was found.

**Reading for maestro.** The evidence supports a strong hub, and the cost asymmetry (executor at roughly 6x the planner's spend) means a strong hub is affordable. The credible cheap-hub design is not "Sonnet hub, Fable workers" but "Sonnet hub with Fable on tap for spec, brief and review" — structurally the advisor pattern — and its make-or-break variable is how often the hub actually asks. Ticket 015's hypothesis is testable and structurally supported; the baseline it must beat is **a Fable or Opus hub alone at low effort**, not an Opus hub at default effort.

## What is realistic for a single team's plugin now

Ordered by evidence, cheapest first. This mirrors Anthropic's own lever hierarchy: exhaust effort tuning before adding models.

1. **Do not build a learned router.** The data requirement is around 10^5 labelled samples; a team generates around 10^2 tasks a year. Even well-funded routers underperform the oracle, and some cost 378% of baseline for baseline accuracy. This is closed for the foreseeable future. The map's "adaptive routing" fog should be narrowed to *periodic human review of a log*, not a learned component.

2. **Pre-route on declared task features, not on a learned score.** Bouchard's result — a pre-generation router beating cascades on 4 of 5 datasets by never paying the cheap model's generation cost — is the cleanest argument for maestro's pre-route-first instinct, and it agrees with v4 section 1's ban on "cheaper-model failure first" as a general rule. Brief completeness is a defensible mechanical signal precisely because it is auditable; no published scheme validates it, so it is a hypothesis for the harness, not a finding.

3. **Allow a cheap-first cascade only where an external check exists.** Anthropic's measured rule for checkable outputs: run at `low`, re-run failures at default, giving "about 93% pass rate for about half the cost". That is exactly the test-covered implementation lane. Do not extend it to architecture, security or ambiguous specs, where the check is a human and the error is undetectable — self-reported uncertainty "consistently exhibits low alignment between reported uncertainty and prediction correctness".

4. **Keep lanes as fixed agent definitions with `model` and `effort` in frontmatter.** Aider, OpenHands and Claude Code all do this, and none of them routes per task. Two mechanics worth recording: a subagent's context window is sized by *its own* model, and `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` lets the harness pin every lane to one model, which is useful for A/B runs.

5. **Shape instructions by tier according to that tier's failure mode.** The evidence says a cheap lane fails by not noticing it is stuck (the consult-rate collapse) and by fumbling mechanics (Aider's edit-format finding). So a cheap brief needs the explicit how, worked examples, verification commands, **and an explicit instruction to escalate at named decision points** — Anthropic's "one call before substantive work and one before finishing". A strong lane needs decision boundaries and room for judgment, and Anthropic's Fable guidance agrees: "describe the outcome, not the steps", "skip the verification reminders".

6. **Measure against the whole curve.** Anthropic's stated bar: "A multi-model configuration must beat the single model's whole curve", and "in these internal measurements, a multi-model configuration that looked cheaper than the default single model cost more than that same model at lower effort." Every maestro routing claim must be baselined against the hub model alone at reduced effort. Price the **hardest tenth** of tasks, not the median — "a failed task still bills its tokens, then the retry, then whatever the failure costs downstream".

7. **What a feedback loop can realistically be at this volume.** A quarterly human read of the cost log asking three questions: which lanes escalated, which cheap-lane tasks were reworked, and which strong-lane tasks had no gaps in their brief. That is periodic review, not learning. It only works if the log exists from the first run, which is the one irreversible decision here.

### Minimal record schema (one row per delegated task)

Fields, not code. Grouped by purpose. Keep it flat and append-only; one JSONL file per run is enough.

**Identity and provenance**
- `record_id`, `run_id`, `hub_session_id`, `parent_task_id` (for escalations and retries)
- `tracker_ref` (goal or task id), `repo`, `commit_sha` at dispatch
- `maestro_version`, `timestamp_dispatched`, `timestamp_completed`

**Routing decision — the audit trail**
- `lane` (agent definition name), `model`, `effort`, `max_turns`
- `routing_rule_version` — which revision of the routing table decided this
- `routing_reason` — the enumerated rule that fired, not prose
- `routed_by` — `rule` | `hub_judgment` | `human_override` | `escalation`
- `pre_routed_tier` and `final_tier` — so downgrade and upgrade evidence is a diff, not a story

**Task features as declared at dispatch (the future routing signal)**
- `brief_parts_present` and `brief_parts_missing` — which of the seven brief parts were filled
- `spec_ambiguity` — declared enum
- `has_automated_check` (bool), `check_kind` (`tests` | `typecheck` | `build` | `lint` | `none`), `check_command`
- `error_detectability` — enum: detectable by check / detectable by review / only in production
- `wrong_answer_cost` — enum: cheap-and-local / rework / architectural / security-or-data
- `blast_radius` — expected files touched, modules crossed
- `task_kind` — implementation / refactor / investigation / architecture / spec / review
- `novelty` — routine (precedent exists in repo) / novel

**Outcome**
- `status` — completed / failed / abandoned / superseded
- `check_result` — pass / fail / not-run, plus `check_failures_count`
- `accepted_by_hub` (bool), `review_findings_count`, `review_severity_max`
- `human_interventions` — count, plus `intervention_kind` (clarification / correction / takeover)
- `rework` — whether a later task revisited the same files for the same goal, plus `rework_task_id`
- `escalated` (bool), `escalation_trigger`, `escalated_to_lane`
- `advisor_consults` — count, if an advisor or escalation channel exists. **Log this even when zero**: the consult rate is the documented failure mode of the pattern and is invisible unless counted.

**Cost**
- `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`, `thinking_tokens` — separately. Cache-read is the largest term in agent loops (caching is reported at 2.7-5.3x on agent loops), so a single token total makes tiers incomparable.
- `usd_cost` with `price_list_version` — prices drift, and a cost line without its price basis is unreadable in a year.
- `wall_clock_seconds`, `turns_used`, `hit_max_turns` (bool)
- `subagent_count` for lanes that fan out

**Derived, not stored.** Compute at review time: cost per *completed* task (not per token), cost per solved task by lane, escalation rate by `routing_reason`, and rework rate by tier. Those four numbers are what a quarterly review actually needs.

Two notes on the schema. First, task features must be recorded **as declared at dispatch**, before the outcome is known: a feature filled in afterwards is useless as a routing signal and silently leaks the label. Second, keep `routing_rule_version` and `price_list_version`. Without them the log cannot distinguish a routing change from a model change from a price change, which is the most common way a log like this becomes unusable.

## Sources

Primary — Anthropic (all accessed 2026-09-18)
- Optimizing for cost and intelligence — https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence
- The advisor strategy: give agents an intelligence boost — https://claude.com/blog/the-advisor-strategy
- Multiagent orchestration (Managed Agents) — https://platform.claude.com/docs/en/managed-agents/multiagent-orchestration
- How we built our multi-agent research system — https://www.anthropic.com/engineering/multi-agent-research-system
- Building effective agents — https://www.anthropic.com/engineering/building-effective-agents
- Building multi-agent systems: when and how to use them — https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them
- Claude Code subagents — https://code.claude.com/docs/en/sub-agents
- Claude Code model configuration — https://code.claude.com/docs/en/model-config
- Claude Code agent teams — https://code.claude.com/docs/en/agent-teams
- Choosing a Claude model and effort level in Claude Code — https://claude.com/blog/claude-model-and-effort-level-in-claude-code

Primary — papers (all accessed 2026-09-18)
- RouteLLM: Learning to Route LLMs with Preference Data (ICLR 2025) — https://arxiv.org/abs/2406.18665
- RouteLLM announcement — https://www.lmsys.org/blog/2024-07-01-routellm/
- RouterArena: An Open Platform for Comprehensive Comparison of LLM Routers — https://arxiv.org/html/2510.00202v1
- FrugalGPT — https://arxiv.org/abs/2305.05176
- AutoMix: Automatically Mixing Language Models — https://arxiv.org/abs/2310.12963
- Is Escalation Worth It? A Decision-Theoretic Characterization of LLM Cascades (Bouchard, 2026) — https://arxiv.org/abs/2605.06350
- Dynamic Model Routing and Cascading for Efficient LLM Inference: A Survey (Moslem and Kelleher, Apr 2026) — https://arxiv.org/html/2603.04445v2
- Specialize Roles, Mix Deployments: Pushing the Cost-Accuracy Frontier of LLM Agent Teams (AgentCARD, 2026) — https://arxiv.org/html/2606.20629v1
- PEAR: Planner-Executor Agent Robustness Benchmark — https://arxiv.org/abs/2510.07505 and https://aclanthology.org/2026.findings-eacl.237/
- The Harness Effect: How Orchestration Design Sets the Token Economics of Enterprise Agentic AI (Writer Inc., Jul 2026) — https://arxiv.org/abs/2607.06906
- Learning to Route LLMs from Bandit Feedback: One Policy, Many Trade-offs (BaRP) — https://arxiv.org/abs/2510.07429
- OrcaRouter: A Production-Oriented LLM Router with Hybrid Offline-Online Learning — https://arxiv.org/pdf/2605.30736

Primary — tools and vendors (all accessed 2026-09-18)
- Aider: Separating code reasoning and editing (26 Sep 2024) — https://aider.chat/2024/09/26/architect.html
- Aider chat modes — https://aider.chat/docs/usage/modes.html
- Aider polyglot leaderboard — https://aider.chat/docs/leaderboards/
- OpenHands custom LLM configurations — https://docs.openhands.dev/openhands/usage/llms/custom-llm-configs
- OpenRouter Auto Router — https://openrouter.ai/docs/guides/routing/routers/auto-router
- Not Diamond — https://www.notdiamond.ai/
- Cursor Composer — https://cursor.com/composer

Secondary, used only where flagged as such
- Arize, How cheap models changed multi-agent economics — https://arize.com/blog/how-cheap-models-changed-multi-agent-economics/ (source of the Databricks per-task figures and of the unverified 0.85/0.45 delegation claim)
