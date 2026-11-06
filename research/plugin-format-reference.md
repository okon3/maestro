# Claude Code plugin format reference (for the "maestro" plugin)

Verified against the official docs and local Claude Code 2.1.319 (`claude plugin --help`, `claude plugin validate --help`, `claude plugin marketplace --help`), fetched 2026-11-06. Base: `https://code.claude.com/docs/en/`. Items not confirmed in docs are marked UNVERIFIED.

Source keys used below:
- [MANIFEST] https://code.claude.com/docs/en/plugins/manifest-reference.md
- [COMPONENTS] https://code.claude.com/docs/en/plugins/components.md
- [MKT-REF] https://code.claude.com/docs/en/plugins/marketplace-reference.md
- [MKT-CREATE] https://code.claude.com/docs/en/plugins/create-marketplace.md
- [HOST] https://code.claude.com/docs/en/plugins/host-marketplace.md
- [ORG] https://code.claude.com/docs/en/plugins/org.md
- [INSTALL] https://code.claude.com/docs/en/plugins/install.md
- [LOADING] https://code.claude.com/docs/en/plugins/loading.md
- [CLI] https://code.claude.com/docs/en/plugins/cli-reference.md
- [HOOKS] https://code.claude.com/docs/en/hooks.md
- [SKILLS] https://code.claude.com/docs/en/skills.md
- [AGENTS] https://code.claude.com/docs/en/sub-agents.md
- [SETTINGS] https://code.claude.com/docs/en/settings.md

---

## 1. `.claude-plugin/plugin.json` [MANIFEST]

The manifest itself is optional. Only `name` is required. Everything except `plugin.json` lives at the plugin root, NOT inside `.claude-plugin/`.

```json
{
  "name": "deploy-tools",
  "displayName": "Deploy Tools",
  "version": "1.2.0",
  "description": "...",
  "author": { "name": "Example Team", "email": "dev@example.com", "url": "https://example.com" },
  "homepage": "https://example.com/docs",
  "repository": "https://github.com/example/deploy-tools",
  "license": "MIT",
  "keywords": ["deployment", "ci"],
  "defaultEnabled": true,
  "dependencies": ["secrets-vault"],
  "metadata": { "catalogId": "cat-123" },
  "skills": ["./extra-skills/"],
  "commands": { "status": { "source": "./commands/status.md", "description": "..." } },
  "agents": ["./agents/reviewer.md"],
  "hooks": "./config/extra-hooks.json",
  "mcpServers": { "deploy-api": { "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/server.js"] } },
  "lspServers": "./.lsp.json",
  "outputStyles": "./styles/",
  "experimental": { "themes": "./themes/", "monitors": "./config/monitors.json" },
  "userConfig": { "api_token": { "type": "string", "title": "API token", "description": "...", "sensitive": true } }
}
```

Field facts:
- Top-level fields: `$schema`, `name` (required), `displayName`, `version`, `description`, `author{name required,email,url}`, `homepage` (must parse as URL or plugin fails to load), `repository`, `license`, `keywords`, `metadata`, `icon`/`documentationUrl`/`supportUrl`/`privacyPolicyUrl`/`termsOfServiceUrl` (directory-listing only), `defaultEnabled` (default true), `dependencies`, `settings`, `userConfig`, `types`, `channels`, `skills`, `commands`, `agents`, `hooks`, `mcpServers`, `lspServers`, `outputStyles`, `workflows`, `experimental.{themes,monitors,evals}`.
- Unknown top-level keys are stripped (validate warns). Unknown keys inside `userConfig` options, `channels`, `lspServers`, `monitors` entries are ERRORS and the plugin does not load.
- `name`: no spaces, `@`, `:`, path separators; kebab-case. Validator ERRORS on names starting `claude-`, `anthropic-`, `anthropics-`, `cc-plugin-`, exact `claude`, `anthropic`, `claude-code`, `claude-mods`, or `official` next to claude/anthropic. `maestro` is fine. Components are namespaced `<plugin>:<component>`.
- `version`: free string, "not checked against semver". Setting it pins users to that version until the string changes (pushing commits without bumping = users get nothing). Omit it (in manifest AND marketplace entry) to track commit SHA (12 chars). Manifest `version` wins over marketplace entry `version` silently; validate warns on mismatch. [MANIFEST] `version`; [HOST] "Release a new version"; [LOADING] "How Claude Code computes the version".
- Path rules: every component path is relative to plugin root, must start with `./`, must exist, must stay inside the plugin root (no `..`). `skills` additionally accepts `"."`. Use forward slashes (backslash paths are rejected on macOS/Linux). [MANIFEST] "Path rules".

