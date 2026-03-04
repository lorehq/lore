---
name: lore-delegate
description: Delegation Protocol — enforcing the Subagent Envelope Contract and upward intelligence flow.
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
# ▆▆▆ [LORE-DELEGATION-PROTOCOL] ▆▆▆

Delegation is the primary method of context-efficient execution. Enforce the Envelope Contract to ensure the harness grows smarter with every subagent return.

## 1. The Subagent Envelope Contract
In every worker prompt, include a constraint for environmental intelligence reporting.

**The Prompt Directive**:
> "Return your execution results alongside a separate [ENVELOPE-REPORT] section documenting any gotchas, pitfalls, newly encountered endpoints, or file topology found during the task."

## 2. Worker Prompt Template
Use this structure for the worker brief:

```text
▆▆▆ [MISSION-DIRECTIVE] ▆▆▆
Objective: [Concrete, resolved task.]
Success Criteria: [Pass/fail conditions.]
Scope/Boundaries: [Allowed paths, services, and repo boundaries.]
Search Pathway: Query Redis (Hot) -> Global KB (Persistent).
[ENVELOPE-CONTRACT]: Required gotchas/topology report in response.
▆▆▆ [MISSION-DIRECTIVE-END] ▆▆▆
```

## 3. Post-Return Intelligence Extraction
When a worker returns:
1. **Extract**: Pull the [ENVELOPE-REPORT] data.
2. **Commit**: Immediately write snags/topology to the **Redis Hot Cache**.
3. **Propose**: Flag high-attention items to the operator for graduation to the **Global KB**.

# ▆▆▆ [LORE-DELEGATION-PROTOCOL-END] ▆▆▆