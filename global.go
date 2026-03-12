package main

import (
	"fmt"
	"io/fs"
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
	"SKILLS",
	"RULES",
	"AGENTS",
	"HOOKS",
	"MCP",
	".harness/SKILLS",
	".harness/RULES",
	".harness/AGENTS",
}

// ensureGlobalDir creates the global directory with platform scaffolding
// and seeds example content on first run.
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

// seedGlobalContent writes starter content files if they don't already exist.
// Only creates files on first run — never overwrites user content.
func seedGlobalContent(gp string) {
	// Create LORE.md stub if it doesn't exist
	loreMDPath := filepath.Join(gp, "LORE.md")
	if _, err := os.Stat(loreMDPath); err != nil {
		os.WriteFile(loreMDPath, []byte(globalLoreMDStub), 0644)
	}

	// Harness content — always written (binary owns these files).
	// Content is embedded from the harness/ directory at build time.
	seedHarnessContent(gp)

	// Operator examples — only created on first run, never overwritten.
	seeds := map[string]string{
		"RULES/example-code-quality.md": `---
description: Example rule — delete or rename this file
---

## Keep It Simple
Write the minimum code needed. Don't add abstractions, helpers, or
configurability until they're needed more than once.

## Clean As You Go
Dead code, unused imports, stale comments — delete them immediately.
Don't comment things out. Don't leave TODOs. Just remove them.
`,
		"SKILLS/example-review/SKILL.md": `---
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
		"AGENTS/example-reviewer.md": `---
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

const globalLoreMDStub = `# Global Instructions

> **Lore is not configured yet.** This is the default global LORE.md stub.
> Run /lore-setup to configure your global environment, or replace this file
> with your own global instructions.
>
> Global setup typically includes:
> - Operator preferences (coding style, communication style, tools you use)
> - Machine context (OS, runtimes, key tools installed)
> - Environment details (services, platforms, infrastructure you work with)
>
> After setup, replace this content with instructions you want applied to ALL projects.
> Global LORE.md content is accumulated into every project's mandate file.
`

// seedHarnessContent writes harness content from the embedded harness/ FS.
// Harness content is always overwritten — the binary owns these files.
func seedHarnessContent(gp string) {
	harnessRoot := filepath.Join(gp, ".harness")
	fs.WalkDir(harnessFS, "harness", func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		rel, _ := filepath.Rel("harness", path)
		dst := filepath.Join(harnessRoot, rel)
		data, err := harnessFS.ReadFile(path)
		if err != nil {
			return nil
		}
		os.MkdirAll(filepath.Dir(dst), 0755)
		os.WriteFile(dst, data, 0644)
		return nil
	})
}