### Component auto-discovery vs declaration [MANIFEST] "Standard layout", "How each key combines with its default location"

| Component | Default (auto-discovered) | Manifest key effect |
|---|---|---|
| Skills | `skills/<name>/SKILL.md` | key ADDS to default scan; entries must be directories |
| Commands | `commands/*.md` (legacy; prefer skills) | key REPLACES default scan; accepts path/array/object map |
| Agents | `agents/*.md` (recursive; subfolder is part of name) | key REPLACES default; entries must be `.md` FILES, directories not accepted |
| Hooks | `hooks/hooks.json` | key MERGES with default; file must wrap events in top-level `"hooks"`; inline object has no wrapper |
| MCP | `.mcp.json` | merges |
| LSP | `.lsp.json` | merges |
| Output styles | `output-styles/` | replaces |
| Monitors | `monitors/monitors.json` | replaces |
| Executables | `bin/` | none |
| Settings | `settings.json` | none |

Setting a replacing key while the default folder exists produces a warning `Default <folder>/ folder is ignored because the manifest sets "<key>"`. So for maestro: just use the default folders and declare nothing except metadata.

A root `CLAUDE.md` in a plugin is NOT loaded (validate warns). Put instructions in a skill or inject via a SessionStart hook. [COMPONENTS] "Skills".

---

## 2. `.claude-plugin/marketplace.json` [MKT-REF], [MKT-CREATE]

Required: `name`, `owner` (`owner.name` required; `email`, `url` optional), `plugins[]` (each entry needs `name` + `source`).

```json
{
  "name": "okon3-tools",
  "description": "Maestro and friends",
  "owner": { "name": "Luca Regazzi" },
  "metadata": { "pluginRoot": "./plugins" },
  "plugins": [
    {
      "name": "maestro",
      "source": "./plugins/maestro",
      "description": "Multi-agent project orchestration"
    }
  ]
}
```

Top-level fields: `name`, `owner`, `plugins`, `$schema`, `description`, `version`, `metadata.description`, `metadata.version`, `metadata.pluginRoot` (v2.1.239+), `forceRemoveDeletedPlugins`, `allowCrossMarketplaceDependenciesOn`, `renames`.
- Marketplace `name`: letters/digits/`.`/`_`/`-`, start alphanumeric; reserved names include `claude-plugins-official`, `anthropic-*`, `inline`, `builtin`, `skills-dir`, `synced`, `npm`, `github`, `gh`, names starting `claudeai-`. A user can't register two marketplaces with the same name; the add also fails if name equals `<owner>-<repo>` download-folder of a different registered marketplace. Pick a distinctive name, NOT `maestro` identical to repo folder collisions (not a problem here since repo is okon3/maestro and marketplace name differs from `okon3-maestro`; UNVERIFIED edge: name equal to `okon3-maestro` is only refused when a different marketplace holds it).
- Plugin entry fields: `name` (install id), `source`, `description`, `version`, `category`, `tags`, `strict` (default true), `relevance`, `dependencies`, `defaultEnabled`, `displayName`, `metadata`, `headers`, `headersHelper`, plus any `plugin.json` field except directory-listing ones. Entry `name` MUST equal manifest `name` (else `Plugin "<manifest-name>" not found in marketplace`).

