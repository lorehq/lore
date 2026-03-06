package main

import (
	"os"
	"path/filepath"
)

// harnessSkill defines an embedded system skill.
type harnessSkill struct {
	Name    string // directory name under .harness/SKILLS/
	Content string // SKILL.md content
}

// harnessSkills are system skills owned by the binary.
// They are written to ~/.lore/.harness/SKILLS/ on every session init
// and merged into projection output alongside user AGENTIC content.
var harnessSkills = []harnessSkill{
	// ── Databank agent creation skills ─────────────────────────────
	{
		Name: "lore-databank-create-fieldnote",
		Content: `---
name: lore-databank-create-fieldnote
description: Create a fieldnote — captures a non-obvious environmental snag (gotcha, quirk, surprise)
user-invocable: false
agent: lore-databank-agent
---
# Create Fieldnote

**Every snag (gotcha, quirk) becomes a fieldnote. No exceptions.**

Fieldnotes capture environmental knowledge from failures — auth quirks, encoding issues, parameter tricks, platform incompatibilities.

## When to Create

**Mandatory**: Auth quirks, encoding issues, parameter tricks, platform incompatibilities, anything that surprised you during execution.

**Not fieldnotes**: Procedural commands, multi-step workflows — those are runbooks.

## Process

1. **Search first** — check existing fieldnotes to avoid duplicates.
2. Create the directory: ` + "`~/.lore/MEMORY/DATABANK/fieldnotes/{name}/`" + `
3. Write ` + "`FIELDNOTE.md`" + ` inside it.
4. Verify the file exists and is valid markdown.

## Schema

` + "```" + `markdown
---
name: {slug}
description: One-line description of the snag
---
# {Title}

[Context — 2-3 lines on when this applies]

## Snags
[The actual value — what surprised you]

## Workaround
[How to fix or avoid the issue]
` + "```" + `

## Rules

- **30-80 lines** — under 30 lacks context, over 80 floods context window.
- **Naming**: ` + "`<service>-<action>-<object>`" + ` (e.g., ` + "`eslint-10-node-18-crash`" + `).
- **Do not use the ` + "`lore-`" + ` prefix** — reserved for harness system items.
- **One fieldnote per interaction method** (API, CLI, MCP, SDK, UI).
- **Kebab-case** for the directory name.
`,
	},
	{
		Name: "lore-databank-create-runbook",
		Content: `---
name: lore-databank-create-runbook
description: Create a runbook — captures a multi-step operational procedure
user-invocable: false
agent: lore-databank-agent
---
# Create Runbook

Runbooks are step-by-step operational procedures. They live in ` + "`~/.lore/MEMORY/DATABANK/runbooks/`" + `, organized by category.

## When to Create

Multi-step procedures that are likely to be repeated: deployments, migrations, setup flows, maintenance tasks, troubleshooting sequences.

**Not runbooks**: Single-fact discoveries — those are fieldnotes.

## Process

1. **Search first** — check existing runbooks to avoid duplicates.
2. Determine the category (` + "`system/`" + `, ` + "`first-session/`" + `, or a topic-based category).
3. Write to ` + "`~/.lore/MEMORY/DATABANK/runbooks/{category}/{slug}.md`" + `.
4. Verify the file exists.

## Schema

` + "```" + `markdown
---
name: {slug}
description: One-line description of the procedure
---
# {Title}

[Context — when and why to run this]

## Prerequisites

[What must be true before starting]

## Steps

1. [Step one]
2. [Step two]
3. [Step three]

## Snags

[Known gotchas encountered during this procedure — link to fieldnotes if they exist]

## Verification

[How to confirm the procedure succeeded]
` + "```" + `

## Rules

- **Kebab-case** for the filename.
- Keep sections focused — split oversized runbooks into separate procedures.
- Include a **Snags** section even if empty — it signals awareness.
- Categories: ` + "`system/`" + ` (harness/infra), ` + "`first-session/`" + ` (onboarding), or create a new category dir.
`,
	},
	{
		Name: "lore-databank-create-brainstorm",
		Content: `---
name: lore-databank-create-brainstorm
description: Create a brainstorm — a design exploration or idea sketch with supporting material
user-invocable: false
agent: lore-databank-agent
---
# Create Brainstorm

Brainstorms are design explorations, idea sketches, or architectural proposals. Each brainstorm is a **folder** with an ` + "`index.md`" + ` and optional supporting documents.

## Process

1. **Search first** — check existing brainstorms to avoid duplicates.
2. Create the directory: ` + "`~/.lore/MEMORY/DATABANK/workspace/drafts/brainstorms/{slug}/`" + `
3. Write ` + "`index.md`" + ` inside it.
4. Add supporting docs, sketches, or diagrams as needed.

## Schema

` + "```" + `markdown
---
title: {Title}
created: {YYYY-MM-DD}
---
# {Title}

## Problem

[What problem or opportunity is being explored]

## Proposal

[The idea, approach, or design being brainstormed]

## Open Questions

[Unresolved decisions, tradeoffs, unknowns]
` + "```" + `

## Rules

- **Always a folder** — never a loose file in ` + "`brainstorms/`" + `.
- **No status field** — brainstorms are reference material, not tracked work.
- **Kebab-case** for the directory name.
- **To promote**: archive the brainstorm, create a fresh initiative or work item.
- Supporting docs (diagrams, sketches, data) go alongside ` + "`index.md`" + ` in the same folder.
`,
	},
	{
		Name: "lore-databank-create-note",
		Content: `---
name: lore-databank-create-note
description: Create a note — a quick scratch capture or reminder
user-invocable: false
agent: lore-databank-agent
---
# Create Note

Notes are quick captures — scratch thoughts, reminders, decisions to revisit. Single files, minimal overhead.

## Process

1. Write to ` + "`~/.lore/MEMORY/DATABANK/workspace/drafts/notes/{slug}.md`" + `.
2. That's it. No folder, no supporting docs.

## Schema

` + "```" + `markdown
---
title: {Title}
status: open
created: {YYYY-MM-DD}
---

{Content — preserve the operator's words, don't over-polish}
` + "```" + `

## Rules

- **Single file only** — no folders in ` + "`notes/`" + `.
- **Minimal frontmatter**: ` + "`title`" + `, ` + "`status`" + ` (` + "`open`" + ` or ` + "`resolved`" + `), ` + "`created`" + `.
- **Kebab-case** for the filename.
- When resolved, change status to ` + "`resolved`" + ` — don't delete.
- Don't over-polish — preserve the operator's words and intent.
`,
	},
	{
		Name: "lore-databank-create-initiative",
		Content: `---
name: lore-databank-create-initiative
description: Create an initiative — a strategic, months-long body of work (Jira initiative equivalent)
user-invocable: false
agent: lore-databank-agent
---
# Create Initiative

Initiatives are the top-level work-item tier. Strategic, months-long scope. Contains epics.

## Process

1. **Search first** — check existing initiatives to avoid duplicates.
2. Create the directory: ` + "`~/.lore/MEMORY/DATABANK/workspace/work-items/initiatives/{slug}/`" + `
3. Write ` + "`index.md`" + ` — the initiative description and goals.
4. Write ` + "`tasks.md`" + ` — agent-managed task checklist.
5. Create ` + "`epics/`" + ` directory.

## Schema — index.md

` + "```" + `markdown
---
title: {Title}
status: active
created: {YYYY-MM-DD}
updated: {YYYY-MM-DD}
summary: One-line summary of the initiative
---
# {Title}

## Goal

[What this initiative aims to achieve]

## Scope

[What's in and out of scope]

## Success Criteria

[How we know it's done]
` + "```" + `

## Schema — tasks.md

` + "```" + `markdown
# Tasks

## Active

- [ ] {task description}

## Done

- [x] {completed task}
` + "```" + `

## Rules

- **Kebab-case** for the directory name.
- ` + "`status`" + ` values: ` + "`active`" + `, ` + "`paused`" + `, ` + "`completed`" + `, ` + "`cancelled`" + `.
- ` + "`tasks.md`" + ` is agent-managed — agents update it freely. ` + "`index.md`" + ` is operator-approved.
- Epics nest inside: ` + "`{initiative}/epics/{epic-slug}/`" + `.
`,
	},
	{
		Name: "lore-databank-create-epic",
		Content: `---
name: lore-databank-create-epic
description: Create an epic — a tactical, weeks-long body of work nested under an initiative
user-invocable: false
agent: lore-databank-agent
---
# Create Epic

Epics are the middle work-item tier. Tactical, weeks-long scope. Always nested under an initiative.

## Process

1. **Identify the parent initiative** — epics cannot exist standalone.
2. Create the directory: ` + "`{initiative}/epics/{slug}/`" + `
3. Write ` + "`index.md`" + ` — the epic description.
4. Write ` + "`tasks.md`" + ` — agent-managed task checklist.
5. Create ` + "`items/`" + ` directory.

## Schema — index.md

` + "```" + `markdown
---
title: {Title}
status: active
created: {YYYY-MM-DD}
updated: {YYYY-MM-DD}
summary: One-line summary of the epic
---
# {Title}

## Goal

[What this epic delivers]

## Scope

[Specific deliverables]
` + "```" + `

## Schema — tasks.md

` + "```" + `markdown
# Tasks

## Active

- [ ] {task description}

## Done

- [x] {completed task}
` + "```" + `

## Rules

- **Always nested** under ` + "`initiatives/{slug}/epics/`" + ` — no standalone epics.
- **Kebab-case** for the directory name.
- ` + "`status`" + ` values: ` + "`active`" + `, ` + "`paused`" + `, ` + "`completed`" + `, ` + "`cancelled`" + `.
- Items nest inside: ` + "`{epic}/items/{item-slug}/`" + `.
`,
	},
	{
		Name: "lore-databank-create-item",
		Content: `---
name: lore-databank-create-item
description: Create an item — a deliverable, days-long unit of work nested under an epic
user-invocable: false
agent: lore-databank-agent
---
# Create Item

Items are the leaf work-item tier. Deliverables, days-long scope. Always nested under an epic.

## Process

1. **Identify the parent epic** — items cannot exist standalone.
2. Create the directory: ` + "`{epic}/items/{slug}/`" + `
3. Write ` + "`index.md`" + ` — the item description.
4. Write ` + "`tasks.md`" + ` — agent-managed task checklist.

## Schema — index.md

` + "```" + `markdown
---
title: {Title}
status: active
created: {YYYY-MM-DD}
updated: {YYYY-MM-DD}
summary: One-line summary of the item
---
# {Title}

## Deliverable

[What this item produces]

## Acceptance Criteria

[How we know it's done]
` + "```" + `

## Schema — tasks.md

` + "```" + `markdown
# Tasks

## Active

- [ ] {task description}

## Done

- [x] {completed task}
` + "```" + `

## Rules

- **Always nested** under ` + "`epics/{slug}/items/`" + ` — no standalone items.
- **Kebab-case** for the directory name.
- ` + "`status`" + ` values: ` + "`active`" + `, ` + "`paused`" + `, ` + "`completed`" + `, ` + "`cancelled`" + `.
- Items are leaf nodes — no further nesting.
`,
	},
	// ── End databank agent skills ──────────────────────────────────
	{
		Name: "lore",
		Content: `---
name: lore
description: Lore harness — status, memory, burn, repair
type: command
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, TaskCreate, TaskUpdate
---
# Lore

Unified entry point for Lore harness commands.

## Routing

| Input | Route |
|-------|-------|
| ` + "`/lore`" + ` (no args) | → **Help** |
| ` + "`/lore status`" + ` | → ` + "`lore status`" + ` (CLI) |
| ` + "`/lore memory`" + ` | → ` + "`lore memory start`" + ` (CLI) |
| ` + "`/lore memory stop`" + ` | → ` + "`lore memory stop`" + ` (CLI) |
| ` + "`/lore memory status`" + ` | → ` + "`lore memory status`" + ` (CLI) |
| ` + "`/lore memory burn`" + ` | → **Burn** (agent workflow below) |
| ` + "`/lore memory rem`" + ` | → **Defrag** (agent workflow below) |
| ` + "`/lore repair`" + ` | → **Repair** (agent workflow below) |

CLI commands run via Bash: ` + "`lore <subcommand>`" + `.

## Help

` + "```" + `
/lore                    Show this help
/lore status             Instance health
/lore memory             Start the memory engine
/lore memory stop        Stop the memory engine
/lore memory status      Memory engine health check
/lore memory burn        Promote hot facts to the DATABANK
/lore memory rem         DATABANK defrag
/lore repair             Diagnose and fix a harness bug
` + "```" + `

---

## Burn

Promote hot session facts from Redis into the persistent DATABANK.

### Process

**1. Scan Hot Memory**

Use the ` + "`lore_hot_recall`" + ` MCP tool:
` + "```" + `
lore_hot_recall(limit: 20)
` + "```" + `

Fallback via redis-cli (keys are scoped per project):
` + "```" + `bash
docker exec lore-lore-memory-1 redis-cli SMEMBERS "lore:hot:idx:all"
docker exec lore-lore-memory-1 redis-cli HGETALL "lore:hot:<key>"
` + "```" + `

**2. Heat Filter**

Present only facts above the heat threshold (score > 1.0). Show key, content, hit count, and score.

**3. Present for Approval**

Show a numbered list. For each:
- **Key**: hot memory identifier
- **Score**: current heat score
- **Content**: fact or draft fieldnote body
- **Proposed location**: where it would land in the DATABANK

Operator selects which facts to promote, skip, or discard.

**4. Commit**

Delegate all DATABANK writes to the ` + "`lore-databank`" + ` agent (it enforces structure and routing rules). For each approved fact, the agent routes to:

| Hot memory type | DATABANK destination |
|---|---|
| ` + "`fieldnote:*`" + ` | ` + "`fieldnotes/{name}/FIELDNOTE.md`" + ` |
| Environment facts | ` + "`environment/{topic}.md`" + ` |
| Operator preferences | ` + "`operator/operator-profile.md`" + ` (append only) |
| Procedural knowledge | ` + "`runbooks/{category}/{name}.md`" + ` |

Hot cache entries remain after promotion (they decay naturally). Do not delete them.

**5. Archive Session Notes**

After burn, archive project-scoped session notes using the ` + "`lore-databank-archive`" + ` skill. This copies ` + "`note:*`" + ` entries to ` + "`MEMORY/DATABANK/workspace/projects/{project-name}/session-log-{date}.md`" + ` and removes them from Redis.

---

## Defrag

Restructure the global DATABANK by content rather than creation order.

Run after the environment is substantially documented — not before.

1. Check memory engine is running.
2. Scan ` + "`~/.lore/MEMORY/DATABANK/`" + ` for structural issues (duplicates, misrouted content, oversized files).
3. Present proposed changes to operator for approval.
4. Execute on a branch:
   ` + "```" + `bash
   cd ~/.lore && git checkout -b databank-defrag-$(date +%Y%m%d)
   ` + "```" + `
5. After operator review, merge.

See ` + "`~/.lore/MEMORY/DATABANK/runbooks/system/knowledge-defrag.md`" + ` for the full procedure.

---

## Repair

Diagnose and fix a harness bug.

1. Ask the operator: What's broken? How to reproduce? Which repo?
2. Reproduce → Isolate → Fix in source → Test → Report → Capture
3. Use TaskCreate to track multi-step repairs.

### Snags

- Debug output goes to /tmp, never stderr — stderr corrupts hook responses.
- Always fix in the source repo, never patch the instance directly.
- The operator is your eyes — ask them to confirm behavior you can't observe.
`,
	},
	{
		Name: "lore-databank-archive",
		Content: `---
name: lore-databank-archive
description: Archive project session notes from hot Redis memory to the DATABANK as a session log
user-invocable: false
allowed-tools: Bash, Read, Write, Glob
---
# Archive Session Notes

Archive project-scoped session notes from Redis hot memory into a persistent session log in the DATABANK.

## Process

**1. Identify Project**

Derive the project name (Claude-style dashed path):
` + "```" + `bash
# e.g. /home/andrew/Github/lore-engineering → home-andrew-Github-lore-engineering
PROJECT=$(pwd | sed 's|^/||; s|/|-|g')
` + "```" + `

**2. Fetch Session Notes**

Pull all session notes for this project from Redis:
` + "```" + `bash
docker exec lore-lore-memory-1 redis-cli SMEMBERS "lore:hot:idx:project:${PROJECT}"
` + "```" + `

For each key, fetch the hash:
` + "```" + `bash
docker exec lore-lore-memory-1 redis-cli HGETALL "${KEY}"
` + "```" + `

Filter to ` + "`type=session-note`" + ` entries only. Skip fieldnotes (those graduate separately via burn).

**3. Build Session Log**

Write to: ` + "`~/.lore/MEMORY/DATABANK/workspace/projects/${PROJECT}/session-log-$(date +%Y-%m-%d).md`" + `

Format:
` + "```" + `markdown
---
name: session-log-YYYY-MM-DD
description: Session notes archived from hot memory
project: {PROJECT}
archived_at: {ISO-8601}
---
# Session Log — YYYY-MM-DD

## Notes

### {note-key}
{content}

### {note-key-2}
{content}
` + "```" + `

If a session log already exists for today, **append** new notes — do not overwrite.

**4. Cleanup**

After successful write, remove archived session notes from Redis:
` + "```" + `bash
docker exec lore-lore-memory-1 redis-cli DEL "${KEY}"
docker exec lore-lore-memory-1 redis-cli SREM "lore:hot:idx:project:${PROJECT}" "${KEY}"
docker exec lore-lore-memory-1 redis-cli SREM "lore:hot:idx:all" "${KEY}"
` + "```" + `

Do NOT remove global-scoped entries — those persist across projects.

**5. Verify**

Confirm the session log file exists and contains the archived notes.
`,
	},
	{
		Name: "lore",
		Content: `---
name: lore
description: Lore harness — status, memory, burn, repair
type: command
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, TaskCreate, TaskUpdate
---
# Lore

Unified entry point for Lore harness commands.

## Routing

| Input | Route |
|-------|-------|
| ` + "`/lore`" + ` (no args) | → **Help** |
| ` + "`/lore status`" + ` | → ` + "`lore status`" + ` (CLI) |
| ` + "`/lore memory`" + ` | → ` + "`lore memory start`" + ` (CLI) |
| ` + "`/lore memory stop`" + ` | → ` + "`lore memory stop`" + ` (CLI) |
| ` + "`/lore memory status`" + ` | → ` + "`lore memory status`" + ` (CLI) |
| ` + "`/lore memory burn`" + ` | → **Burn** (agent workflow below) |
| ` + "`/lore memory rem`" + ` | → **Defrag** (agent workflow below) |
| ` + "`/lore repair`" + ` | → **Repair** (agent workflow below) |

CLI commands run via Bash: ` + "`lore <subcommand>`" + `.

## Help

` + "```" + `
/lore                    Show this help
/lore status             Instance health
/lore memory             Start the memory engine
/lore memory stop        Stop the memory engine
/lore memory status      Memory engine health check
/lore memory burn        Promote hot facts to the DATABANK
/lore memory rem         DATABANK defrag
/lore repair             Diagnose and fix a harness bug
` + "```" + `

---

## Burn

Promote hot session facts from Redis into the persistent DATABANK.

### Process

**1. Scan Hot Memory**

Use the ` + "`lore_hot_recall`" + ` MCP tool:
` + "```" + `
lore_hot_recall(limit: 20)
` + "```" + `

Fallback via redis-cli (keys are scoped per project):
` + "```" + `bash
docker exec lore-lore-memory-1 redis-cli SMEMBERS "lore:hot:idx:all"
docker exec lore-lore-memory-1 redis-cli HGETALL "lore:hot:<key>"
` + "```" + `

**2. Heat Filter**

Present only facts above the heat threshold (score > 1.0). Show key, content, hit count, and score.

**3. Present for Approval**

Show a numbered list. For each:
- **Key**: hot memory identifier
- **Score**: current heat score
- **Content**: fact or draft fieldnote body
- **Proposed location**: where it would land in the DATABANK

Operator selects which facts to promote, skip, or discard.

**4. Commit**

Delegate all DATABANK writes to the ` + "`lore-databank-agent`" + ` (it enforces structure and routing rules). For each approved fact, the agent routes to:

| Hot memory type | DATABANK destination |
|---|---|
| ` + "`fieldnote:*`" + ` | ` + "`fieldnotes/{name}/FIELDNOTE.md`" + ` |
| Environment facts | ` + "`environment/{topic}.md`" + ` |
| Operator preferences | ` + "`operator-profile.md`" + ` (append only) |
| Procedural knowledge | ` + "`runbooks/{category}/{name}.md`" + ` |

Hot cache entries remain after promotion (they decay naturally). Do not delete them.

**5. Archive Session Notes**

After burn, archive project-scoped session notes using the ` + "`lore-databank-archive`" + ` skill. This copies ` + "`note:*`" + ` entries to ` + "`MEMORY/DATABANK/workspace/projects/{project-name}/session-log-{date}.md`" + ` and removes them from Redis.

---

## Defrag

Restructure the global DATABANK by content rather than creation order.

Run after the environment is substantially documented — not before.

1. Check memory engine is running.
2. Scan ` + "`~/.lore/MEMORY/DATABANK/`" + ` for structural issues (duplicates, misrouted content, oversized files).
3. Present proposed changes to operator for approval.
4. Execute on a branch:
   ` + "```" + `bash
   cd ~/.lore && git checkout -b databank-defrag-$(date +%Y%m%d)
   ` + "```" + `
5. After operator review, merge.

See ` + "`~/.lore/MEMORY/DATABANK/runbooks/system/knowledge-defrag.md`" + ` for the full procedure.

---

## Repair

Diagnose and fix a harness bug.

1. Ask the operator: What's broken? How to reproduce? Which repo?
2. Reproduce → Isolate → Fix in source → Test → Report → Capture
3. Use TaskCreate to track multi-step repairs.

### Snags

- Debug output goes to /tmp, never stderr — stderr corrupts hook responses.
- Always fix in the source repo, never patch the instance directly.
- The operator is your eyes — ask them to confirm behavior you can't observe.
`,
	},
	{
		Name: "lore-delegate",
		Content: `---
name: lore-delegate
description: Delegation Protocol — enforcing the Subagent Envelope Contract and upward intelligence flow.
user-invocable: false
---
# Delegation Protocol

Delegation is the primary method of context-efficient execution. Enforce the Envelope Contract to ensure the harness grows smarter with every subagent return.

## The Subagent Envelope Contract

In every worker prompt, include a constraint for environmental intelligence reporting.

**The Prompt Directive**:
> "Return your execution results alongside a separate [ENVELOPE-REPORT] section documenting any gotchas, pitfalls, newly encountered endpoints, or file topology found during the task."

## Worker Prompt Template

` + "```" + `text
Objective: [Concrete, resolved task.]
Success Criteria: [Pass/fail conditions.]
Scope/Boundaries: [Allowed paths, services, and repo boundaries.]
[ENVELOPE-CONTRACT]: Required gotchas/topology report in response.
` + "```" + `

## Post-Return Intelligence Extraction

When a worker returns:
1. **Extract**: Pull the [ENVELOPE-REPORT] data.
2. **Commit**: Write snags/topology to Hot Memory (Redis).
3. **Propose**: Flag high-signal items for graduation to the DATABANK.
`,
	},
	{
		Name: "lore-semantic-search",
		Content: `---
name: lore-semantic-search
description: Query the DATABANK using semantic search via MCP tools or direct HTTP
user-invocable: false
---
# Semantic Search

**Preferred:** Use the ` + "`lore_search`" + ` MCP tool when available — it handles search + path resolution in a single call.

## Fallback: curl

` + "```" + `bash
# Default: returns file paths
curl -s "http://localhost:9184/search?q=your+query&k=5"

# Full mode: includes score and snippet per result
curl -s "http://localhost:9184/search?q=your+query&k=5&mode=full"
` + "```" + `

## Health Check

` + "```" + `bash
curl -sf http://localhost:9184/health
` + "```" + `

## Snags

- Model loading takes 30-60s on first start — poll ` + "`/health`" + ` until ready.
- WebFetch fails on localhost — always use Bash (curl) for memory engine endpoints.
`,
	},
}

