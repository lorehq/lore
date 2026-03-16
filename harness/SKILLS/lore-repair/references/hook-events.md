# Hook Events Reference

Lore exposes 7 canonical lifecycle events across 7 platforms. The binary dispatches to bundle/global/project scripts via `lore hook <event>`.

## Canonical Events

| Event | Command | Support | Purpose |
|-------|---------|---------|---------|
| PreToolUse | `lore hook pre-tool-use` | 7/7 | Allow, deny, or ask before tool execution |
| PostToolUse | `lore hook post-tool-use` | 7/7 | Inject context after tool execution |
| PromptSubmit | `lore hook prompt-submit` | 7/7 | Inject context or block before user message processing |
| SessionStart | `lore hook session-start` | 6/7 | Context injection at session init |
| Stop | `lore hook stop` | 6/7 | Agent response complete — log, archive, or block |
| PreCompact | `lore hook pre-compact` | 5/7 | Preserve state before context compression |
| SessionEnd | `lore hook session-end` | 5/7 | Session cleanup (best-effort) |

## Three-Layer Resolution (Last-Wins)

For each event, only one script runs — from the highest-priority layer that has one:

| Priority | Layer | Location |
|----------|-------|----------|
| 1 (highest) | Project | `.lore/HOOKS/<event>.mjs` |
| 2 | Global | `~/.config/lore/HOOKS/<event>.mjs` |
| 3 (lowest) | Bundle(s) | Declared in `manifest.json` → `hooks` field |

For multiple bundles: last in the `bundles` array (highest priority) wins per event.

## Per-Platform Event Names

| Lore Event | Claude Code | Cursor | Copilot (Bot) | Gemini CLI | OpenCode | Windsurf | Cline |
|------------|------------|--------|---------------|------------|----------|----------|-------|
| PreToolUse | `PreToolUse` | `preToolUse` | `preToolUse` | `BeforeTool` | `tool.execute.before` | `pre_write_code`, `pre_run_command`, `pre_read_code`, `pre_mcp_tool_use` | `PreToolUse` |
| PostToolUse | `PostToolUse` | `postToolUse` | `postToolUse` | `AfterTool` | `tool.execute.after` | `post_write_code`, `post_run_command`, `post_read_code`, `post_mcp_tool_use` | `PostToolUse` |
| PromptSubmit | `UserPromptSubmit` | `beforeSubmitPrompt` | `userPromptSubmitted` | `BeforeAgent` | `chat.message` | `pre_user_prompt` | `UserPromptSubmit` |
| SessionStart | `SessionStart` | `sessionStart` | `sessionStart` | `SessionStart` | `session.created` (event) | — | `TaskStart`, `TaskResume` |
| Stop | `Stop` | `stop` | `agentStop` | `AfterAgent` | `stop` | `post_cascade_response` | — |
| PreCompact | `PreCompact` | `preCompact` | — | `PreCompress` | `exp.session.compacting` | — | — |
| SessionEnd | `SessionEnd` | `sessionEnd` | `sessionEnd` | `SessionEnd` | `session.deleted` (event) | — | `TaskCancel` |

Dash (—) means the platform has no equivalent. Lore emits no-op for unsupported events.

## Stop Blocking Semantics

The Stop event fires universally but blocking varies:

| Platform | Can block? | Mechanism |
|----------|-----------|-----------|
| Claude Code | Yes | `decision: "block"` + reason |
| Copilot (VS Code) | Yes | `decision: "block"` + reason |
| Cursor | No | `followup_message` (auto-submit, subject to loop_limit) |
| Gemini CLI | Yes | `decision: "deny"` (force retry) |
| OpenCode | Yes | Plugin returns continue flag |
| Windsurf | No | `post_cascade_response` is observational only |

**Recommendation:** Treat Stop as observational (logging, archival) since blocking is not universal.

## Copilot Dual-System

Copilot has two incompatible hook systems:

| Dimension | VS Code Agent Mode | Coding Agent (Bot) |
|-----------|-------------------|-------------------|
| Status | Preview | GA |
| Event casing | PascalCase | camelCase |
| Config schema | `{ "command": "..." }` | `{ "bash": "...", "type": "command" }` + `"version": 1` |
| Config reads | `.github/hooks/*.json` + `.claude/settings.json` | `.github/hooks/*.json` only |

