---
name: lore
description: Lore harness — status, update, memory, repair
type: command
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, TaskCreate, TaskUpdate
---

# Lore

Unified entry point for Lore harness commands. Parse the first argument to route to the correct subcommand.

## Routing

Parse arguments from the user's invocation:

| Input | Route |
|-------|-------|
| `/lore` (no args) | → **Help** |
| `/lore status` | → **Status** |
| `/lore update` | → **Update** |
| `/lore repair` | → **Repair** |
| `/lore memory` | → **Memory › Sidecar** (default: start) |
| `/lore memory start` | → **Memory › Sidecar** (start) |
| `/lore memory stop` | → **Memory › Sidecar** (stop) |
| `/lore memory status` | → **Memory › Sidecar** (status) |
| `/lore memory burn` | → **Memory › Burn** |
| `/lore memory rem` | → **Memory › Defrag** |

Unrecognized arguments → show Help with a note that the subcommand wasn't recognized.

## Help

Display this table when invoked with no arguments:

```
/lore                    Show this help
/lore status             Instance health — version, hooks, skills, fieldnotes
/lore update             Update harness to latest version
/lore repair             Diagnose and fix a harness bug
/lore memory             Start the sidecar (semantic search + hot memory)
/lore memory stop        Stop the sidecar
/lore memory status      Sidecar health check
/lore memory burn        Promote hot facts to the knowledge base
/lore memory rem         Knowledge defrag — restructure the KB
```

---

## Status

Operator-facing diagnostic. Shows whether Lore is loaded and healthy.

### Process

Run these checks and present a formatted summary to the operator:

1. **Version** — read `version` from `.lore/config.json`. If missing, report "no version (pre-update-lore)".

2. **Hooks** — check each platform that has config present:

   **Claude Code** (`.claude/settings.json`):
   - `SessionStart` → `session-init.js`
   - `UserPromptSubmit` → `prompt-preamble.js`
   - `PreToolUse` → `protect-memory.js`, `harness-guard.js`, `search-guard.js`
   - `PostToolUse` → `memory-nudge.js`
   - `PostToolUseFailure` → `memory-nudge.js`

   **Gemini CLI** (`.gemini/settings.json`):
   - `SessionStart` → `session-init.js`
   - `BeforeAgent` → `prompt-preamble.js`
   - `BeforeTool` → `protect-memory.js`, `harness-guard.js`, `search-guard.js`
   - `AfterTool` → `memory-nudge.js`

   Report each platform as OK, PARTIAL, or MISSING.

3. **Counts** — count and report:
   - Harness skills: number of directories in `.lore/harness/skills/`
   - Operator skills: number of directories in `.lore/AGENTIC/skills/`
   - Agents: number of `.md` files in `.lore/AGENTIC/agents/`
   - Fieldnotes: number of directories in `~/.lore/knowledge-base/fieldnotes/`
   - Runbooks: number of `.md` files under `~/.lore/knowledge-base/runbooks/`

4. **Active work** — scan `~/.lore/knowledge-base/work-items/` for items with `status: active` or `status: on-hold` in frontmatter. List titles.

5. **Format** — present as a clean block the operator can read at a glance:
   ```
   Lore v<version>

   Hooks:
     Claude Code   OK
     Cursor        OK
     Cursor MCP    OK
     OpenCode      OK

   Harness skills: 8 | Operator skills: 4 | Agents: 3
   Fieldnotes: 19 | Runbooks: 5

   Active work: (none)
   ```

---

## Update

Pull the latest Lore harness files without touching operator content.

### Process

1. Read current version from `.lore/config.json`
2. Clone the latest Lore template to a temp directory:
   ```bash
   tmp=$(mktemp -d) && [ -d "$tmp" ] || { echo "mktemp failed"; exit 1; }
   git clone --depth 1 https://github.com/lorehq/lore.git "$tmp"
   ```
   **Critical**: always pass `"$tmp"` as the target — omitting it clones into the working directory as `lore/`.