### `source` forms [MKT-REF] "Plugin sources"
```json
"./plugins/maestro"                                                        // relative path, must start with ./ ; "." alone = marketplace root
{ "source": "github", "repo": "owner/repo", "ref": "v1", "sha": "<40-hex>" }
{ "source": "url", "url": "https://host/x.git", "ref": "main" }
{ "source": "git-subdir", "url": "owner/repo", "path": "tools/x", "ref": "...", "sha": "..." }
{ "source": "npm", "package": "@org/x", "version": "^2", "registry": "https://..." }
{ "source": "archive", "url": "https://.../x.zip", "sha256": "<64-hex>" }
{ "source": "command", "command": "tool path", "timeout": 60, "mode": "copy" }
```
Relative path rules: resolved from the marketplace root (directory containing `.claude-plugin/`), not from `.claude-plugin/`; `..` fails validate; no backslashes; only works when Claude Code has the marketplace files (github/git/file/directory marketplace sources, NOT bare `url` marketplace, NOT `settings`).

### Same repo for marketplace + plugin
- Layout A (plugin in subfolder), explicitly documented: `plugins/maestro/.claude-plugin/plugin.json` + `plugins/maestro/skills/...`, root `.claude-plugin/marketplace.json` with `"source": "./plugins/maestro"`. [MKT-CREATE] step 1-2.
- `metadata.pluginRoot`: YES exists (v2.1.239+). With `"pluginRoot": "./plugins"` you can write bare `"source": "maestro"`; has no effect on sources already starting `./`; a source containing `/` is not a bare name. [MKT-REF] "Bare names under pluginRoot".
- Layout B (plugin at repo root): docs mention `"source": "./"` ("A plugin at the marketplace root, with `"source": "./"`") and `"."` on its own "means the root itself". So `./` is allowed. Caveats [MKT-REF] "Git submodules": a root plugin causes all submodules to be fetched if any component dir points into one; and a marketplace entry with source = marketplace root that lists `skills` subdirectories loads ONLY those (default `skills/` not scanned). Layout A is the cleaner choice (keeps `research/`, `docs/`, repo files out of the plugin cache copy). Note: for a git-hosted marketplace, plugins are copied to cache per version, and files outside the plugin dir are not copied. [LOADING] "In-place and copied plugins".
- Relative-path plugin versioning in a git marketplace: commit SHA if `version` omitted. [LOADING]

Validate: `claude plugin validate ./path` (works on marketplace root or plugin dir; flags `--strict`, `--json`, `--profile directory`). Validate does not fail on a missing source directory; install does (`Source path does not exist`). [MKT-CREATE] "Validate and test".

---

## 3. Project `.claude/settings.json`, install, update

