---
name: lore-semantic-search
description: Query the knowledge base using semantic search via MCP tools or direct HTTP
user-invocable: false
---

## MANDATES & CONSTRAINTS
# Security

Every file you write could be committed, leaked, or read by another agent. Act accordingly.

## 1. Reference, Don't Embed

**Reference vaults and env var names — repos get leaked, and secrets in version history are permanent.**

- This applies to passwords, API keys, tokens, private keys, and connection strings. Store the location (vault path, env var name, secret manager key), not the value itself.
- `.env` files, credential JSONs, and key files belong in `.gitignore`. Before creating one, verify it's listed.
- If you encounter an exposed secret, flag it to the operator immediately. Don't commit over it or move it.

Good:
- `DATABASE_URL` stored in Vaultwarden under "app-database" — load via `bw get`

Bad:
- `DATABASE_URL=postgres://admin:s3cret@db.internal:5432/app`

## 2. Sanitize What You Generate

**Use obviously fake placeholders in examples and configs — generated values that look real become real problems.**

- Use `example.com`, `TOKEN_HERE`, `<your-api-key>`, `sk-test-xxx` — patterns that are clearly not real.
- When conversation context contains secrets (API keys, tokens, connection strings), reference the source instead of echoing values into files.
- When delegating to workers, pass secret references (env var names, vault paths) — not values.
- Don't embed URLs containing auth tokens or session IDs.

## 3. Validate at Boundaries

**Trust internal code. Verify external input.**

- Validate user input, API request bodies, webhook payloads, and anything from outside the system boundary.
- Parameterize database queries. Escape output for the rendering context (HTML, shell, SQL).
- Don't add defensive validation inside internal function calls you control.

## 4. Escalate Uncertainty

**When uncertain whether data is sensitive, ask the operator before writing.**

- Borderline cases — internal URLs, infrastructure hostnames, non-production credentials — are judgment calls. Escalate them.
- When in doubt about whether a file should be gitignored, ask rather than guess.
- If a task requires handling actual secrets, confirm the approach with the operator first.

# Lore HQ

Knowledge headquarters for the Lore project. Not a source repo — no published code lives here.

## About

This is the operational brain for the entire Lore ecosystem. It tracks:

- **Source repos:** lore (framework), create-lore (installer), lore-docs (docs site)
- **Infrastructure:** GitHub org (`lorehq`), npm account, Cloudflare domain/DNS, Docker Hub namespace
- **CI/CD:** GitHub Actions workflows across all repos, release processes, npm publishing
- **Ecosystem mapping:** account ownership, identity separation, platform support matrix
- **Work:** roadmaps, plans, brainstorms, and operational knowledge

All application/framework code changes happen in source repos. This repo holds the knowledge, tracks the work, and maps the ecosystem.

## Agent Behavior

- Be direct and concise. No filler, no hedging.
- Code changes go in source repos, not here (unless it's hooks or skills for this workspace).
- You are responsible for the full operational surface: software development, devops, infrastructure, and ecosystem mapping.
- Check `~/.lore/knowledge-base/environment/repo-relationships.md` for repo paths and roles.
- Check `~/.lore/knowledge-base/environment/identity-separation.md` for accounts and ownership.
- When in doubt about which repo to modify, ask.

## Contributions vs Syncs

Source code changes (hooks, scripts, skills, tests) go directly in the **lore source repo** (`/home/andrew/Github/lore`). Commit and push there first.

To pull framework updates INTO this instance (or any Lore instance), use `/lore update` from the instance. Never run `sync-framework.sh` ad-hoc — it copies FROM the `<source>` argument INTO `$(pwd)`, and running it from the wrong directory silently overwrites source files with stale copies.

- **Contributing:** Edit files in lore source → commit → push
- **Syncing:** From the instance, run `/lore update` (clones latest, syncs safely)
- **Never:** `cd lore && bash scripts/sync-framework.sh /path/to/instance` — this goes backwards

# ▆▆▆ [LORE-SECURITY-PROTOCOL] ▆▆▆

## 1. Credential Protection
Every file you write could be committed, leaked, or read by another agent. Act accordingly.

## 2. Reference, Don't Embed
**Reference vaults and env var names — repos get leaked, and secrets in version history are permanent.**
- This applies to passwords, API keys, tokens, private keys, and connection strings. Store the location (vault path, env var name, secret manager key), not the value itself.
- `.env` files, credential JSONs, and key files belong in `.gitignore`. Before creating one, verify it's listed.
- If you encounter an exposed secret, flag it to the operator immediately. Don't commit over it or move it.

## 3. Sanitize What You Generate
**Use obviously fake placeholders in examples and configs — generated values that look real become real problems.**
- Use `example.com`, `TOKEN_HERE`, `<your-api-key>`, `sk-test-xxx` — patterns that are clearly not real.
- When conversation context contains secrets (API keys, tokens, connection strings), reference the source instead of echoing values into files.
- When delegating to workers, pass secret references (env var names, vault paths) — not values.
- Don't embed URLs containing auth tokens or session IDs.

## 4. Validate at Boundaries
**Trust internal code. Verify external input.**
- Validate user input, API request bodies, webhook payloads, and anything from outside the system boundary.
- Parameterize database queries. Escape output for the rendering context (HTML, shell, SQL).
- Don't add defensive validation inside internal function calls you control.

## 5. Escalate Uncertainty
**When uncertain whether data is sensitive, ask the operator before writing.**
- Borderline cases — internal URLs, infrastructure hostnames, non-production credentials — are judgment calls. Escalate them.
- When in doubt about whether a file should be gitignored, ask rather than guess.
- If a task requires handling actual secrets, confirm the approach with the operator first.

# ▆▆▆ [LORE-SECURITY-PROTOCOL-END] ▆▆▆

## USAGE
# Semantic Search Query (Local)

**Preferred:** Use the `lore_search` MCP tool when available — it handles search + path resolution in a single call. The methods below are fallbacks for environments without MCP support.

## Query Methods

### curl

```bash
# Default: returns file paths
curl -s "http://localhost:9185/search?q=your+query&k=5"

# Full mode: includes score and snippet per result
curl -s "http://localhost:9185/search?q=your+query&k=5&mode=full"
```

### Node.js (built-in fetch)

```bash
SEM_URL="http://localhost:9185/search" SEM_Q="your query" SEM_K=5 \
node -e "const u=new URL(process.env.SEM_URL);u.searchParams.set('q',process.env.SEM_Q||'');u.searchParams.set('k',process.env.SEM_K||'8');fetch(u).then(r=>r.text()).then(t=>process.stdout.write(t)).catch(e=>{console.error(e.message);process.exit(1);});"
```

## Checking Availability

```bash
curl -sf http://localhost:9185/health
```

## Snags

- **Model loading takes 30-60s on first start** — health returns `ok: true` only after indexing completes; poll before querying.
- **WebFetch fails on localhost** — always use Bash (Node fetch or curl) for sidecar endpoints.
- Always include the `q` query parameter. Prefer short, concrete queries first, then broaden if needed.