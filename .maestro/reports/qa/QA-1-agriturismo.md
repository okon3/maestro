# QA-1 Dashboard exploratory report (black-box)
Target: http://127.0.0.1:4517/ (project Agriturismo). Viewports 1440x900 and 1280x800. Data at test time: no active GOAL, 4 open decisions, no tasks/agents/reports/costs, no events.
Not testable with this data: Board columns, Agents list, Reports readable text, Costs table/USD labelling, event feed with content, live update on change, HTML-injection check, header values for PM context/usage with data.

## Findings
F1 - header - minor - "5-hour and weekly usage" shown as a single "Plan usage: No reading yet" tile.
 Steps: open page. Expected: separate 5-hour and weekly usage. Actual: one combined tile (cannot tell if both are covered when readings exist). Evidence: roadmap.png.

F2 - header/global - minor - Numbers that do not obviously add up: "Code review 0 / 15, integrated since the start" while Board has no tasks, Costs has "no measured tasks" and the feed is empty.
 Expected: coherent counts or an explanation of what the 15 are. Actual: nothing explains where 15 integrations come from; the progress bar is empty with no label of what 0/15 means (reviewed/integrated?). Evidence: roadmap.png, tab_Costs.png.

F3 - decisions - minor - Opening a decision shows raw YAML frontmatter ("id: decision-1 / title: ... / date: '2026-11-06T14:32:00Z' / status: open") in a code block plus the file path (backlog/decisions/decision-1 - ....md) before the readable text.
 Expected: readable text; metadata not raw. Actual: raw front matter, ISO timestamp. Evidence: dec1.png.

F4 - decisions - cosmetic/minor - Detail opens inline under the row as an accordion; opening another closes the previous. Rows re-render on click so element refs change (harmless for users). Text is only about 60% of the width (narrow column, large empty right side). Evidence: dec1.png.

F5 - global (keyboard) - minor - Tabs support ArrowLeft/ArrowRight (and change the selected tab + URL hash), but Home/End do nothing (standard tablist pattern expects first/last). Steps: focus a tab, press End/Home.

F6 - board - minor - With no tasks, the toggle shows a disabled "No active GOAL" button and "All tasks 0" pressed. Page body says "No tasks yet / Tasks appear here when the architect breaks a GOAL into waves." Fine logically, but the disabled button gives no hint why, and there are no empty columns, so the status columns the owner expects are not visible. Evidence: tab_Board.png, board_all.png.

F7 - roadmap - minor - A GOAL row is labelled "TASK-1" (id) and "7C Stato di fatto..." with status "To Do", "proposed" badge, "no tasks yet". Calling a GOAL "TASK-1" is confusing (GOAL vs task); there is no progress value shown for it. M6 says "Completata, tranne la vigoria..." but shows "No GOALs in this milestone yet." and no done count, so completed work is not visible. Evidence: roadmap.png.

F8 - header - cosmetic - Commit message is truncated with an ellipsis at both widths ("docs: record the GitHub rem...") with no visible way to read it all (title tooltip not verified). Header says "Branch master" while the requirement speaks of "main branch" (fine, just naming).

F9 - feed - minor - Recent events is empty ("No events yet...") even though the commit is 23 min old and decisions are 48 min old; the feed only shows events since page start/ new changes, which is not stated. Evidence: roadmap.png.

F10 - header - cosmetic - Initial load shows "Connecting" and "Loading the project state" for ~1-2 s (acceptable).

## Worked as expected
- Header: project name, "No GOAL in progress" with hint, last commit (hash, message, relative time), code-review counter, PM context and plan usage "No reading yet", "Waiting for you 4 / 4 decisions" (highlighted red).
- Clicking the waiting tile goes to the Decisions tab (#decisions) listing the waiting items; tab badge "4" matches.
- Six tabs present; selected tab kept on reload for #costs, #reports, #roadmap; URL hash changes with the tab; arrow-key navigation works.
- Decisions: open ones highlighted ("waiting for you"), clicking shows text with Context/Decision/Consequences headings; code spans rendered as text.
- Roadmap: milestones M6-M11, "proposed" badge, collapsible draft groups (13 drafts listed); open state kept when switching tabs.
- Empty states for Board, Agents, Reports, Costs are clear and explain how data appears.
- Resize to 1280x800 and back: no horizontal scroll (scrollWidth = 1280), layout reflows well. Evidence: r1280.png.
- Console: no messages/errors. Network: only 127.0.0.1 (index, app.css, app.js, /api/state, /api/stream SSE, /api/report); all 200.
- "Live / updated just now" indicator present.