### Exact JSON (GitHub source) [ORG] "Require plugins per repository" / "Require a marketplace and its plugins"
```json
{
  "extraKnownMarketplaces": {
    "okon3-tools": {
      "source": { "source": "github", "repo": "okon3/maestro" },
      "autoUpdate": true
    }
  },
  "enabledPlugins": {
    "maestro@okon3-tools": true
  }
}
```
- `extraKnownMarketplaces` key = marketplace's own `name` from its marketplace.json. Value = `{ "source": <marketplace source object>, "autoUpdate"?: bool }`. Marketplace source types: `github{repo,ref,path,sparsePaths}`, `git{url,ref,path,sparsePaths}`, `url{url,headers,headersHelper}`, `file{path}`, `directory{path}`, `settings{name,plugins,owner}`. [MKT-REF] "Marketplace sources". Aliases `additionalMarketplaces` (v2.1.232+).
- `enabledPlugins`: `"<entry-name>@<marketplace-name>": true|false`. Scope precedence: local > project > user (managed highest). [INSTALL], [LOADING].
- The `autoUpdate` example above is shown in the managed-settings example in [ORG]; the same field is described as "autoUpdate on its extraKnownMarketplaces entry in a settings file" [LOADING "When auto-update runs"], so project-file use is documented as valid. Default: off for custom marketplaces; on only for official + claude.ai-added. Auto-update runs after the first user message, random delay up to 10 min; running session keeps old version and shows `Run /reload-plugins to apply`. Env that disable: `DISABLE_UPDATES`, `DISABLE_AUTOUPDATER=1`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` unless `FORCE_AUTOUPDATE_PLUGINS=1`.

### What happens on first open of the repo [ORG] "Require plugins per repository"; [LOADING] "Enabled in project settings but not installed"; [SETTINGS] https://code.claude.com/docs/en/settings.md "A committed key doesn't reach teammates"
1. `extraKnownMarketplaces` in a repo's `.claude/settings.json` is applied ONLY after the user accepts the workspace trust dialog for that folder (ignored silently in untrusted folders; `-p` runs only in folders already trusted interactively).
2. Marketplace is then registered; Claude Code clones it in the background after session start (plugins load at session start from cache with no network; declared marketplaces missing from `known_marketplaces.json` are cloned, then enabled plugins downloaded, then "Plugins changed. Run /reload-plugins to activate."). So first session may not have the plugin until reload/next start. [LOADING] "Plugins and marketplaces that aren't on disk at session start".
3. `enabledPlugins` project entry does NOT auto-install an externally-sourced plugin. EXCEPT when the marketplace entry has a relative-path source ("A relative-path plugin needs no install record because it loads from the marketplace itself") - this is maestro's case with Layout A. Otherwise the user sees `Plugin "<name>" is enabled in project settings but isn't installed here` until `claude plugin install <name>@<marketplace> --scope project`.
4. No documented dedicated "install this plugin?" prompt besides the workspace trust dialog (UNVERIFIED whether an extra confirmation appears for the marketplace add itself; docs say only trust is required). Project-scope plugins: MCP servers need per-server approval; monitors do not load; plugin loads only after trust.

### CLI [INSTALL], [CLI]; verified locally with `claude plugin marketplace --help`
```bash
claude plugin marketplace add okon3/maestro                 # github owner/repo; add #ref or @ref to pin
claude plugin marketplace add okon3/maestro --scope project # writes extraKnownMarketplaces into .claude/settings.json (commit it); default scope user
claude plugin marketplace add ./path                        # local dir (loads in place)
claude plugin marketplace list | update [name] | remove <name>
claude plugin install maestro@okon3-tools                   # default --scope user; also project|local
claude plugin install maestro@okon3-tools --scope project
claude plugin install maestro --marketplace okon3/maestro  # add+install in one (v2.1.292+)
claude plugin update maestro@okon3-tools                    # scope auto-detected since v2.1.281; applies next session or /reload-plugins
claude plugin enable|disable|uninstall maestro@okon3-tools
claude plugin list | details <name> | validate <path> | tag [path] | init <name>
```
In session: `/plugin`, `/plugin marketplace add owner/repo`, `/plugin install maestro@okon3-tools`, `/reload-plugins`. `claude plugin marketplace update` with no name only refreshes listings, not installed plugins. `claude plugin install` never prompts for `userConfig` (use `--config KEY=VALUE`).

---

