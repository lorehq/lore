package main

import (
	"fmt"
	"os"
	"path/filepath"
)

// globalPath returns ~/.lore/
func globalPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(os.TempDir(), ".lore")
	}
	return filepath.Join(home, ".lore")
}

var globalDirs = []string{
	"AGENTIC/SKILLS",
	"AGENTIC/RULES",
	"AGENTIC/AGENTS",
	".harness/SKILLS",
	".harness/RULES",
	".harness/AGENTS",
	// DATABANK — 7 root areas
	"MEMORY/DATABANK/environment",
	"MEMORY/DATABANK/fieldnotes",
	"MEMORY/DATABANK/imports",
	"MEMORY/DATABANK/machine",
	"MEMORY/DATABANK/operator",
	"MEMORY/DATABANK/runbooks",
	// workspace strict children
	"MEMORY/DATABANK/workspace/drafts/brainstorms",
	"MEMORY/DATABANK/workspace/drafts/notes",
	"MEMORY/DATABANK/workspace/projects",
	"MEMORY/DATABANK/workspace/work-items/initiatives",
	"MEMORY/HOT",
}

const operatorProfileContent = `---
name: operator-profile
description: Operator identity, preferences, and working style.
---
# Operator Profile

## Identity

- **Name:**
- **Role:**
- **Organization:**

## Accounts

<!-- VCS logins, cloud accounts, Docker Hub, etc. -->

## Preferences

<!-- Working style, communication tone, tool preferences. -->
`

const machineProfileContent = `---
name: machine-profile
description: This machine's identity — hardware, OS, runtimes, and local configuration.
---
# Machine Profile

## Hardware

- **Hostname:**
- **CPU:**
- **RAM:**
- **Storage:**

## Operating System

- **OS:**
- **Kernel:**
- **Shell:**

## Runtimes

<!-- Installed runtimes: Node, Python, Go, .NET, Java, etc. -->

## CLI Tools

<!-- Key CLI tools: docker, git, gh, kubectl, terraform, ansible, etc. -->
`

const composeContent = `name: lore
services:
  lore-memory:
    image: lorehq/lore-memory:latest
    ports:
      - '9184:8080'
    volumes:
      - ./MEMORY/DATABANK:/data/DATABANK:ro
      - ./MEMORY/HOT:/data/redis
    restart: unless-stopped
`

// ensureGlobalDir creates ~/.lore/ with expected structure.
// Idempotent by default — creates what's missing, never overwrites existing content.
// When destructive is true, harness content is force-overwritten and stale entries removed.
func ensureGlobalDir(destructive bool) error {
	gp := globalPath()

	// Directories
	for _, dir := range globalDirs {
		if err := os.MkdirAll(filepath.Join(gp, dir), 0755); err != nil {
			return fmt.Errorf("create dir %s: %w", dir, err)
		}
	}

	// Harness skills, rules, agents
	writeHarnessSkills(gp, destructive)
	writeHarnessRules(gp, destructive)
	writeHarnessAgents(gp, destructive)

	// Sticky profiles — only if missing
	stickyFiles := []struct {
		rel     string
		content string
	}{
		{"MEMORY/DATABANK/operator/operator-profile.md", operatorProfileContent},
		{"MEMORY/DATABANK/machine/machine-profile.md", machineProfileContent},
	}
	for _, sf := range stickyFiles {
		p := filepath.Join(gp, sf.rel)
		if _, err := os.Stat(p); os.IsNotExist(err) {
			if err := os.WriteFile(p, []byte(sf.content), 0644); err != nil {
				return fmt.Errorf("write %s: %w", sf.rel, err)
			}
		}
	}

	// docker-compose.yml — create if missing
	composePath := filepath.Join(gp, "docker-compose.yml")
	if _, err := os.Stat(composePath); os.IsNotExist(err) {
		if err := os.WriteFile(composePath, []byte(composeContent), 0644); err != nil {
			return fmt.Errorf("write docker-compose.yml: %w", err)
		}
	}

	return nil
}