3. Read the source version from the cloned `.lore/config.json`
4. Show the operator: current version, new version, what will be synced
5. On approval, run **from the instance directory** (cwd), passing the harness repo clone as the argument:
   ```bash
   bash "$tmp/.lore/harness/scripts/sync-harness.sh" "$tmp"
   ```
   **Direction: cwd = target instance, argument = source harness repo.** Getting this backwards overwrites the harness repo with stale instance files.
6. Update the `version` field in `.lore/config.json` to match the source
7. **Migrate global directory** — bring `~/.lore/` up to date:
   ```bash
   node -e "require('./.lore/harness/lib/global').ensureGlobalDir();console.log('Global dir ready');"
   ```
   This creates `~/.lore/` if missing and ensures the expected structure exists.
8. **Seed review** — compare `.lore/harness/templates/seeds/rules/` to operator rule files in `.lore/AGENTIC/rules/`. For each seed template where the operator file exists and differs:
   - Show the diff (seed template vs operator file)
   - Ask the operator whether to adopt the updated seed or keep their version
   - Only overwrite operator files the operator explicitly approves
   Note: seed filenames may map differently (e.g., seed `docs.md` → operator `documentation.md`). Compare by content purpose, not filename.
9. Clean up: `rm -rf "$tmp"`
10. Report what changed

### What Gets Synced

**Overwritten (harness-owned):**
- `.lore/harness/hooks/`, `.lore/harness/lib/`, `.lore/harness/scripts/`, `.opencode/`
- `.claude/settings.json`, `.lore/harness/skills/<built-in>/`
- `.lore/instructions.md`, `.gitignore`, `opencode.json`
- Generated copies (`CLAUDE.md`, `.cursor/rules/lore-*.mdc`) are also regenerated via `sync-platform-skills.sh`

**Seed files (opt-in update):**
- `.lore/harness/templates/seeds/rules/` — default rule content. Created on first install if missing. On update, diffs shown for operator review.

**Never touched (operator-owned):**
- `.lore/AGENTIC/agents/`
- `.lore/config.json`, `.lore/memory.local.md`, `.lore/operator.gitignore`

### Snags

- Always show the version diff and file list before syncing — never auto-update
- The sync script uses rsync semantics: overwrite existing, never delete operator files
- If the operator has modified a harness-owned file (e.g., edited CLAUDE.md), the update will overwrite it — warn about this
- Operator-specific ignores go in `.lore/operator.gitignore` (never overwritten). The sync script appends them after harness rules automatically — no manual re-adding needed
- Always clean up the temp clone (`rm -rf "$tmp"`) even if sync fails — otherwise a `lore/` directory persists in the project root

---

## Repair

Diagnose and fix a harness bug using the field repair workflow.

### Process

1. Check for a field-repair rule in `.lore/AGENTIC/rules/` (if the operator has one)
2. Ask the operator:
   - **What's broken?** (hook error, skill failure, script crash, bad behavior)
   - **How to reproduce?** (exact trigger — slash command, tool call, event)
   - **Which repo likely owns this?** (lore, create-lore, lore-memory, lore-docs)
3. Follow the rule steps in order:
   - Reproduce → Isolate → Fix in source → Test → Push and sync → Report → Capture
4. Use TaskCreate to track each step if the repair spans multiple turns

### Snags

- Debug output goes to `/tmp`, never stderr — stderr corrupts hook responses
- Copy fixed files into the instance for testing, but revert before syncing
- Always fix in the source repo, never patch the instance directly
- Run `/lore update` from the instance after pushing — never run sync scripts ad-hoc
- The operator is your eyes — ask them to confirm behavior you can't observe

---

## Memory

### Sidecar

Manage the local Lore sidecar lifecycle.

The sidecar provides semantic search over the knowledge base and hot memory (Redis) for agent sessions. It runs from `~/.lore/docker-compose.yml` — one sidecar per machine, shared across all projects.

#### Platform detection

Detect the OS for process queries:
- `uname -s` → `Linux` or `Darwin` = Unix, `MINGW*` or `MSYS*` or `CYGWIN*` = Windows

#### Process

Interpret intent from user input:
- default or `start` -> start sidecar
- `stop` -> stop sidecar
- `status` -> report current state

**Start:**

1. Check Docker daemon: `docker info > /dev/null 2>&1`
2. Pull image: `docker pull lorehq/lore-memory:latest`
3. Start services:
   ```bash
   docker compose -f ~/.lore/docker-compose.yml up -d
   ```
