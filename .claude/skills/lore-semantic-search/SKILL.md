---
name: lore-semantic-search
description: Query local semantic search endpoints reliably when Fetch/WebFetch blocks localhost or private URLs
---

## MANDATES & CONSTRAINTS
# Documentation Site Structure

How to organize navigation and content for the public documentation site (MkDocs Material).

## 1. Use Diátaxis as a Writing Discipline

**Every page serves one purpose: tutorial, how-to, reference, or explanation. Don't mix them.**

- **Tutorials** teach. The author leads, the reader follows. "Build your first X" — learning-oriented, step-by-step, always involves doing something concrete.
- **How-to guides** solve. The reader has a goal, the guide assists. "How to deploy to production" — assumes competence, task-oriented, no hand-holding.
- **Reference** describes. Exhaustive, factual, austere. Parameters, return types, defaults, examples. Consulted, not read.
- **Explanation** clarifies. Background, architecture, design decisions, "why." Deepens understanding without prescribing action.

When a page feels bloated, you're mixing types. A how-to guide that stops to explain architecture should link to an explanation page instead. A tutorial that lists every config option should link to the reference.

## 2. Organize Navigation for the Reader, Not the Codebase

**Users navigate by task and intent, not by your internal file structure.**

- Top-level sections map to user intent: "I'm new" (Getting Started), "I need to do X" (Guides), "I need the spec" (Reference), "I want to understand why" (Concepts).
- Don't mirror your source tree, team structure, or module hierarchy in navigation. These force users to learn your internals before finding content.
- Group by what users are trying to accomplish, not by what component implements it.

Standard top-level sections, in order:

| Section | Diátaxis Type | Content |
|---------|---------------|---------|
| Getting Started | Tutorial | Installation, first working example, core workflow. Under 5 minutes to "aha." |
| Guides | How-to | Task-oriented walkthroughs. One guide per goal. Assumes the reader finished Getting Started. |
| Concepts | Explanation | Architecture, design decisions, mental models. No steps — just understanding. |
| Reference | Reference | CLI commands, configuration options, API surface. Mirrors the structure of the thing it describes. |

Add sections only when the content doesn't fit the four above. Changelog, migration guides, and troubleshooting are common additions. Don't invent sections preemptively.

## 3. Keep the Sidebar Shallow

**Two sidebar levels. Three at most. Beyond that, users lose orientation.**

- Use MkDocs Material's `navigation.tabs` to render top-level sections as horizontal tabs. This adds one navigation level without deepening the sidebar.
- Within each tab, the sidebar should be scannable at a glance — no scrolling to see the full list. If it scrolls, the section is too large; split it.
- Group sidebar items into 5–8 item clusters using section headers. A wall of 30+ ungrouped links overwhelms.
- Never nest deeper than 3 levels total (tab → section → page). Use section index pages to add breadth instead of depth.

## 4. Give Every Section a Landing Page

**Clicking a section should orient, not dump the reader on the first child page.**

- Every `nav` section gets an `index.md` that explains what's in the section and links to key pages.
- Landing pages surface the 20% of pages that serve 80% of visits. Put the most-used links at the top.
- Use MkDocs Material's `navigation.indexes` feature to attach index pages to sections.

## 5. Size Pages for Comprehension

**One topic per page. 800–3,000 words. Enough to be useful, short enough to finish.**

- If a page covers two unrelated things, split it. If two pages cover the same thing, merge and redirect.
- Under 800 words usually means the page is a fragment that should be folded into a parent page.
- Over 3,000 words usually means the page mixes Diátaxis types or covers multiple topics.
- Link aggressively. Every mention of a concept, command, or component that has its own page should be a link.
- End pages with "Next steps" or related links. Users should always know where to go from here.

## 6. Make Getting Started Ruthlessly Short

**One "aha moment." Under 5 minutes. Nothing else.**

- Installation, one working example, done. The quickstart is not a feature tour.
- Cut prerequisites to the minimum. If the reader needs three tools installed before starting, provide a single copy-paste block.
- Defer everything that isn't required for the first success: configuration options, advanced features, architecture explanations. Link to them.
- Test the quickstart on a clean machine. If any step fails or confuses, fix it before publishing anything else.

