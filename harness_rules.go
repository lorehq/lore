package main

import (
	"os"
	"path/filepath"
)

// harnessRule defines an embedded system rule.
type harnessRule struct {
	Name    string // filename (without .md) under .harness/RULES/
	Content string // rule markdown content
}

// harnessRules are system rules owned by the binary.
// They are written to ~/.lore/.harness/RULES/ on every session init
// and merged into projection output alongside user AGENTIC content.
var harnessRules = []harnessRule{
	{
		Name: "lore-databank-structure",
		Content: `---
name: lore-databank-structure
description: DATABANK directory structure, enforcement rules, routing table, and writing conventions.
---
# DATABANK Structure

The DATABANK lives at ` + "`~/.lore/MEMORY/DATABANK/`" + `.

## Directory Tree

` + "```" + `
~/.lore/MEMORY/DATABANK/
│
├── environment/                         # External world — services, platforms, tooling
│   └── {topic}.md                       #   Agent-organized, free structure
│
├── fieldnotes/                          # Environmental snags & gotchas
│   └── {name}/                          #   One dir per fieldnote
│       └── FIELDNOTE.md
│
├── imports/                             # Staging area — unsorted incoming docs
│   └── {anything}                       #   Temporary holding, sort into proper areas
│
├── machine/                             # This machine's identity & infrastructure
│   ├── machine-profile.md               #   STICKY — auto-created from stub if missing
│   └── {supporting-docs}.md
│
├── operator/                            # Operator identity & preferences
│   ├── operator-profile.md              #   STICKY — auto-created from stub if missing
│   └── {supporting-docs}.md
│
├── runbooks/                            # Operational procedures
│   ├── system/                          #   Harness/infra runbooks
│   ├── first-session/                   #   Onboarding runbooks
│   └── {category}/{name}.md
│
└── workspace/                           # Operator/agent collaboration
    ├── drafts/                          #   WIP content (ONLY 2 children)
    │   ├── brainstorms/                 #     Folder-per-brainstorm, NO loose files
    │   │   └── {slug}/
    │   │       ├── index.md
    │   │       └── (supporting docs, sketches, diagrams)
    │   └── notes/                       #     Single files ONLY, NO folders
    │       └── {slug}.md
    │
    ├── projects/                        #   Per-project session logs
    │   └── {project-name}/
    │       └── session-log-{DATE}.md
    │
    └── work-items/                      #   Jira-like 3-tier, nested only
        └── initiatives/
            └── {slug}/
                ├── index.md
                ├── tasks.md
                └── epics/
                    └── {slug}/
                        ├── index.md
                        ├── tasks.md
                        └── items/
                            └── {slug}/
                                ├── index.md
                                └── tasks.md
` + "```" + `

## Root Enforcement

**7 folders at DATABANK root. Nothing else. No loose files.**

| Folder | Layer | Purpose |
|--------|-------|---------|
| ` + "`environment/`" + ` | Knowledge | External world: services, endpoints, SCM repos, platforms, tooling config |
| ` + "`fieldnotes/`" + ` | Knowledge | Snags, gotchas, quirks discovered during operation |
| ` + "`imports/`" + ` | Staging | Unsorted incoming docs — sort into proper areas promptly |
| ` + "`machine/`" + ` | Identity | This host: hardware, OS, runtimes, local config |
| ` + "`operator/`" + ` | Identity | Who the operator is: profile, preferences, org identity |
| ` + "`runbooks/`" + ` | Knowledge | Step-by-step operational procedures |
| ` + "`workspace/`" + ` | Work | Active collaboration: drafts, projects, tracked work |

## Strict Children Rules

These paths have fixed children. **Creating anything else at these levels is forbidden.**

| Path | Allowed children | Rule |
|------|-----------------|------|
| ` + "`workspace/`" + ` | ` + "`drafts/`" + `, ` + "`projects/`" + `, ` + "`work-items/`" + ` | 3 dirs only, nothing else |
| ` + "`workspace/drafts/`" + ` | ` + "`brainstorms/`" + `, ` + "`notes/`" + ` | 2 dirs only, nothing else |
| ` + "`workspace/drafts/brainstorms/`" + ` | ` + "`{slug}/`" + ` dirs only | NO loose files — every brainstorm is a folder |
| ` + "`workspace/drafts/notes/`" + ` | ` + "`{slug}.md`" + ` files only | NO folders — flat file list |
| ` + "`workspace/work-items/`" + ` | ` + "`initiatives/`" + ` | 1 dir only — entry point is always an initiative |

## Sticky Profiles

Two files are auto-created from stubs if missing. **Append only, never overwrite:**

- ` + "`operator/operator-profile.md`" + ` — operator identity, preferences, accounts
- ` + "`machine/machine-profile.md`" + ` — this host's hardware, OS, runtimes, tools

## Routing Rules

| Content Type | Destination | Format |
|---|---|---|
| Snag / gotcha / quirk | ` + "`fieldnotes/{name}/FIELDNOTE.md`" + ` | Frontmatter + Snags + Workaround |
| Procedure / how-to | ` + "`runbooks/{category}/{name}.md`" + ` | Step-by-step with snags section |
| Platform / service / tool fact | ` + "`environment/{topic}.md`" + ` | Factual reference (agent-organized) |
| Machine specs / local config | ` + "`machine/machine-profile.md`" + ` or supporting doc | Append to profile or create doc |
| Operator preferences / identity | ` + "`operator/operator-profile.md`" + ` or supporting doc | Append to profile or create doc |
| Session log archive | ` + "`workspace/projects/{project-name}/session-log-{DATE}.md`" + ` | Timestamped session notes |
| Brainstorm / design exploration | ` + "`workspace/drafts/brainstorms/{slug}/index.md`" + ` | Folder with supporting material |
| Quick note / scratch | ` + "`workspace/drafts/notes/{slug}.md`" + ` | Single file, minimal frontmatter |
| Strategic initiative (months) | ` + "`workspace/work-items/initiatives/{slug}/`" + ` | index.md + tasks.md + epics/ |
| Tactical epic (weeks) | nested under initiative ` + "`epics/{slug}/`" + ` | index.md + tasks.md + items/ |
| Deliverable item (days) | nested under epic ` + "`items/{slug}/`" + ` | index.md + tasks.md |
| Unsorted / incoming | ` + "`imports/{anything}`" + ` | Temporary — sort into proper area |

## Work-Item Hierarchy

Three-tier, Jira-compatible, **nested only** (no standalone epics or items):

| Tier | Scope | Contains |
|------|-------|----------|
| **Initiative** | Strategic, months | index.md, tasks.md, epics/ |
| **Epic** | Tactical, weeks | index.md, tasks.md, items/ |
| **Item** | Deliverable, days | index.md, tasks.md |

Hierarchy is expressed by nesting: ` + "`initiatives/auth-system/epics/token-rotation/items/rotate-api-keys/`" + `. Path encodes lineage.

## Project Name Convention

Project names use the dashed path: ` + "`/home/user/projects/foo`" + ` → ` + "`home-user-projects-foo`" + `.

## Writing Rules

1. **Frontmatter required** on all new files: ` + "`name`" + ` and ` + "`description`" + ` at minimum.
2. **No duplicates** — search before creating. Update existing files when possible.
3. **30-80 lines** for fieldnotes. Runbooks can be longer but keep sections focused.
4. **Kebab-case** for all filenames and directory names.
5. **Create parent dirs** — always ` + "`mkdir -p`" + ` before writing.
6. **Verify after write** — confirm the file exists and is valid markdown.
7. **Never create files/dirs that violate the strict children rules above.**

## Session Log Format

` + "```" + `markdown
---
name: session-log-YYYY-MM-DD
description: Session notes archived from hot memory
project: {project-name}
archived_at: {ISO-8601}
---
# Session Log — YYYY-MM-DD

## Notes

### {note-key}
{content}
` + "```" + `
`,
	},
}

// writeHarnessRules writes system rules to ~/.lore/.harness/RULES/.
// Idempotent by default — only creates missing rules.
// When destructive is true, overwrites all and removes stale entries.
func writeHarnessRules(globalDir string, destructive bool) {
	rulesDir := filepath.Join(globalDir, ".harness", "RULES")
	os.MkdirAll(rulesDir, 0755)

	if destructive {
		currentNames := make(map[string]bool)
		for _, rule := range harnessRules {
			currentNames[rule.Name+".md"] = true
		}
		if entries, err := os.ReadDir(rulesDir); err == nil {
			for _, entry := range entries {
				if !entry.IsDir() && !currentNames[entry.Name()] {
					os.Remove(filepath.Join(rulesDir, entry.Name()))
				}
			}
		}
	}

	for _, rule := range harnessRules {
		path := filepath.Join(rulesDir, rule.Name+".md")
		if !destructive {
			if _, err := os.Stat(path); err == nil {
				continue
			}
		}
		os.WriteFile(path, []byte(rule.Content), 0644)
	}
}

// harnessRulesDir returns the path to ~/.lore/.harness/RULES/
func harnessRulesDir() string {
	return filepath.Join(globalPath(), ".harness", "RULES")
}
