# QA-2 Dashboard exploratory report (e2e-1, http://127.0.0.1:4517/, 1440x900)

Black-box only. Screenshots are in the same folder: roadmap.png, board.png, agents.png, reports.png, rep-e25..e31.png (one per report, in list order TASK-1.3, 1.2, 1.1, QA-1-1, QA-1-requirements, QA-1-triage, CR-1), costs.png, live.png.

## Findings

### F1 - Reports: line breaks and structure are lost (major)
- Area: Reports
- Steps: Reports tab, open TASK-1.3 / TASK-1.2 / TASK-1.1, then QA-1-1, then QA-1-requirements, then CR-1.
- Expected: report fields (STATE, TASK, BRANCH, SUMMARY, COMMITS, CHECKS, AC -> TEST, LOCAL DECISIONS, DOUBTS) and "Area / Severity / Steps / Expected / Actual / Evidence" lines are readable as separate lines or list items.
- Actual:
  - The three task reports render as one wall of text, e.g. "STATE: done TASK: TASK-1.3 BRANCH: impl-1 WORKTREE: ... SUMMARY: ... COMMITS: ... CHECKS: ... AC -> TEST: 1 -> ... 2 -> ...". Single newlines are collapsed, there are no headings, and the AC list is inline.
  - QA-1-1 F1/F2: "Area: ... Severity: minor Steps:" then "Expected: ... Actual: ... Evidence: ... Reproduced:" are merged into one paragraph.
  - In QA-1-1 F1 the repro command (node bin/textstats.mjs --top 999...) shows as a numbered list item "1." in plain text, not as a code block.
  - CR-1 header (Range / Date / Scope / Summary) is merged into one paragraph.
  - I could not see the source, so some of this may come from how the source Markdown is written. Even so, the reader gets an unreadable block.
- Evidence: rep-e25.png, rep-e26.png, rep-e28.png, rep-e31.png.
- Suggested fix: render single line breaks as breaks (or the key/value fields as a definition list).

### F2 - Reports list: the three task reports are indistinguishable (minor)
- Area: Reports list
- Steps: open the Reports tab.
- Expected: a meaningful subtitle for each task report (task title or summary).
- Actual: TASK-1.1/1.2/1.3 all show the subtitle "STATE: done" (the first line of the file). The task title is not shown.
- Evidence: reports.png.

### F3 - Live feed shows no text for the qa.note event and the label is awkward (minor)
- Area: Events feed
- Steps: with Costs scrolled down, append the qa.note event with data.text "<b>live</b> update test".
- Expected: a readable description, with the text visible as plain text.
- Actual: the feed shows "qa qa note" (actor repeated plus the type). The payload text is not shown anywhere on the page. I confirmed there is no injected bold element and no raw HTML, so it is safe, but "shows as literal text" could not be verified visually for this event. Unknown event types fall back to a generic label.
- Evidence: live.png. DOM check: bold elements in the feed = 0; the raw string "live</b>" and the text "update test" are both absent from the page.
- Note: my ts (16:00Z) is later than the machine clock, so the feed displayed "in 36 min". That is correct behaviour.

### F4 - Agents tab: duplicated and inconsistent rows, raw ids (minor)
- Area: Agents
- Steps: open the Agents tab and compare with the Costs and Board tabs.
- Expected: one row per agent run, with task and role that match.
- Actual:
  - The "Agent" column mixes names (impl-1) with raw hashes (a537f25311b9b34b0, aef6b54f..., a8e08de6..., aa6244da...).
  - 4 of the 6 rows have Task "none".
  - Implementer runs look duplicated or inconsistent: impl-1 on TASK-1.2 "ran for 6m 34s" while the Costs wall time for TASK-1.2 is 25s. impl-1 on TASK-1.3 ran 24s vs 32s in Costs (and the event "architect measured TASK-1.3, 32s"). It looks as if "claim to release" rows (impl-1) and subagent rows (hash) are both listed for the same work.
  - The architect (ad29abdcc89eee5cf) and QA explorer (ab70f93d44e2a3158) agents appear in the events feed but not in "Recently finished". The list only holds implementers and the code reviewer.
