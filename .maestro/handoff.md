# Maestro handoff

Rewritten by the PM at pauses, context bands and shift changes. Last update: 2026-11-06 ~17:10 local, by the first Maestro PM session (Opus, context at ~60%), handing over to a new session.

## Now

- **Done and published** on `okon3/maestro` (`main`):
  - GOAL M-0 (project setup);
  - M-2 (minimal plugin, tag `done/TASK-3`);
  - M-3 (dashboard, `done/TASK-4`);
  - TASK-7 (full GOAL cost view: per GOAL, PM + architect + implementers + QA + reviewer over the window from `goal.approved`/`goal.start` to `goal.done`).
  - Every push to `main` is a release (ADR 0001). Agriturismo gets it with `claude plugin marketplace update okon3 && claude plugin update maestro@okon3` (run from `E:\Projects\Agriturismo`), then a restart of its dashboard.
- **Fixes made during the pilot, driven by the owner's observations** (all published):
  - console windows flashing on Windows (`windowsHide` everywhere, no git in hooks, fewer hook processes);
  - architect launched in the **background**, so the PM stays available to the owner;
  - implementers check acceptance criteria as their tests pass;
  - dashboard:
    - exact agent↔task links (`agent.bind` from the PreToolUse hook);
    - resumed agents shown as running;
    - usage refreshed by the dashboard every 10 minutes while a page is open;
    - board and feed fitted to the window;
    - architect card wording;
    - cost columns with total input and an explanation of the cache.
- **GOAL M-4, pilot on Agriturismo 7C: IN PROGRESS.**
  - **Approval.** The owner approved 7C with 1A (stato di fatto and progetto inside the Edificio, within the scenario) and a separate 7D for the multifunctional activities (decisions 5 and 6 in Agriturismo's tracker).
  - **The pilot PM** is the Paseo agent `aa65f76a-22bb-4f23-8e21-e38c3af0b486` ("Maestro PM: Agriturismo pilot 7C (M-4)", workspace `wks_b01f811104f24337`).
  - **It runs the old plugin behaviour.** The architect was launched in the foreground, so that PM does not answer the owner until the architect returns. After the GOAL it should run `/reload-plugins` or be restarted to get the fixes.
  - **Progress at handoff:**
    - wave 1 integrated: TASK-1.1 Opus, 17 min, $5.85; TASK-1.2 Sonnet, 4.5 min, $0.68;
    - wave 2 running: TASK-1.3 and 1.4.
  - **Friction log:** `E:\Projects\Agriturismo\.maestro\reports\pilot-friction.md`.
  - **PM session cost.** The pilot PM's transcript was registered by hand in Agriturismo's `.maestro/runtime/pm-sessions.json`, so the GOAL cost includes the PM.
- **Dashboard** for Agriturismo is running at http://127.0.0.1:4517/ (version `a58a337`).
- **Usage at the last sample:** 5-hour 62%, weekly 64%.

## Running agents

- Agriturismo pilot PM (M-4): Paseo agent `aa65f76a-22bb-4f23-8e21-e38c3af0b486`. Its completion notifications go to the previous Maestro session (its parent), not to you: check it with Paseo `get_agent_status` / `get_agent_activity`, or read Agriturismo's tracker and events.

## Waiting for the owner

- Nothing blocking. 4 long-standing open decisions in Agriturismo (trasformazione e vendita, tabelle di connessione, piani comunali, attributi catastali) are not tied to 7C. The dashboard counts them as "waiting for you". Idea: distinguish open questions from blocking decisions.
- 7B deploy in Agriturismo is still pending (the owner runs `npm run deploy`).

## Next action

1. Follow the pilot until 7C closes (QA and periodic review included), without interfering with the pilot PM unless the owner asks.
2. Then the **M-4 review** (TASK-5 in this tracker), compared with 7B under the old rules:
   - **Data:** time, cost and defects. The dashboard Costs view in Agriturismo has the full 7C cost by role; for the 7B baseline, the old orchestrator session transcripts are in `C:\Users\Luca\.claude\projects\E--Projects-Agriturismo\`. Use `maestro context` / `usageSummary` and the 7B history in `docs/history/goal-completati.md`.
   - **Friction:** the friction log plus the issues collected below.
   - **Output:** turn the friction into Maestro tasks or decisions with the owner.
3. **Collected improvement ideas** (not yet tasks):
   - open questions vs blocking decisions in "waiting for you";
   - the decision viewer shows front matter;
   - debt tasks without a GOAL are missing from the Roadmap;
   - the event feed hides the text of unknown event types;
   - a QA/review agent card has no task;
   - the PM context reading is stale while the PM waits.

## Notes

- The tracker for this repo is Backlog.md; GOALs M-4 (TASK-5, In Progress) and M-5 (TASK-6, proposed) remain.
- The lab `E:\Projects\maestro-lab` holds e2e-1, e2e-2 and bg-nesting test repos plus one-off scripts. The original A1/A2 lab lives on the owner's other PC.
- Tests: `cd plugins/maestro && node --test` (66). Validate: `claude plugin validate plugins/maestro`.
- Owner preferences:
  - Italian in conversation;
  - specs in HTML (`team-workflow/flusso-team-agenti.html` is the source of truth; update it when the design changes);
  - he notices UI details: verify UI changes with screenshots before reporting.
