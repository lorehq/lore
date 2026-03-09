package main

import (
	"fmt"
	"os"
	"path/filepath"
)

// globalPath returns the Lore global directory following XDG Base Directory spec.
// Uses $XDG_CONFIG_HOME/lore if set, otherwise ~/.config/lore.
func globalPath() string {
	if xdg := os.Getenv("XDG_CONFIG_HOME"); xdg != "" {
		return filepath.Join(xdg, "lore")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(os.TempDir(), "lore")
	}
	return filepath.Join(home, ".config", "lore")
}

// Platform-managed directories. Only structural scaffolding.
// Bundle-specific directories are created by the bundle's setup script.
var globalDirs = []string{
	"AGENTIC/SKILLS",
	"AGENTIC/RULES",
	"AGENTIC/AGENTS",
	"MCP",
	".harness/AGENTIC/SKILLS",
	".harness/AGENTIC/RULES",
	".harness/AGENTIC/AGENTS",
}

// ensureGlobalDir creates the global directory with platform scaffolding
// and seeds minimal example AGENTIC content on first run.
func ensureGlobalDir() error {
	gp := globalPath()
	for _, dir := range globalDirs {
		if err := os.MkdirAll(filepath.Join(gp, dir), 0755); err != nil {
			return fmt.Errorf("create dir %s: %w", dir, err)
		}
	}
	seedGlobalContent(gp)
	return nil
}