4. Wait for port 9185 to respond.
5. Verify health: `curl -s http://localhost:9185/health`

**Stop:**

1. Stop services:
   ```bash
   docker compose -f ~/.lore/docker-compose.yml down
   ```

**Status:**

1. Check container state and verify HTTP response at `localhost:9185/health`.

#### Snags

- Semantic search model loading can take 30-60 seconds on first start. Poll `/health` until `ok: true`.
- The compose file lives at `~/.lore/docker-compose.yml`. Users customize ports and settings by editing it directly.
- If the port is changed from the default 9185, also set `sidecarPort` in `~/.lore/config.json`.

### Burn

Burn "hot" session experiences into the permanent knowledge base.

Lore uses heat-based tiering to manage context. Facts and draft fieldnotes start in Hot Memory (Redis) and promote to the Persistent KB (Markdown files) after operator approval. Burn is the promotion gate.

#### Process

**1. Scan Hot Memory**

Retrieve active facts using the `lore_hot_recall` MCP tool:

```
lore_hot_recall(limit: 20)
```

If MCP is unavailable, fall back to redis-cli via Docker:
```bash
docker exec lore-lore-memory-1 redis-cli SMEMBERS lore:hot:index
```

To read a specific fact:
```bash
docker exec lore-lore-memory-1 redis-cli HGETALL "lore:hot:<key>"
```

If the sidecar is down, fall back to `.lore/memory.local.md`.

**2. Heat Filter**

Score each fact by recency and frequency. Present only facts above the heat threshold (default: score > 1.0) to the operator. Show key, content, hit count, and current score.

**3. Present for Approval**

Show the operator a numbered list of print-ready facts. For each:
- **Key**: the hot memory identifier
- **Score**: current heat score
- **Content**: the fact or draft fieldnote body
- **Proposed location**: where it would land in the KB

The operator selects which facts to promote, skip, or discard.

**4. Commit**

For each approved fact:
1. Read the source content from hot memory.
2. Write to the appropriate KB location:
   - Draft fieldnotes (key starts with `fieldnote:`) → `~/.lore/knowledge-base/fieldnotes/{name}/FIELDNOTE.md`
   - Environment facts → `~/.lore/knowledge-base/environment/`
   - Operator preferences → `~/.lore/knowledge-base/operator-profile.md`
   - Procedural knowledge → `~/.lore/knowledge-base/runbooks/`
   - Project-specific → project `.lore/` directory
3. Add frontmatter (`name`, `description`, `tags`) per KB structure rules.
4. Verify the file was written and is valid markdown.

**5. Cleanup**

After successful promotion, the hot cache entry remains (it decays naturally). Do not delete hot cache entries — they continue to track access frequency.

#### Routing Rules

| Fact Type | Destination |
|-----------|-------------|
| Draft fieldnote (`fieldnote:*`) | `~/.lore/knowledge-base/fieldnotes/` |
| Machine/infra detail | `~/.lore/knowledge-base/environment/` |
| Operator preference | `~/.lore/knowledge-base/operator-profile.md` |
| Recurring snag | `~/.lore/knowledge-base/fieldnotes/` via `/lore-create-fieldnote` |
| Procedural knowledge | `~/.lore/knowledge-base/runbooks/` |
| Project convention | `.lore/` in the project repo |

### Defrag

Knowledge defrag — restructure the global knowledge base by content rather than creation order.

**Run after the environment is substantially documented — not before.**

#### Process

1. Check that semantic search is available (sidecar running).
2. Scan `~/.lore/knowledge-base/` for structural issues:
   - Duplicate or overlapping fieldnotes
   - Environment docs that should be merged or split
   - Misrouted content (e.g., environment facts in fieldnotes)
3. Present proposed changes to the operator for approval.
4. Execute approved restructuring on a branch:
   ```bash
   cd ~/.lore && git checkout -b knowledge-defrag-$(date +%Y%m%d)
   ```
5. After operator review, merge the branch.

See `~/.lore/knowledge-base/runbooks/system/knowledge-defrag.md` for the full procedure.