## 7. Structure Reference to Mirror the System

**Reference architecture follows the thing it describes, not the reader's workflow.**

- CLI reference mirrors the command tree. Config reference mirrors the config file structure. API reference mirrors the endpoint hierarchy.
- Every entry: name, description, parameters/options, defaults, types, one example. Consistent format across all entries.
- Don't narrate. Reference is looked up, not read. Save the storytelling for explanation pages.
- Keep reference auto-generated where possible. Hand-written reference drifts from the source.

## 8. Configure MkDocs Material for This

**Use the theme features that support this structure. Skip the ones that fight it.**

Enable:

- `navigation.tabs` + `navigation.tabs.sticky` — top-level sections as persistent horizontal tabs.
- `navigation.sections` — visual grouping in the sidebar.
- `navigation.indexes` — section landing pages.
- `navigation.path` — breadcrumbs for orientation in deep structures.
- `navigation.instant` — SPA-like page transitions (requires `site_url`).
- `navigation.prune` — only render visible nav items. Essential past 100 pages.
- `toc.follow` — auto-scroll the table of contents to the active heading.

Avoid:

- `navigation.expand` — auto-expands all sidebar sections. Defeats scanability on sites with more than a handful of pages.
- `toc.integrate` — moves the table of contents into the sidebar. Incompatible with section indexes and clutters the nav.

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

To pull framework updates INTO this instance (or any Lore instance), use `/lore-update` from the instance. Never run `sync-framework.sh` ad-hoc — it copies FROM the `<source>` argument INTO `$(pwd)`, and running it from the wrong directory silently overwrites source files with stale copies.

- **Contributing:** Edit files in lore source → commit → push
- **Syncing:** From the instance, run `/lore-update` (clones latest, syncs safely)
- **Never:** `cd lore && bash scripts/sync-framework.sh /path/to/instance` — this goes backwards

# Rules

Operator preferences for how work is done. Each page covers a specific domain.

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

# Rules

Operational rules and standards for this environment. Each page covers a specific domain.

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

**Preferred:** Use the `lore_search` MCP tool when available — it handles search + file reading in a single call. The methods below are fallbacks for environments without MCP support.

When `docker.search` in `.lore/config.json` points to localhost or a private network, `Fetch`/`WebFetch` may fail due to URL restrictions.

## Query Methods

### Node.js (built-in fetch)

```bash
SEM_URL="http://localhost:PORT/search" SEM_Q="your query" SEM_K=5 \
node -e "const u=new URL(process.env.SEM_URL);u.searchParams.set('q',process.env.SEM_Q||'');u.searchParams.set('k',process.env.SEM_K||'8');fetch(u).then(r=>r.text()).then(t=>process.stdout.write(t)).catch(e=>{console.error(e.message);process.exit(1);});"
```

### curl

```bash
# Default: returns file paths (paths_min mode)
curl -s "http://localhost:PORT/search?q=your+query&k=5"

# Full mode: includes score and snippet per result
curl -s "http://localhost:PORT/search?q=your+query&k=5&mode=full"
```

## Checking Availability

```bash
node -e "const c=require('./.lore/harness/lib/config').getConfig('.');console.log(c.docker?.search ? JSON.stringify(c.docker.search) : 'unavailable')"
```

If output is `unavailable`, skip to Grep/Glob fallback immediately.

## Snags

- **MAX_K defaults to 2** — queries requesting `k` higher than `MAX_K` raise a validation error. Set `-e MAX_K=10` when starting the container.
- **Paths in responses are relative** to the mounted volume root. Prepend the local mount path to read them.
- **Model loading takes 30-60s on first start** — health returns `ok: true` only after indexing completes; poll before querying.
- **WebFetch fails on localhost** — always use Bash (Node fetch or curl) for lore-docker endpoints.
- Always include the `q` query parameter. Prefer short, concrete queries first, then broaden if needed.