// seedGlobalContent writes starter AGENTIC files if they don't already exist.
// Only creates files on first run — never overwrites user content.
func seedGlobalContent(gp string) {
	// Create LORE.md stub if it doesn't exist
	loreMDPath := filepath.Join(gp, "LORE.md")
	if _, err := os.Stat(loreMDPath); err != nil {
		os.WriteFile(loreMDPath, []byte(""), 0644)
	}

	// Harness agentic content — always projected, managed by the binary.
	harnessSeeds := map[string]string{

		//
		// SKILLS
		//

		".harness/AGENTIC/SKILLS/lore-status/SKILL.md": `---
name: lore-status
description: Show Lore installation status — version, directories, bundles, projections
type: command
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Glob
---
# Status — Lore Installation Diagnostics

Show the current state of the Lore installation.

## Checks

Run each check and present results:

**1. Version**
` + "```bash\nlore version\n```" + `

**2. Global directory**
` + "```bash\nls -la ~/.config/lore/\n```" + `
Verify: config.json exists, AGENTIC/ has content, .harness/ exists.

**3. Installed bundles**
` + "```bash\nlore bundle list\n```" + `

**4. Project config** (if in a Lore project)
` + "```bash\ncat .lore/config.json 2>/dev/null\n```" + `
Show enabled bundles and platforms.

**5. Projection freshness**
` + "```bash\nls -la .lore/.last-generated 2>/dev/null\n```" + `
Compare against source file mtimes. Report if stale.

**6. Projected files**
List platform files that exist on disk (CLAUDE.md, .cursor/rules/, etc.).

**7. Pre-lore backups**
` + "```bash\nfind . -name '*.pre-lore' -maxdepth 3 2>/dev/null\n```" + `
If found, mention ` + "`/lore-migrate`" + ` to convert them.

Present results as a concise summary table.
`,

		".harness/AGENTIC/SKILLS/lore-repair/SKILL.md": `---
name: lore-repair
description: Diagnose and fix a Lore harness or bundle bug
type: command
user-invocable: true
agent: lore-harness-engineer
---
# Repair — Diagnose and Fix

Delegate to the ` + "`lore-harness-engineer`" + ` agent.

Ask the operator: What's broken? How to reproduce? Which platform?
Then hand off to the agent with full context.
`,

		".harness/AGENTIC/SKILLS/lore-migrate/SKILL.md": `---
name: lore-migrate
description: Convert pre-Lore agentic files (.pre-lore backups) into .lore/AGENTIC/ content
type: command
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---
# Migrate — Salvage Pre-Lore Content

After ` + "`lore init`" + `, existing platform files are backed up with a ` + "`.pre-lore`" + ` suffix.
This skill helps convert that content into proper Lore agentic items.

## Process

1. **Find backups** — scan the project root for ` + "`*.pre-lore`" + ` files and directories.
2. **Categorize** — for each backup, identify what kind of content it contains:
   - Mandate files (CLAUDE.md, .windsurfrules, copilot-instructions.md, GEMINI.md) → extract into ` + "`.lore/LORE.md`" + `
   - Rules (.claude/rules/, .cursor/rules/) → convert to ` + "`.lore/AGENTIC/RULES/`" + `
   - Skills (.claude/skills/, .cursor/skills/) → convert to ` + "`.lore/AGENTIC/SKILLS/`" + `
   - Agents (.claude/agents/) → convert to ` + "`.lore/AGENTIC/AGENTS/`" + `
   - Settings/hooks — skip (Lore generates these)
3. **Present plan** — show the operator what will be created and where.
4. **Execute** — write the converted files after approval.
5. **Cleanup** — offer to delete the ` + "`.pre-lore`" + ` backups.
6. **Regenerate** — run ` + "`lore generate`" + ` to project the new content.

## Notes

- Preserve the original content as closely as possible.
- Strip platform-specific frontmatter formats and normalize to Lore YAML frontmatter.
- If a mandate file has mixed content (rules + instructions), split them appropriately.
- Do not overwrite existing ` + "`.lore/AGENTIC/`" + ` files — ask if there's a conflict.
`,

		//
		// AGENTS
		//

		".harness/AGENTIC/AGENTS/lore-harness-engineer.md": `---
name: lore-harness-engineer
description: Harness engineer — diagnoses bugs, implements fixes, submits PRs to Lore repos
skills:
  - lore-repair
  - lore-status
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - TaskCreate
  - TaskUpdate
---
# Lore Harness Engineer

You are a harness engineer for Lore. You diagnose problems, implement fixes in the
source repos, and submit pull requests. Every action is operator-gated — never push
or create PRs without explicit approval.

## Architecture

Lore is a vendor-agnostic abstraction layer for agentic coding tools. It manages
rules, skills, and agents, then projects them into every platform's native format.

**Components:**
- **CLI** (Go binary) — composition engine, projection pipeline, TUI dashboard, hook dispatch
- **Lore OS** (Node.js) — behavioral bundle: hook scripts, MCP server, memory system
- **Lore OS Services** (Docker) — Redis + FastAPI sidecar for hot memory and semantic search

**Source repos:**
- ` + "`github.com/lorehq/lore`" + ` — Go CLI binary
- ` + "`github.com/lorehq/lore-os`" + ` — behavioral bundle
- ` + "`github.com/lorehq/lore-os-services`" + ` — Docker services stack
- ` + "`github.com/lorehq/lore-docs`" + ` — documentation site

**Key paths in the CLI repo:**
- ` + "`compose.go`" + ` — merge engine (four-layer: bundle → global → project → harness)
- ` + "`projector.go`" + ` — projection interface and shared helpers
- ` + "`project_claude.go`" + `, ` + "`project_cursor.go`" + `, etc. — per-platform projectors
- ` + "`tui.go`" + ` — interactive TUI dashboard
- ` + "`cmd_init.go`" + ` — init flow, backup, gitignore
- ` + "`cmd_generate.go`" + ` — generate command, staleness detection
- ` + "`cmd_bundle.go`" + ` — bundle management (install, enable, update, remove)
- ` + "`global.go`" + ` — global directory management, harness seed content
- ` + "`config.go`" + ` — config read/write, inherit.json

**Design docs** (if the operator has ` + "`lore-engineering`" + ` cloned):
- ` + "`design/architecture/overview.md`" + ` — system architecture
- ` + "`design/architecture/composition.md`" + ` — merge strategy
- ` + "`design/architecture/global-directory.md`" + ` — directory layouts
- ` + "`design/reference/commands.md`" + ` — CLI command reference
- ` + "`design/reference/configuration.md`" + ` — config file reference

## Workflow

1. **Understand** — ask the operator what's broken and on which platform.
   Run ` + "`/lore-status`" + ` to gather installation state.
2. **Reproduce** — reproduce the issue in the operator's environment.
3. **Locate** — find the relevant source file. Read it before proposing changes.
4. **Fix** — implement the fix in the source repo. Build and verify:
   ` + "```bash\ncd <repo> && /usr/local/go/bin/go build -o /tmp/lore-bin .\n```" + `
5. **Test** — verify the fix resolves the issue.
6. **Commit** — stage and commit with a clear message. Do NOT push without approval.
7. **PR** — offer to create a PR. Show the operator the diff first.

## Common Issues

**Projection not updating:**
- Check ` + "`.lore/.last-generated`" + ` sentinel mtime vs source mtimes
- ` + "`rm .lore/.last-generated && lore generate`" + ` forces refresh
- Check ` + "`.lore/config.json`" + ` has ` + "`\"bundles\"`" + ` array with the bundle slug

**Skills not appearing in autocomplete:**
- Check ` + "`user-invocable: true`" + ` in skill frontmatter
- Check ` + "`allowed-tools`" + ` is a YAML list, not a comma string
- Restart the Claude Code session after regenerating

**Hook errors:**
- Hook stderr corrupts JSON responses — debug output goes to /tmp
- Check ` + "`lore hook pre-tool-use`" + ` runs without error from the project root
- Verify bundle manifest.json exists at ` + "`~/.lore-os/manifest.json`" + `

**MCP server not connecting:**
- Check ` + "`.mcp.json`" + ` was generated (` + "`lore generate`" + `)
- Verify the server script exists at the resolved path
- Test manually: ` + "`echo '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2024-11-05\"}}' | node ~/.lore-os/MCP/lore-server.js`" + `

## Rules

- Always fix in the source repo, never patch the installed instance directly.
- The operator is your eyes — ask them to confirm behavior you can't observe.
- Never push to remote without explicit operator approval.
- Design docs are truth. If code diverges from docs, the code is wrong.
`,
	}

	for relPath, content := range harnessSeeds {
		absPath := filepath.Join(gp, relPath)
		dir := filepath.Dir(absPath)
		os.MkdirAll(dir, 0755)
		// Harness seeds are always written — the binary owns these files.
		os.WriteFile(absPath, []byte(content), 0644)
	}

	// Operator examples — only created on first run, never overwritten.
	seeds := map[string]string{
		"AGENTIC/RULES/example-code-quality.md": `---
description: Example rule — delete or rename this file
---

## Keep It Simple
Write the minimum code needed. Don't add abstractions, helpers, or
configurability until they're needed more than once.

## Clean As You Go
Dead code, unused imports, stale comments — delete them immediately.
Don't comment things out. Don't leave TODOs. Just remove them.
`,
		"AGENTIC/SKILLS/example-review/SKILL.md": `---
name: example-review
description: Example skill — delete or rename this directory
user-invocable: true
---

# Code Review

Before committing, review all staged changes:

1. Run the test suite and confirm it passes
2. Check for secrets, credentials, or .env values in the diff
3. Verify naming is clear and consistent
4. Confirm no debugging artifacts remain (console.log, print, etc.)
5. Summarize what changed and why
`,
		"AGENTIC/AGENTS/example-reviewer.md": `---
name: example-reviewer
description: Example agent — delete or rename this file
skills:
  - example-review
tools:
  - Read
  - Glob
  - Grep
  - Bash
---

You review code changes for quality, security, and correctness.

Focus on what matters: bugs, security issues, unclear names, dead code.
Skip nitpicks. If the code works and reads clearly, approve it.
`,
		"MCP/example-hello.json": `{
  "command": "echo",
  "args": ["hello from Lore — replace this with a real MCP server"]
}
`,
	}

	for relPath, content := range seeds {
		absPath := filepath.Join(gp, relPath)
		if _, err := os.Stat(absPath); err == nil {
			continue // don't overwrite existing files
		}
		dir := filepath.Dir(absPath)
		os.MkdirAll(dir, 0755)
		os.WriteFile(absPath, []byte(content), 0644)
	}
}
