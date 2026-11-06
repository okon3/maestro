# ADR 0001: Plugin version follows the commit SHA

Date: 2026-11-06. Status: accepted (M-2 architect).

## Context

Claude Code computes a plugin's version from `plugin.json` `version`, else the marketplace entry `version`, else the 12-char commit SHA of the git marketplace. A fixed `version` string pins users until the string changes, so a forgotten bump silently withholds a release. Pushing `main` is already the publication act (decision-18) and only validated states are pushed.

## Decision

Omit `version` in `plugin.json` and in the marketplace entry. Every pushed commit on `main` is a version; projects set `autoUpdate: true` on the marketplace entry. Releases worth naming get a git tag `vX.Y.Z` and a line in `CHANGELOG.md`.

## Consequences

`claude plugin validate` warns about the missing version; the warning is expected. Rollback means pinning the marketplace source `ref` to a tag in the project settings.
