# Conversion Decision Tree

## Content Classification

### Is it a Rule?

Rules are policies and constraints — they tell the agent what it MUST or MUST NOT do. They apply broadly across the project, not to a specific task.

Indicators:
- Title includes "guidelines", "standards", "requirements", "policy"
- Content uses imperative language: "Always", "Never", "Must", "Do not"
- Applies to all code, not a specific workflow
- No step-by-step procedure — just constraints

Convert to: `RULES/<name>.md` with `description:` frontmatter.

If a rule has file-scoped applicability (e.g., only applies to test files), add `globs:` frontmatter.

### Is it a Skill?

Skills are reusable instructions — they teach the agent HOW to do something specific. They may be invoked by name or loaded when relevant.

Indicators:
- Has a procedure or workflow (numbered steps, phases)
- Teaches domain expertise (patterns, techniques, checklists)
- Could be invoked as a slash command
- Has supporting files (scripts, templates, reference docs)

Convert to: `SKILLS/<name>/SKILL.md`

If the original is a "command" or "slash command" that the user invokes directly, set `user-invocable: true`. If it's background knowledge the agent loads when relevant, set `user-invocable: false`.

### Is it an Agent?

Agents are specialized personas — they define WHO the agent becomes for a specific type of work.

Indicators:
- Has a role description ("You are a senior security reviewer...")
- Declares specific tools it needs
- Has a focused domain (architecture, testing, security)
- References skills it depends on

Convert to: `AGENTS/<name>.md`

### Is it a Hook?

Hooks are event-triggered scripts that run before/after tool use, on session lifecycle events, or on user prompt submission.

Indicators:
- Triggered by events (pre-tool-use, post-tool-use, session-start, stop, etc.)
- Modifies or gates tool behavior (allow/deny/ask)
- Injects context into the agent
- Is a script file (`.mjs`, `.sh`, `.js`), not markdown
- Referenced from `hooks.json`, `settings.json`, or similar platform config

**Source formats vary by platform:**

| Platform | Hook format | Location |
|----------|------------|----------|
| Claude Code | `hooks.json` with matchers (`"Write\|Edit"`) | `.claude/hooks/hooks.json` or `settings.json` |
| Cursor | `hooks.json` with events | `.cursor/hooks.json` |
| Copilot | Coding Agent hooks | `.github/hooks/` |

**Conversion process:**

1. **Inventory all hooks by event.** Group every source hook by its Lore-equivalent event:
   - Claude `PreToolUse` → `pre-tool-use`
   - Claude `PostToolUse` → `post-tool-use`
   - Claude `UserPromptSubmit` → `prompt-submit`
   - Claude `SessionStart` → `session-start`
   - Claude `Stop` → `stop`
   - Claude `PreCompact` → `pre-compact`
   - Claude `SessionEnd` → `session-end`
   - Claude `SubagentStart` → `subagent-start`
   - Claude `SubagentStop` → `subagent-stop`

2. **Assess each hook's portability:**
   - Platform-agnostic logic (git push guard, console.log warning, lint check, context injection) → **CONVERT**
   - Platform-specific wiring (injects into `settings.json`, reads `.claude/` internals) → **DROP the wiring, keep the logic**
   - Pure infrastructure (auto-update checker, statusline rendering, tmux integration) → **DROP entirely**

3. **Merge multiple hooks per event into one script.** Lore runs ONE script per event. If the source has 5 `PreToolUse` hooks with different tool matchers, merge them into a single `pre-tool-use.mjs` that switches on `input.tool_name`:

   ```javascript
   import { readFileSync } from "fs";
   const input = JSON.parse(readFileSync("/dev/stdin", "utf8"));
   const tool = input.tool_name || "";
   const toolInput = input.tool_input || {};

   // Guard 1: block destructive commands (from source: safety-net hook)
   if (tool === "Bash") {
     const cmd = toolInput.command || "";
     if (/\brm\s+-rf\b/.test(cmd)) {
       console.log(JSON.stringify({ decision: "deny", reason: "rm -rf blocked" }));
       process.exit(0);
     }
     if (/\bgit\s+push\b/.test(cmd)) {
       console.log(JSON.stringify({ decision: "ask", message: "Review before push?" }));
       process.exit(0);
     }
   }

   // Guard 2: protect sensitive files (from source: doc-blocker hook)
   if (tool === "Write" || tool === "Edit") {
     const path = toolInput.file_path || "";
     if (/\.(env|pem|key)$/.test(path)) {
       console.log(JSON.stringify({ decision: "deny", reason: `Protected file: ${path}` }));
       process.exit(0);
     }
   }

   // Default: allow
   console.log(JSON.stringify({ decision: "allow" }));
   ```

4. **Rewrite bash to Node.js.** All Lore hook scripts are `.mjs` (ES modules). Convert bash logic:
   - `grep` → `readFileSync` + regex
   - `jq` → `JSON.parse`
   - `echo '{}' | command` → `execSync` or `spawnSync`
   - `$CLAUDE_PROJECT_DIR` → `process.cwd()` or `process.env.CLAUDE_PROJECT_DIR`
   - `>&2` debug output → write to `/tmp/hook-debug.log` (stderr must not contain JSON)