// writeHarnessSkills writes system skills to ~/.lore/.harness/SKILLS/.
// Idempotent by default — only creates missing skills.
// When destructive is true, overwrites all and removes stale entries.
func writeHarnessSkills(globalDir string, destructive bool) {
	dir := filepath.Join(globalDir, ".harness", "SKILLS")
	os.MkdirAll(dir, 0755)

	if destructive {
		// Remove entries not in current binary
		currentNames := make(map[string]bool)
		for _, skill := range harnessSkills {
			currentNames[skill.Name] = true
		}
		if entries, err := os.ReadDir(dir); err == nil {
			for _, entry := range entries {
				if entry.IsDir() && !currentNames[entry.Name()] {
					os.RemoveAll(filepath.Join(dir, entry.Name()))
				}
			}
		}
	}

	for _, skill := range harnessSkills {
		skillDir := filepath.Join(dir, skill.Name)
		skillFile := filepath.Join(skillDir, "SKILL.md")
		if !destructive {
			if _, err := os.Stat(skillFile); err == nil {
				continue // exists, don't overwrite
			}
		}
		os.MkdirAll(skillDir, 0755)
		os.WriteFile(skillFile, []byte(skill.Content), 0644)
	}
}

// harnessSkillsDir returns the path to ~/.lore/.harness/SKILLS/
func harnessSkillsDir() string {
	return filepath.Join(globalPath(), ".harness", "SKILLS")
}
