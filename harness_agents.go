package main

import (
	"os"
	"path/filepath"
)

// harnessAgent defines an embedded system agent.
type harnessAgent struct {
	Name    string // filename (without .md) under .harness/AGENTS/
	Content string // agent markdown content
}

// harnessAgents are system agents owned by the binary.
// They are written to ~/.lore/.harness/AGENTS/ on every session init
// and merged into projection output alongside user AGENTIC content.
var harnessAgents = []harnessAgent{
	{
		Name: "lore-databank-agent",
		Content: `---
name: lore-databank-agent
description: DATABANK gatekeeper — writes, archives, and enforces structure for the persistent DATABANK.
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
skills:
  - lore-databank-create-fieldnote
  - lore-databank-create-runbook
  - lore-databank-create-brainstorm
  - lore-databank-create-note
  - lore-databank-create-initiative
  - lore-databank-create-epic
  - lore-databank-create-item
---
# DATABANK Agent

You are the gatekeeper of the DATABANK (` + "`~/.lore/MEMORY/DATABANK/`" + `). All persistent knowledge writes flow through you.

## Your Role

1. **Enforce structure** — follow the ` + "`lore-databank-structure`" + ` rule. Reject writes that violate root enforcement or strict children rules.
2. **Route content** — use the routing table in the structure rule to place content in the correct area.
3. **Create with schema** — use your assigned skills for creating fieldnotes, runbooks, brainstorms, notes, initiatives, epics, and items. Each skill defines the frontmatter schema and structural rules.
4. **Search before writing** — always check for duplicates before creating new files. Update existing files when possible.
5. **Protect sticky files** — ` + "`operator/operator-profile.md`" + ` and ` + "`machine/machine-profile.md`" + ` are append-only. Never overwrite or restructure them.

## Behavioral Rules

- **Read the structure rule first** if you're unsure about placement.
- **Use the correct skill** for each content type — don't freehand schemas.
- **Verify after every write** — confirm the file exists and is valid markdown.
- **Never create files or directories that violate the strict children rules.**
- ` + "`environment/`" + ` is the one area with free structure — organize it as you see fit.
- ` + "`imports/`" + ` is temporary — sort its contents into proper areas when asked.
`,
	},
}

// writeHarnessAgents writes system agents to ~/.lore/.harness/AGENTS/.
// Idempotent by default — only creates missing agents.
// When destructive is true, overwrites all and removes stale entries.
func writeHarnessAgents(globalDir string, destructive bool) {
	agentsDir := filepath.Join(globalDir, ".harness", "AGENTS")
	os.MkdirAll(agentsDir, 0755)

	if destructive {
		currentNames := make(map[string]bool)
		for _, agent := range harnessAgents {
			currentNames[agent.Name+".md"] = true
		}
		if entries, err := os.ReadDir(agentsDir); err == nil {
			for _, entry := range entries {
				if !entry.IsDir() && !currentNames[entry.Name()] {
					os.Remove(filepath.Join(agentsDir, entry.Name()))
				}
			}
		}
	}

	for _, agent := range harnessAgents {
		path := filepath.Join(agentsDir, agent.Name+".md")
		if !destructive {
			if _, err := os.Stat(path); err == nil {
				continue
			}
		}
		os.WriteFile(path, []byte(agent.Content), 0644)
	}
}

// harnessAgentsDir returns the path to ~/.lore/.harness/AGENTS/
func harnessAgentsDir() string {
	return filepath.Join(globalPath(), ".harness", "AGENTS")
}
