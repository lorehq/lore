package main

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"time"
)

func cmdGenerate(args []string) {
	var platformsFlag string

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--help", "-h":
			fmt.Print(generateHelpText)
			return
		case "--platforms", "-p":
			if i+1 >= len(args) {
				fatal("--platforms requires a value")
			}
			i++
			platformsFlag = args[i]
		}
	}

	// Must be in a Lore instance
	if _, err := os.Stat(".lore/config.json"); err != nil {
		fatal("Not a Lore project (no .lore/config.json). Run from a Lore instance root.")
	}

	var platformList []string
	if platformsFlag != "" {
		// Explicit override
		platformList = parsePlatforms(platformsFlag)
	} else {
		// Read from config
		var err error
		platformList, err = readEnabledPlatforms()
		if err != nil {
			fatal("Cannot read platforms from config: %v\n\nYou can override with: lore generate --platforms <list>", err)
		}
	}

	if len(platformList) == 0 {
		fatal("No platforms enabled. Enable platforms in .lore/config.json or pass --platforms.")
	}

	root, err := os.Getwd()
	if err != nil {
		fatal("Cannot determine working directory: %v", err)
	}
	runProjection(root, platformList)
}

// runProjection runs composition + projection for the given platforms (CLI version).
// Prints progress to stdout and calls fatal() on error.
func runProjection(root string, platformList []string) {
	warnings, err := doProjection(root, platformList)
	for _, w := range warnings {
		fmt.Fprintf(os.Stderr, "Warning: %s\n", w)
	}
	if err != nil {
		fatal("%v", err)
	}
}

// doProjection is the quiet, error-returning core used by both CLI and TUI.
// Returns warnings (non-fatal) and an error (fatal).
func doProjection(root string, platformList []string) (warnings []string, err error) {
	globalAgenticDir := globalPath()
	projectAgenticDir := filepath.Join(root, ".lore")

	ms, err := mergeAgenticSets(globalAgenticDir, projectAgenticDir)
	if err != nil {
		return nil, fmt.Errorf("composition failed: %w", err)
	}

	// Validate cross-references
	for _, agent := range ms.Agents {
		for _, skillName := range agent.Skills {
			if _, ok := ms.Skills[skillName]; !ok {
				warnings = append(warnings, fmt.Sprintf("agent %q references skill %q which was not found", agent.Name, skillName))
			}
		}
	}
	for _, skill := range ms.Skills {
		if skill.Agent != "" {
			if _, ok := ms.Agents[skill.Agent]; !ok {
				warnings = append(warnings, fmt.Sprintf("skill %q references agent %q which was not found", skill.Name, skill.Agent))
			}
		}
	}

	// Project to each platform
	for _, platform := range platformList {
		projector, ok := projectorRegistry[platform]
		if !ok {
			warnings = append(warnings, fmt.Sprintf("no projector for platform %q, skipping", platform))
			continue
		}
		if projErr := projector.Project(root, ms); projErr != nil {
			return warnings, fmt.Errorf("projection failed for %s: %w", platform, projErr)
		}
	}

	// Touch sentinel — marks projection as fresh
	touchSentinel(root)

	return warnings, nil
}

// projectionStale checks whether projected platform files are older than
// their input sources. Returns true if regeneration is needed.
func projectionStale(root string) bool {
	sentinel := filepath.Join(root, ".lore", ".last-generated")
	sentinelInfo, err := os.Stat(sentinel)
	if err != nil {
		return true // no sentinel → never generated
	}
	cutoff := sentinelInfo.ModTime()

	// Key input files
	inputFiles := []string{
		filepath.Join(root, ".lore", "config.json"),
		filepath.Join(root, ".lore", "inherit.json"),
		filepath.Join(root, ".lore", "LORE.md"),
		filepath.Join(globalPath(), "config.json"),
		filepath.Join(globalPath(), "LORE.md"),
	}
	for _, pkgDir := range activeBundleDirs() {
		inputFiles = append(inputFiles,
			filepath.Join(pkgDir, "manifest.json"),
			filepath.Join(pkgDir, "LORE.md"),
		)
		if newestInDir(filepath.Join(pkgDir, "RULES")).After(cutoff) ||
			newestInDir(filepath.Join(pkgDir, "SKILLS")).After(cutoff) ||
			newestInDir(filepath.Join(pkgDir, "AGENTS")).After(cutoff) {
			return true
		}
		if newestInDir(filepath.Join(pkgDir, "MCP")).After(cutoff) {
			return true
		}
	}

	// Check individual files
	for _, p := range inputFiles {
		if info, err := os.Stat(p); err == nil {
			if info.ModTime().After(cutoff) {
				return true
			}
		}
	}

	// Walk content and MCP directories
	for _, dir := range []string{
		filepath.Join(root, ".lore", "RULES"),
		filepath.Join(root, ".lore", "SKILLS"),
		filepath.Join(root, ".lore", "AGENTS"),
		filepath.Join(root, ".lore", "MCP"),
		filepath.Join(globalPath(), "RULES"),
		filepath.Join(globalPath(), "SKILLS"),
		filepath.Join(globalPath(), "AGENTS"),
		filepath.Join(globalPath(), "MCP"),
		filepath.Join(globalPath(), ".harness"),
	} {
		if newestInDir(dir).After(cutoff) {
			return true
		}
	}

	return false
}

// newestInDir walks a directory and returns the newest modification time.
// Returns zero time if the directory doesn't exist or is empty.
func newestInDir(dir string) time.Time {
	var newest time.Time
	filepath.WalkDir(dir, func(_ string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if info, err := d.Info(); err == nil {
			if info.ModTime().After(newest) {
				newest = info.ModTime()
			}
		}
		return nil
	})
	return newest
}

// touchSentinel writes the generation sentinel file.
func touchSentinel(root string) {
	path := filepath.Join(root, ".lore", ".last-generated")
	os.WriteFile(path, []byte(time.Now().Format(time.RFC3339)+"\n"), 0644)
}

const generateHelpText = `Generate platform files from rules, skills, and agents.

Usage: lore generate [--platforms <list>]

Merges content from ~/.config/lore/ (global) and .lore/ (project)
and generates platform-specific files.

By default, reads enabled platforms from .lore/config.json.
Use --platforms to override.

Options:
  -p, --platforms <list>   Comma-separated platforms (reads config if omitted).
                           Valid: claude, copilot, cursor, gemini, windsurf, opencode
  --help, -h               Print this help

Examples:
  lore generate                            # use platforms from config
  lore generate --platforms claude          # override with specific platform
  lore generate --platforms claude,cursor   # override with multiple
`