5. **Declare in manifest.json.** Bundle hooks are NOT discovered via directory scanning — they must be declared:
   ```json
   {
     "hooks": {
       "pre-tool-use": "HOOKS/pre-tool-use.mjs",
       "post-tool-use": "HOOKS/post-tool-use.mjs",
       "stop": "HOOKS/stop.mjs"
     }
   }
   ```

6. **No external dependencies.** Hook scripts run with Node.js built-ins only (`fs`, `path`, `child_process`). No npm packages. If the source hook requires npm packages, rewrite using built-ins or drop it.

**Common hook behaviors worth converting:**

| Source behavior | Lore event | Logic pattern |
|----------------|-----------|---------------|
| Block `rm -rf`, `git push --force` | `pre-tool-use` | Match `tool_name === "Bash"`, regex on command |
| Confirm before `git push` | `pre-tool-use` | Return `{ decision: "ask" }` |
| Warn on `console.log` after edit | `post-tool-use` | Match `tool_name === "Edit"`, grep file |
| Lint/format check after write | `post-tool-use` | Match `tool_name === "Write"`, run linter |
| Inject project context on session start | `session-start` | Read context file, return `additionalContext` |
| Remind about uncommitted changes on stop | `stop` | Run `git diff --name-only`, return `additionalContext` |
| Git push reminder on stop | `stop` | Check for unpushed commits, return `additionalContext` |
| Save session state before compact | `pre-compact` | Write current context to file |
| Keyword detection in user message | `prompt-submit` | Regex on `input.user_message`, return `additionalContext` |

**Behaviors to DROP (not portable):**

| Source behavior | Why |
|----------------|-----|
| Auto-update checker | Bundle updates are managed by `lore bundle update` |
| Statusline rendering | Terminal-specific, not cross-platform |
| tmux integration | Terminal multiplexer-specific |
| Memory persistence to `.claude/` | Lore has its own memory system |
| Plugin marketplace hooks | Platform-specific distribution |

See `lore-format` skill's `references/hook.md` for the full I/O contract, script templates, and examples.

### Is it an MCP Server?

MCP (Model Context Protocol) server declarations define external tool servers.

Indicators:
- JSON files with `command` and `args` fields
- References to `@modelcontextprotocol/server-*` packages
- Server scripts (`.js`, `.py`) that implement MCP protocol

