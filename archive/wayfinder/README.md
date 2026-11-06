# Wayfinder tracker (local markdown)

This repo has no remote issue tracker wired up, so wayfinder maps live here as
files. One file per issue; the file is the issue.

## Layout

    .claude/wayfinder/
      README.md             this doc
      frontier.ps1          lists takeable tickets
      map.md                the map (label wayfinder:map)
      tickets/NNN-slug.md   one child ticket per file
      research/<slug>.md    assets produced by research tickets

## Ticket file

    ---
    id: 7                      # integer, unique; next id = max existing + 1
    title: Assemble the eval test set v0
    type: task                 # research | prototype | grilling | task
    status: open               # open | closed
    assignee:                  # empty = unclaimed; a name = claimed
    blocked_by: [1, 2, 3]      # ticket ids; [] when none
    created: 2026-09-18
    closed:                    # date, set on close
    ---

    ## Question
    ...

    ## Context pointers
    ...

    ## Resolution              <- appended on close, never present while open
    ...

## Wayfinding operations

| Operation | How |
| --- | --- |
| Load the map | read `map.md` only; zoom into tickets on demand |
| Frontier | `pwsh .claude/wayfinder/frontier.ps1`: open, unassigned, every blocker closed. Or scan frontmatter by hand. |
| Claim | set `assignee:` to your name **before** any work |
| Create a ticket | new file `tickets/NNN-slug.md`, id = max + 1; wire `blocked_by` in a second pass |
| Block | list blocker ids in the blocked ticket's `blocked_by` |
| Resolve | append `## Resolution`, set `status: closed` and `closed:`, add one line to the map's Decisions so far |
| Rule out of scope | close the ticket, add one line to the map's Out of scope |
| Research assets | written to `research/<slug>.md`, linked from the ticket's Resolution. Stands in for the `research/<name>` branch wayfinder describes: with a file tracker, a sibling file is the cheaper equivalent. |

Refer to tickets by title, linking the file: `[Title](tickets/NNN-slug.md)`.
Concurrent sessions: a ticket is one file, so claims rarely collide; re-read a
ticket before editing it.
