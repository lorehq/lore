package main

import (
	"fmt"
	"os"
	"path/filepath"
)

func cmdGenerate(args []string) {
	var platformsFlag string
	var destructive bool

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
		case "--destructive":
			destructive = true
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

	// Ensure global structure (harness skills/agents, DATABANK dirs)
	if err := ensureGlobalDir(destructive); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: global dir setup: %v\n", err)
	}

	runProjection(platformList)
}

// runProjection runs composition + projection for the given platforms.
// Must be called from a Lore project root (cwd has .lore/).
func runProjection(platformList []string) {
	root, err := os.Getwd()
	if err != nil {
		fatal("Cannot determine working directory: %v", err)
	}

	// Composition: merge global + project AGENTIC sets
	globalAgenticDir := filepath.Join(globalPath(), "AGENTIC")
	projectAgenticDir := filepath.Join(root, ".lore", "AGENTIC")

	ms, err := mergeAgenticSets(globalAgenticDir, projectAgenticDir)
	if err != nil {
		fatal("Composition failed: %v", err)
	}

	// Project to each platform
	for _, platform := range platformList {
		projector, ok := projectorRegistry[platform]
		if !ok {
			fmt.Fprintf(os.Stderr, "Warning: no projector for platform %q, skipping\n", platform)
			continue
		}

		fmt.Printf("Projecting %s...\n", platform)
		if err := projector.Project(root, ms); err != nil {
			fatal("Projection failed for %s: %v", platform, err)
		}
	}

	// Summary
	ruleCount := len(ms.Rules)
	skillCount := len(ms.Skills)
	agentCount := len(ms.Agents)
	fmt.Printf("\nProjected %d rules, %d skills, %d agents → %v\n",
		ruleCount, skillCount, agentCount, platformList)
}


const generateHelpText = `Generate platform files from AGENTIC content.

Usage: lore generate [--platforms <list>]

Merges AGENTIC content from ~/.lore/AGENTIC/ (global) and .lore/AGENTIC/
(project) and generates platform-specific files.

By default, reads enabled platforms from .lore/config.json.
Use --platforms to override.

Options:
  -p, --platforms <list>   Comma-separated platforms (reads config if omitted).
                           Valid: claude, copilot, cursor, gemini, windsurf, opencode
  --destructive            Force-overwrite harness content and remove stale entries.
                           Without this flag, existing harness files are preserved.
  --help, -h               Print this help

Examples:
  lore generate                            # use platforms from config
  lore generate --platforms claude          # override with specific platform
  lore generate --platforms claude,cursor   # override with multiple
`