**Conversion rules:**
- Extract each server into a separate `MCP/<name>.json` declaration file
- Implementation scripts (`.js`, `.py`) go alongside the JSON in `MCP/` (ignored by scanner)
- Remove any platform-specific wrapper format (e.g., Claude's `mcpServers` object nesting)
- Replace hardcoded secret values with `${ENV_VAR}` references
- Relative paths in `args` are auto-resolved during projection — keep them relative
- See `lore-format` skill's `references/mcp.md` for the JSON schema

### Is it Infrastructure?

Drop anything that is about installing, configuring, or managing the source project itself:
- Shell installers, setup wizards, uninstallers
- Profile/theme configs
- i18n/localization files
- Build scripts, CI configs
- Package manifests (package.json, Makefile)

## Platform-Specific Content Decisions

### Frontmatter Fields

| Field | Keep? | Reason |
|-------|-------|--------|
| `name` | YES | Universal identifier |
| `description` | YES | Used by all platforms (Cursor uses for activation) |
| `tools` | YES | Converted to YAML list format |
| `skills` | YES | Agent-skill dependency |
| `user-invocable` | YES | Controls slash command visibility |
| `globs` | YES | Lore's canonical scoping field |
| `model` | NO | Platform-specific (Claude: opus/sonnet/haiku) |
| `allowed-tools` | KEEP if present | Constrains skill tool access |
| `alwaysApply` | NO | Platform-specific (Cursor/Windsurf) — Lore handles this via `globs` presence |
| `paths` | CONVERT to `globs` | Claude Code's scoping field → Lore uses `globs` |
| `applyTo` | CONVERT to `globs` | Copilot's scoping field → Lore uses `globs` |

### Content References

| Pattern | Action |
|---------|--------|
| `~/.claude/agents/`, `~/.claude/rules/` | Remove path, keep the concept |
| `~/.cursor/rules/`, `.cursor/` | Remove path, keep the concept |
| `.github/copilot-instructions.md` | Remove path, keep the concept |
| `/compact`, `/clear` | Describe the concept ("manage context window") |
| `settings.json` hooks | Remove — Lore handles hook dispatch |
| `TodoWrite`, `NotebookEdit` | Keep — these are tool names, not platform features |
| `CLAUDE.md`, `GEMINI.md` | Remove or generalize ("the project instructions file") |
| Model names (opus, sonnet, haiku) | Remove from frontmatter; OK in body as general guidance |
| `Claude Code`, `Cursor`, etc. | Replace with "the agent" or "your coding agent" in instructions |

### Tools Format

Source formats vary. Normalize to YAML list:

```yaml
# Source: comma-separated string
tools: Read, Grep, Glob, Bash

# Converted: YAML list
tools:
  - Read
  - Grep
  - Glob
  - Bash
```

## Skill Decomposition

When a source file is large (100+ lines), consider decomposition:

| Content Type | Where it goes |
|-------------|--------------|
| Step-by-step procedure | SKILL.md body |
| Checklist (20+ items) | `references/<topic>-checklist.md` |
| Pattern catalog | `references/<domain>-patterns.md` |
| API reference | `references/<api>-reference.md` |
| Template/boilerplate | `assets/<name>-template.<ext>` |
| Executable script | `scripts/<name>.sh` or `scripts/<name>.mjs` |
| Example configs | `assets/<name>-example.<ext>` |

**Decomposition thresholds:**
- Under 80 lines → keep as single SKILL.md, no supporting dirs needed
- 80-150 lines → consider extracting checklists or reference tables to `references/`
- 150-300 lines → strongly consider decomposition; SKILL.md body should be workflow steps only
- 300+ lines → must decompose; this much content in SKILL.md defeats progressive disclosure

The SKILL.md body should reference these: "See `references/security-checklist.md` for the full checklist."

This follows the Agent Skills standard's three-tier progressive disclosure:
1. **Tier 1 (catalog):** name + description from frontmatter — always loaded
2. **Tier 2 (instructions):** SKILL.md body — loaded when skill is activated
3. **Tier 3 (resources):** supporting files — loaded on demand

## LORE.md Content Strategy

Every bundle needs a LORE.md that captures the bundle's philosophy in 15-30 lines. This file is accumulated (concatenated) into every platform's mandate file, so economy matters.

**What to include:**
- The bundle's core philosophy in 1-2 sentences
- Key workflow principles (what makes this bundle's approach distinctive)
- Critical constraints (things the agent must never do)

**What NOT to include:**
- Installation instructions (handled by `lore bundle install`)
- Per-skill documentation (belongs in SKILL.md)
- Attribution (belongs in README.md)
- Configuration options (belongs in manifest.json or documentation)

**Deriving LORE.md from source:**
- If source has a `CLAUDE.md` or `.cursorrules` with high-level philosophy, distill it
- If source has a README with "principles" or "philosophy" section, extract it
- If source has no clear philosophy, synthesize from the patterns across its rules and skills
- Over 50 lines triggers a validation warning — aggressively compress

## Namespace Conventions

For marketplace bundles converted from community sources:

**Slug format:** `<original-name>` or `<author>-<project>` if the name is generic
- `cloudnative-starter` (distinctive name, no author prefix needed)
- `maestro` (distinctive name)
- `dev-discipline` (distinctive name)
- `smith-typescript-rules` (generic name, needs disambiguation)

**Content naming within bundles:**
- Don't prefix every rule/skill/agent with the bundle name (e.g., NOT `maestro-code-review`)
- Use descriptive, domain-specific names (e.g., `code-review`, `security-audit`)
- If a name would conflict across bundles, the three-layer merge handles it — last-enabled-wins

## License Verification

Before converting a source:
1. Check for `LICENSE`, `LICENSE.md`, or `LICENSE.txt` in the source repo root
2. Check `package.json` for a `license` field if no license file exists
3. If the license is permissive (MIT, Apache-2.0, ISC, BSD), proceed with conversion
4. If the license is copyleft (GPL, AGPL), flag to the operator — redistribution may require the bundle to carry the same license
5. If NO license is found, flag to the operator — unlicensed code has no redistribution rights by default
6. Record the license in both `README.md` attribution and the operator report

## Source Quality Assessment

Before converting, quickly assess source quality to set expectations:

| Signal | Quality indicator |
|--------|-------------------|
| Stars/forks on GitHub | Community validation (100+ stars = established) |
| Last commit date | Active maintenance (< 6 months = active) |
| Number of agentic files | Scope (5+ files = substantial bundle) |
| Frontmatter quality | Already has description/name fields = easier conversion |
| Platform coverage | Multi-platform sources are higher quality than single-platform |
| Content depth | Checklists, examples, patterns = high value; vague guidance = low value |

Report quality signals in the Phase 1 inventory. Low-quality sources may not be worth converting — flag to the operator.

## Projection Testing

After building a bundle, verify it will project correctly:

1. **Frontmatter parsing** — every rule, skill, and agent file must have valid YAML frontmatter between `---` delimiters
2. **Name matching** — skill directory names must match their SKILL.md `name:` field exactly
3. **No model fields** — agents must not have `model:` in frontmatter (breaks portability)
4. **Glob syntax** — any `globs:` values must be valid glob patterns (`**/*.ts`, not `src/ts files`)
5. **Tool names** — `tools:` lists should only contain recognized tool names (Read, Write, Edit, Bash, Glob, Grep, Agent, WebFetch, WebSearch, NotebookEdit, TodoWrite, TodoRead, TaskCreate, TaskUpdate)
6. **Cross-references** — agent `skills:` lists should reference skills that exist in the bundle
7. **File encoding** — all files must be UTF-8 text (no binary files in content dirs)

The `validate-bundle.sh` script catches most of these. Run it as Phase 4. Manual spot-checks for items 4-7.