- Evidence: agents.png.

### F5 - Costs: rounding and scope notes (cosmetic)
- Area: Costs
- Per task wall time 17s + 25s + 32s = 74s, but the GOAL shows 1m 15s. Cache write 29k + 18k + 16k = 63k, but the GOAL shows 64k. Both are consistent with rounding of underlying values, but are visible to a careful reader.
- Costs cover only the 3 implementer tasks ("Tasks measured 3"). QA, architect, code-review and PM tokens are not included. If by design, it should be stated, because "Per GOAL" reads as the GOAL total.
- Evidence: costs.png.

### F6 - Roadmap: debt tasks TASK-2 and TASK-3 are not visible (minor)
- Area: Roadmap vs Board
- Board "All tasks" shows 5 tasks (TASK-2 and TASK-3 are To Do "Debt: ..." tasks with no GOAL). The Roadmap shows only milestone v1 with GOAL TASK-1 (3/3) and no drafts/backlog section or empty-state line.
- Expected: a visible place for drafts or backlog (requirement mentions drafts), or an explicit empty state.
- Actual: nothing; it is unclear whether TASK-2/3 count as drafts.
- Evidence: roadmap.png, board.png.

### F7 - Header and feed details (cosmetic)
- The last main commit message is truncated ("Close GOAL TASK-1 (G-1 Comman...") with no visible full text (I did not check for a tooltip).
- "Resets in 2h 47m" sits next to the "stale, 52 min ago" badge, so the reset time may be wrong; this is not stated.
- The events feed shows raw hex agent ids ("hook code reviewer finished a537f25311b9b34b0").

## Worked as expected
- Header:
  - project name e2e-1; "No GOAL in progress" with a clear empty state;
  - last main commit 8e44a78 with message and age;
  - code-review counter "0 / 15, integrated since cr/CR-1";
  - PM context "No reading yet";
  - 5h 19% and week 60% usage with a stale badge;
  - Waiting for you: "Nothing" (consistent with the empty Decisions tab and Blocked column = 0). I did not test the click behaviour because the counter was zero (the element is a button).
- Roadmap: v1, "1 of 1 GOAL done", GOAL TASK-1 Done 3/3. This matches the Board (3 tasks Done, AC 5/5, 4/4, 1/1, all "archived") and Costs ("Tasks measured 3").
- Board: To Do 2, Ready 0, In Progress 0, Blocked 0, In Review 0, Integrated 0, Done 3 (total 5 = "All tasks 5").
- Decisions: clear empty state with a hint about backlog/decisions/.
- Reports: 7 reports (3 task, 3 QA, 1 code review); the badge "7" matches the list. All 7 open and none failed. Headings, inline code, lists and the triage table render well (rep-e30.png, rep-e31.png). No horizontal overflow (scrollWidth 1440).
- Costs:
  - the banner clearly says "USD is a list-price estimate, not a bill", with pricing source and date;
  - per GOAL numbers match the sum of tasks: USD $0.10 + $0.08 + $0.08 = $0.26; input 6 + 8 + 14 = 28; output 1.9k + 2.7k + 2.4k = 7.0k; cache read 52k + 97k + 178k = 327k; total 398k consistent;
  - rework 0 and interventions 0 consistent;
  - USD estimate / Tokens toggle present.
- Live update: after the single append, the new event appeared at the top of the feed within about 3 s with no reload (navigation entries = 1). The Costs tab stayed selected and scrollY stayed at 248 (live.png); URL hash #costs kept; the Live / "updated Ns ago" indicator works.
- Safety: the `<b>live</b>` text did not become bold HTML (0 bold elements). No injected HTML in reports.
- Console: no errors or warnings. Network: only 127.0.0.1:4517 requests (document, app.css, app.js, /api/state, /api/stream EventSource, /api/report?path=...). No external requests (the pricing URL is plain text).
- Tabs and events feed stay sticky while scrolling (live.png).

## Summary by severity
- critical: 0
- major: 1 (F1)
- minor: 4 (F2, F3, F4, F6)
- cosmetic: 2 (F5, F7)