## 4. `hooks/hooks.json` in a plugin [COMPONENTS] "Hooks", [HOOKS], [MANIFEST] "hooks"

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/session-start.js"],
            "timeout": 30
          }
        ]
      }
    ],
    "PostToolUse": [
      { "matcher": "Write|Edit",
        "hooks": [ { "type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}/scripts/format.sh\"" } ] }
    ]
  }
}
```
- File MUST have the top-level `"hooks"` wrapper (a file with just the event map fails to load). Same shape as `settings.json` hooks. Plugin hooks register on plugin load and fire for the whole session (not tied to skill use). Merged with `hooks` manifest key.
- Matcher syntax: `"*"`, `""` or omitted = all; only letters/digits/`_`/`-`/space/`,`/`|` = exact string or list separated by `|` or `,`; any other char = JavaScript regex, unanchored (use `^Edit$`). SessionStart matchers: `startup`, `resume`, `clear`, `compact`, `fork`. A matcher on a plugin's own MCP tool must be the full `mcp__plugin_<plugin>_<server>__<tool>`.
- Command hook fields: `type` ("command"; also http, mcp_tool, prompt, agent), `command`, `args` (exec form, no shell), `shell` (`"bash"` | `"powershell"`), `if` (permission-rule syntax, tool events only), `timeout` (seconds), `async`, `statusMessage`, `once` (skill frontmatter only), `onFailure` (`continue`|`block`, v2.1.295+). Timeout defaults: 600 s for command/http/mcp_tool; 30 s for prompt; 60 s agent; command hooks on UserPromptSubmit/PreModelSwitch/PostModelSwitch default 30 s; MessageDisplay 10 s. [HOOKS] "Command hook fields".
- `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PLUGIN_DATA}` / `${CLAUDE_PROJECT_DIR}` resolve anywhere in `command` and `args`, and are also exported as env vars to the hook process, plus `CLAUDE_PLUGIN_OPTION_<KEY>` (uppercased) for each userConfig value. Shell form: quote `"${CLAUDE_PLUGIN_ROOT}"`. Exec form (`args`): each element one argument, no quoting. Validate warns on unquoted use in shell form unless `shell: "powershell"`.
- Input: command hooks get JSON on stdin. Common fields: `session_id`, `prompt_id`, `transcript_path`, `cwd`, `permission_mode`, `effort{level}`, `hook_event_name`, `agent_id`/`agent_type` (inside subagent). Per-event extras: SessionStart `source`, `model` (may be absent), `agent_type`, `session_title`; UserPromptSubmit `prompt`; PreToolUse `tool_name`, `tool_input`, `tool_use_id`; SubagentStart/SubagentStop `agent_id`, `agent_type` (+ `agent_transcript_path`, `last_assistant_message`, `stop_hook_active` on stop). There is NO `CLAUDE_MODEL` env var; `CLAUDE_EFFORT` exists.
- Output: exit 0 + stdout. If stdout is a single JSON object it is parsed, else plain text (for SessionStart plain stdout text is added as context). Exit 2 = blocking error on events that can block (stderr fed to Claude; PreToolUse blocks call, UserPromptSubmit blocks prompt, Stop/SubagentStop prevents stopping). Other non-zero = non-blocking error.
```json
{
  "continue": true,
  "stopReason": "shown if continue=false",
  "systemMessage": "warning shown to the user",
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "string, wrapped in a system reminder, max 10,000 chars per string"
  }
}
```
  `hookSpecificOutput.hookEventName` is required. Top-level `decision: "block"` + `reason` for UserPromptSubmit/PostToolUse/Stop/SubagentStop; PreToolUse uses `hookSpecificOutput.permissionDecision` (`allow|deny|ask|defer`) + `permissionDecisionReason`. UserPromptSubmit also accepts `sessionTitle`, `suppressOriginalPrompt`; SessionStart accepts `initialUserMessage` (-p), `sessionTitle`, `watchPaths`, `reloadSkills`. SubagentStart supports `additionalContext` (injected into the subagent). `CLAUDE_ENV_FILE` (SessionStart/Setup/CwdChanged/FileChanged) lets a hook append `export X=...` lines for later Bash commands.
- Windows [HOOKS] "Exec form vs. shell form", "Windows shell notes":
  - Shell form runs via `sh -c` on macOS/Linux, **Git Bash on Windows**, or **PowerShell when Git Bash isn't installed**. `shell` field: `"bash"` (default) or `"powershell"`; default flips to powershell on Windows without Git Bash.
  - Exec form (`args`) needs a real executable (`.exe`); `.cmd`/`.bat` shims need shell form, or run via `node`. `node script.js` in exec form is the safest cross-platform choice.
  - On Windows substituted paths mostly use forward slashes (`C:/Users/...`) but keep backslashes in exec-form and PowerShell hooks. `tool_input.file_path` has backslashes even in Git Bash - normalize.
  - Without Git Bash the Bash tool is not registered and the PowerShell tool is used, so a hook matcher of `Bash` never fires: use `Bash|PowerShell`.
  - Hooks running in PowerShell do not get `CLAUDE_ENV_FILE`.
- Duplicate plugin name from two marketplaces: only one copy's hooks.json registers. [COMPONENTS]

---

## 5. Plugin `agents/*.md` [COMPONENTS] "Agents", [AGENTS]

```markdown
---
name: architect
description: When Claude should delegate to this agent.
model: sonnet
tools: Read, Grep, Glob
---
System prompt body.
```
- Honoured in plugin agents: `name`, `description`, `model`, `effort`, `maxTurns`, `autoCompactWindow` (v2.1.296+, 100000-1000000), `tools`, `disallowedTools`, `skills`, `memory`, `background`, `omitClaudeMd`, `isolation` (only `"worktree"`), `color`, and `experimental.cacheTtl`.
- IGNORED for plugin agents: `permissionMode`, `hooks`, `mcpServers`, `initialPrompt`. (Existing capabilities note lists only first three; `initialPrompt` is extra.) Misspelled fields are silently ignored (`claude --debug` logs "does not recognize or apply").
- Required: `name`, `description`. `name` max 256 chars, cannot contain `:` or start with `-`; if missing, filename is used. Bad frontmatter -> agent still loads with description `Agent from <plugin> plugin` and no fields.
- `model`: `sonnet`, `opus`, `haiku`, `fable`, a full model id, or `inherit`. Resolution order: per-invocation `model` param (aliases only), definition `model`, `CLAUDE_CODE_SUBAGENT_MODEL`, main model.
- Referencing: scoped name `plugin:agent` (subfolder included: `agents/review/security.md` -> `my-plugin:review:security`; frontmatter `name` replaces only the last segment; entries listed in manifest `agents` lose subfolder names). @-mention: `@agent-my-plugin:code-reviewer`. Session-wide: `claude --agent my-plugin:security-reviewer`. As `subagent_type` in the Agent tool: the docs page does NOT show the exact value format (UNVERIFIED), but the scoped name `maestro:architect` is the identifier everywhere else, so expect `subagent_type: "maestro:architect"`.
- Nesting: subagents may spawn subagents by default up to 3 layers below main (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` to change, `1` disables). To stop a subagent spawning, omit `Agent` from `tools` or add to `disallowedTools`. `Agent(type)` lists restrict spawn types only for an agent run as main thread via `--agent`; in a subagent definition the list is ignored.

---

## 6. Plugin skills `skills/<name>/SKILL.md` [SKILLS], [COMPONENTS] "Skills"

```markdown
---
name: pm
description: What it does and when to use it (put the key use case first; description + when_to_use truncated at 1,536 chars).
argument-hint: "[issue-number]"
arguments: [issue, branch]
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/run.sh *)
---
Body with $ARGUMENTS, $0, $1, $issue, ${CLAUDE_PLUGIN_ROOT}/scripts/x.js
```
- Frontmatter (all optional; only `description` recommended; unknown names ignored silently): `name`, `description`, `when_to_use`, `argument-hint`, `arguments`, `disable-model-invocation` (true = only user can invoke), `user-invocable` (false = hidden from `/` menu, only Claude invokes), `allowed-tools` (granted without prompting for the turn that invokes the skill; clears on next user message), `disallowed-tools`, `model`, `effort` (`low|medium|high|xhigh|max`), `context` (`fork` = run in forked subagent), `agent` (subagent type for fork), `background`, `hooks`, `paths` (globs limiting auto-load), `shell` (`bash` default | `powershell`, for `` !`cmd` `` blocks). Claude Code-only fields such as `argument-hint` hard-fail if packaged for claude.ai/API.
- Command name: plugin skill is `/<plugin>:<directory>` (so `skills/pm/SKILL.md` -> `/maestro:pm`); frontmatter `name` replaces the last segment only. Plugin skills always load under namespaced name. Both user and Claude can invoke unless restricted by the two flags.
- Substitutions in body: `$ARGUMENTS` (all as typed; if no placeholder present Claude Code appends `ARGUMENTS: <value>`), `$ARGUMENTS[N]` / `$N` (0-based, shell-style quoting), `$name` (from `arguments`, by position), `${CLAUDE_SESSION_ID}`, `${CLAUDE_EFFORT}`, `${CLAUDE_SKILL_DIR}`, `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}` (plugin skills only). `${user_config.KEY}` also substitutes in skill/agent content (non-sensitive values only). `\$1.00` escapes a literal dollar before a digit.
- Bundled files: keep sibling files (`reference.md`, `scripts/helper.py`) in the skill dir and reference them with `${CLAUDE_SKILL_DIR}/...` or `${CLAUDE_PLUGIN_ROOT}/...`; Claude Code substitutes the path inline when loading the content. These variables are NOT in the env of commands run through the Bash tool, so the path must be written into the skill text (substituted) or the script put on `bin/` PATH.
- Single-skill plugin: a `SKILL.md` at plugin root with no `skills/` dir and no `skills` key loads as one skill (set `name` in frontmatter).
- `commands/*.md` take the same frontmatter; skills supersede them.

---

## 7. Plugin `bin/` [COMPONENTS] "Executables"

- Files in `bin/` at plugin root are put on the PATH of the Bash tool's shell while the plugin is enabled; Claude runs them as bare commands. A command run with the PowerShell tool outside the sandbox finds them on PATH too (sandboxed PowerShell does not). Plugin `bin/` entries come AFTER the user's own PATH, so they cannot shadow `git`, `ls` etc.
- Example in docs: `bin/hello-plugin` with `#!/bin/bash` shebang, `chmod +x`.
- claude.ai and Cowork do NOT install a plugin that has a top-level `bin/` (irrelevant for Claude Code CLI).
- Hook/monitor processes do not see `bin/` as a documented feature; hooks should call `${CLAUDE_PLUGIN_ROOT}/...` explicitly.
- Windows behaviour of extensionless bash-shebang scripts: UNVERIFIED (docs give no Windows note for `bin/`). Reasoning only: the Bash tool on Windows is Git Bash, which resolves shebang scripts on PATH, so an extensionless `#!/usr/bin/env node` or `#!/bin/bash` file should run from the Bash tool; PowerShell does not honour shebangs and would need a `.cmd`/`.ps1` shim. Test it locally with `--plugin-dir` before relying on it. Safer cross-platform pattern: write the tool in Node and invoke `node "${CLAUDE_PLUGIN_ROOT}/scripts/x.js"` (substituted into skill text) instead of relying on PATH.

---

## 8. Plugin `settings.json` and `userConfig` [MANIFEST], [COMPONENTS] "Default settings"

- Plugin `settings.json` (root) or manifest `settings` key: ONLY `agent` and `subagentStatusLine` take effect; all other keys are dropped. `agent` makes the main thread run one of the plugin's agents (e.g. `{"agent": "security-reviewer"}`). File wins over manifest key if it sets any supported key. User settings override plugin defaults (lowest layer). So a `contextWindow` setting CANNOT be shipped via plugin settings.json.
- `userConfig` CAN declare it:
```json
"userConfig": {
  "contextWindow": {
    "type": "number",
    "title": "Context window (tokens)",
    "description": "Model context window used for budget calculations",
    "default": 200000,
    "min": 100000,
    "max": 1000000
  }
}
```
  Option fields: `type` (required: `string|number|boolean|directory|file`), `title` (required), `description` (required), `required`, `default` (string/number/boolean/array of strings), `options` (string picker; v2.1.271+, breaks plugin load on older versions), `multiple`, `sensitive` (masked; secure storage), `min`/`max` (number). Keys: letters/digits/underscore, not starting with digit. Each non-sensitive, non-`multiple` option appears as a row in `/config` (v2.1.269+).
- Where values live: non-sensitive in `pluginConfigs` in the user's settings.json; sensitive in the platform credential store. Dialog opens on `/plugin` install/enable or `/plugin configure <plugin>@<marketplace>`; shell install doesn't prompt; set from shell with `claude plugin install ... --config KEY=VALUE` or `claude plugin configure <plugin> --values-stdin`.
- Reaching code: 
  - Hooks: env var `CLAUDE_PLUGIN_OPTION_<KEY>` (key uppercased, e.g. `CLAUDE_PLUGIN_OPTION_CONTEXTWINDOW` for `contextWindow`) exported to every hook process; or `${user_config.KEY}` in exec-form hook `args`. `${user_config.*}` is REJECTED in shell-form hook commands, monitor commands, MCP `headersHelper` (error).
  - Monitors do NOT receive `CLAUDE_PLUGIN_OPTION_*`.
  - Skill/agent content: `${user_config.KEY}` (non-sensitive only). MCP/LSP config: `${user_config.KEY}`.
  - `${CLAUDE_PLUGIN_DATA}` (persisted across updates) is the place for state; `${CLAUDE_PLUGIN_ROOT}` changes each version.
  - Whether `CLAUDE_PLUGIN_OPTION_*` is present when the user has not answered the dialog and a `default` exists: UNVERIFIED (docs say `default` is "used when the user provides nothing"; handle absence in the script anyway).

---

## 9. Testing locally [CLI] "Flags that load a plugin for one session", [MKT-CREATE]

```bash
claude --plugin-dir ./plugins/maestro        # session-only, loads in place, never copied; repeatable; also accepts a .zip; CLAUDE_CODE_PLUGIN_DIRS env also works
claude --plugin-dir ./plugins/maestro plugin list     # session-only plugin shows as maestro@inline
claude plugin validate ./plugins/maestro              # manifest + skills/agents/commands/hooks frontmatter
claude plugin validate .                              # marketplace root: checks marketplace.json + each relative-path plugin.json
claude plugin validate . --strict                     # warnings -> exit 1 (CI)
claude plugin marketplace add ./                      # local dir marketplace; relative-path plugins load in place
```
- Exit codes: 0 pass (or pass with warnings), 1 failed (or warning under `--strict`), 2 unexpected error. `--json` for machine output. `--profile directory` adds Anthropic-directory checks.
- `/reload-plugins` in a session applies edits (skills, agents, hooks, MCP/LSP paths; monitors need restart). With `--plugin-dir` and local-path marketplaces, edits are picked up at next session start or `/reload-plugins` with no version bump. May refuse to reload (prompt-cache cost) -> `/reload-plugins --force`.
- A `--plugin-dir` plugin with the same manifest name as an installed one shadows it for that session (silent; see `--debug` log). Disable with `claude plugin disable maestro@inline` or `"maestro@inline": false` in `enabledPlugins`. Managed-settings `enabledPlugins` lock beats `--plugin-dir`.
- Remove everything: `claude plugin marketplace remove <name>` (also uninstalls its plugins).
- `claude plugin init <name>` scaffolds a skills-dir plugin at `~/.claude/skills/<name>/` (loads as `<name>@skills-dir`).

---

## Recommended maestro repo layout (Layout A)

```
maestro/                                  (repo root = marketplace root)
  .claude-plugin/marketplace.json         name "okon3-tools" (or similar), plugins[0].source "./plugins/maestro"
  plugins/maestro/
    .claude-plugin/plugin.json            name "maestro", (no version, or bump on every release)
    skills/pm/SKILL.md  ...               -> /maestro:pm
    agents/architect.md ...               -> maestro:architect
    hooks/hooks.json                      {"hooks": {...}} wrapper; exec form: node + ${CLAUDE_PLUGIN_ROOT}
    scripts/*.js
    bin/ (optional)
  .claude/settings.json                   extraKnownMarketplaces + enabledPlugins "maestro@okon3-tools": true
```