**Projection strategy:** Lore generates `.github/hooks/lore.json` in Coding Agent format (GA, wider compatibility). VS Code agent mode reads `.claude/settings.json` projected by the Claude projector.

## Windsurf Per-Tool-Type Events

Windsurf splits PreToolUse/PostToolUse into per-tool-type events. All mapped to the same `lore hook` command:

| Windsurf event | Lore command |
|---------------|-------------|
| `pre_read_code` | `lore hook pre-tool-use` |
| `pre_write_code` | `lore hook pre-tool-use` |
| `pre_run_command` | `lore hook pre-tool-use` |
| `pre_mcp_tool_use` | `lore hook pre-tool-use` |
| `post_read_code` | `lore hook post-tool-use` |
| `post_write_code` | `lore hook post-tool-use` |
| `post_run_command` | `lore hook post-tool-use` |
| `post_mcp_tool_use` | `lore hook post-tool-use` |
| `pre_user_prompt` | `lore hook prompt-submit` |
| `post_cascade_response` | `lore hook stop` |

Windsurf does not support SessionStart, PreCompact, or SessionEnd.

## OpenCode Plugin System

OpenCode uses JS plugins instead of shell hooks. Lore generates `.opencode/plugins/lore-hooks.mjs` that subscribes to named hooks and shells out to `lore hook <event>`.

Session lifecycle events (`session.created`, `session.deleted`) are handled via the plugin's `event` handler, not the `hooks` object.

## Input/Output Contract

**Input (stdin):** JSON payload from the platform describing the event. The binary augments the payload with a `lore.session` block before forwarding to scripts.

**Output (stdout):** JSON response. Format depends on event type:

**PreToolUse — permission decision:**
```json
{ "decision": "allow" }
```
```json
{ "decision": "deny", "reason": "Explanation shown to agent" }
```
```json
{ "decision": "ask", "message": "Approval prompt shown to operator" }
```

**PostToolUse, PromptSubmit, SessionStart, PreCompact, SessionEnd — context injection:**
```json
{ "additionalContext": "Text appended to the agent's context." }
```

**Stop — block or observe:**
```json
{ "decision": "block", "reason": "Agent should continue because..." }
```

Empty stdout or `{}` = no-op (allow/continue).

## Session Normalization

The binary extracts session identity from every hook payload before forwarding:

- Session ID extraction: `session_id` → `conversation_id` → `trajectory_id` → generated 8-char hex
- Platform detection: `CLAUDECODE=1`, `GEMINI_CLI=1` env vars, payload shape
- Writes/updates `.lore/.sessions/<id>.json` state files
- Stale sessions (>24h) cleaned on `prompt-submit`

## Session-Start Freshness

On `prompt-submit` only, the binary checks `.lore/.last-generated` mtime against source files. If any source is newer, silently regenerates before dispatching the hook.

## Hook Config Files Per Platform

| Platform | Config file |
|----------|------------|
| Claude Code | `.claude/settings.json` |
| Cursor | `.cursor/hooks.json` |
| Copilot | `.github/hooks/lore.json` |
| Gemini CLI | `.gemini/settings.json` |
| Windsurf | `.windsurf/hooks.json` |
| OpenCode | `.opencode/plugins/lore-hooks.mjs` |
| Cline | `.clinerules/hooks/` (executable scripts) |

All generated by `lore generate`. Never edit manually.

## Troubleshooting

1. **Hook not firing:** Check three-layer resolution — project HOOKS/ overrides global, which overrides bundle. Verify script exists at declared path.
2. **Wrong script running:** Higher layer may be shadowing. Check `.lore/HOOKS/` and `~/.config/lore/HOOKS/` for override scripts.
3. **Hook errors on platform:** Check script stderr — must not contain JSON-parseable output. Debug logs go to `/tmp`.
4. **Session ID missing:** Check `.lore/.sessions/` for state files. Verify platform provides session info in hook payload.
5. **Stale projection:** On `prompt-submit`, binary auto-regenerates. For other events, run `lore generate` manually.
6. **Platform-specific event not firing:** Check the per-platform event table above. Not all platforms support all events.
