# First Session Setup: Knowledge Worker

Grounds the agent in operator identity, tooling, and environment before any project work begins. Run once per instance. Follow phases in order — each phase depends on the previous.

**Profile:** Enterprise or professional environment — cloud infrastructure, version control, secret stores, org wikis, multiple CLI tools.

**How to invoke:** Ask the agent: *"Walk me through first-session setup."*

!!! tip "Recommended: start the docs sidecar first"
    Run `/lore-docker` before Phase 1. The Docker sidecar provides semantic search and a live docs UI — every skill, environment doc, and runbook created in later phases becomes instantly searchable. Skip if Docker isn't available; everything works without it.

---

## Phase 1: Identity

**Goal:** Tell the agent who it is and who it serves.

### Operator Profile

Create `docs/knowledge/local/operator-profile.md` (gitignored).

Minimum fields:
- Name, role, organization
- Accounts: VCS logins (work and personal if both in use), cloud accounts
- Working style preferences (tone, parallel execution, output format)
- Tool and CLI preferences

Without it, the agent has no operator context — it knows the KB but not who it's working for.

### Agent Rules

Edit `docs/context/agent-rules.md`.

Minimum fields:
- Deployment assignment: instance name, operator, org
- Scope: what domains this instance covers
- Behavioral rules specific to this deployment (default accounts, constraints, known snags)

This file is injected as PROJECT context every session.

### Machine Inventory

Create `docs/knowledge/local/machine.md` (gitignored).

Capture: hostname, OS, installed runtimes (Node, Python, .NET, Go, etc.), CLI tools, shell environment. Prevents the agent from assuming a generic environment.

---

## Phase 2: Model Configuration

**Goal:** Wire the three-tier worker system before any delegation happens.

Set model aliases in `~/.claude/settings.json` under `env`:

```json
"ANTHROPIC_DEFAULT_HAIKU_MODEL": "<fast-model>",
"ANTHROPIC_DEFAULT_SONNET_MODEL": "<default-model>",
"ANTHROPIC_DEFAULT_OPUS_MODEL": "<powerful-model>"
```

On hosted inference (Foundry, Bedrock, Vertex), these point to deployment names. On the direct Anthropic API, they point to model IDs.

After setting aliases, regenerate agent frontmatter:

```bash
node .lore/lib/generate-agents.js
```

**Do not skip.** Claude Code silently ignores full model IDs in agent frontmatter — all workers run at the orchestrator's tier with no error.

Verify by asking the agent to run a worker test: each tier (fast/default/powerful) should report the model it's running on.

---

## Phase 3: Keystore

**Goal:** Establish a secret store before ingesting any credentials.

**Rule:** Secrets never go in the KB. The KB documents item names and what they're for — never values.

Options:

| Option | Best for |
|--------|----------|
| Vaultwarden (self-hosted) | Local / air-gapped; full control |
| 1Password CLI (`op`) | Teams with existing 1Password |
| Bitwarden (cloud) | Cross-machine sync without self-hosting |
| Cloud KMS (AWS Secrets Manager, Azure Key Vault, GCP Secret Manager) | Existing cloud infrastructure |
| `pass` (GPG-based) | Unix environments; minimal dependencies |

Authenticate the CLI, verify access, and document the tool and item naming convention in `docs/knowledge/environment/identity/`.

If importing browser-saved passwords, export from the browser, import via the keystore CLI, then delete the export file — it is plaintext.

Add an index table to the keystore environment doc: item names, types, and purposes (never values). This is the lookup the agent uses at runtime.

---

## Phase 4: CLI Authentication

**Goal:** Authenticate external tooling in dependency order.

Authenticate in this sequence:

1. **Version control CLI** (GitHub CLI, GitLab CLI, Azure DevOps extension) — needed for all repo work
2. **Cloud provider CLI** (`az login`, `aws configure`, `gcloud auth login`) — needed before cloud-dependent tools
3. **Token-based tools** — retrieve PATs and API keys from the keystore, export as env var or pass as flag

For each tool, document in `docs/knowledge/environment/`:
- Auth method and verification command
- Keystore item name (if applicable)
- Session management snags (token expiry, multi-account switching)

!!! note
    VCS CLI auth and cloud provider CLI auth are separate. Authenticating one does not grant access to the other — they require independent setup.

---

## Phase 5: Environment Mapping

**Goal:** Map the services the agent will interact with. Do not rely on memory.

Document each service in `docs/knowledge/environment/<topic>/<service>.md`. Group by concern: `source-control/`, `cloud/`, `identity/`, `developer-tools/`, etc.

### Discovery Techniques

**Browser bookmarks** — JSON files readable while the browser is closed. Parse with Python `json` module. Surfaces services used frequently enough to bookmark.

**Browser history** — SQLite, accessible even after the browser is uninstalled:

```bash
python -c "
import sqlite3, os
db = '<path-to-History-file>'
con = sqlite3.connect(db)
rows = con.execute('SELECT url, title, visit_count FROM urls ORDER BY visit_count DESC LIMIT 500').fetchall()
for r in rows: print(r[2], r[1], r[0])
"
```

Python's built-in `sqlite3` — no additional CLI required.

**Docker inventory** — reveals running services, stopped dev stacks, and available MCP images:

```bash
docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"
```

**Repo scan** — surface active service domains and technology patterns:

```bash
# GitHub CLI
gh repo list <org> --limit 200 --json name,description,updatedAt
# GitLab, ADO: equivalent list commands
```

**Company wiki** — search for domain models, architecture decisions, and system inventories before writing environment docs. Someone may have done the work already.

**Generate a bookmarks file** — after mapping the environment, ask the agent to generate a structured HTML bookmarks file grouped by category, ready for browser import.

### Active Work Context

- Ask about current initiatives, goals, and roadmaps
- If the org uses a goal-tracking system (Workday, Lattice, Notion OKRs, Linear cycles, etc.), export current goals and pass them to the agent as input — goals map to initiatives, milestones map to epics
- Create `docs/workflow/in-flight/initiatives/` for strategic goals (months)
- Create `docs/workflow/in-flight/epics/` for tactical work in flight

---

## Phase 6: Semantic Search

```bash
/lore-docker
```

Ports are auto-computed per project (hash-based). After starting, check the assigned port:

```bash
/lore-docker status
```

On corporate networks, containers may need the org CA cert mounted. The embedding model (`BAAI/bge-small-en-v1.5`) is bundled in recent releases.

---

## Phase 7: Repo Linking

```bash
/lore-link
```

Link each active application repo. Creates `.lore/links/` entries the agent uses to navigate between repos without losing KB context.

---

## Phase 8: Knowledge Defrag

**Run after the environment is substantially documented — not before.**

Once Phases 1–5 are complete and the KB has accumulated organically, run the knowledge defrag runbook to restructure `docs/knowledge/` by content rather than creation order.

```bash
git checkout -b knowledge-defrag-$(date +%Y%m%d)
# Then: "Run the knowledge defrag runbook"
```

See `docs/knowledge/runbooks/system/knowledge-defrag.md`.

---

## Verification Checklist

- [ ] Operator profile and agent rules reflect current deployment
- [ ] Worker tiers (fast/default/powerful) route to the expected models
- [ ] Keystore accessible — agent can retrieve a test item
- [ ] VCS CLI authenticated and verified
- [ ] Cloud CLI authenticated (if applicable)
- [ ] All active services documented in `docs/knowledge/environment/`
- [ ] Semantic search returning results
- [ ] Active initiatives and epics created for current goals

---

## Snags

- **Keystore before credentials** — configure Phase 3 before authenticating CLIs. Credentials ingested first have nowhere secure to go.
- **Worker tier routing** — Claude Code silently ignores full model IDs in agent frontmatter. Use short aliases and run `generate-agents.js` after any alias change.
- **VCS ≠ cloud auth** — version control and cloud provider CLI auth are independent systems.
- **TLS required for localhost secret stores** — `bw` CLI 2026.x raises `InsecureUrlNotAllowedError` for localhost HTTP. Self-hosted Vaultwarden must serve TLS; a self-signed cert is sufficient.
- **Windows Git Bash path corruption** — path-like strings in CLI args (e.g. `-subj "/CN=localhost"`) are corrupted by Git Bash's automatic path conversion. Prefix with `MSYS_NO_PATHCONV=1`.
- **Env vars don't cross process boundaries** — variables set in one shell don't propagate to the agent's session. Re-export in the same process or use the keystore CLI directly.
- **Browser history survives uninstall** — the SQLite `History` file remains in the user profile after a browser is uninstalled. Python `sqlite3` reads it without any extra tools.
- **`docker ps -a` beats memory** — stopped containers surface local dev stacks faster than trying to recall what was running.
