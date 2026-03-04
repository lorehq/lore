---
name: docs-nav-design
description: Documentation site structure — Diataxis, navigation design, page sizing, quickstart principles
user-invocable: false
---

## MANDATES & CONSTRAINTS
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
# Documentation Site Structure

## Use Diataxis as a Writing Discipline
**Every page serves one purpose: tutorial, how-to, reference, or explanation. Don't mix them.**
- **Tutorials** teach. The author leads, the reader follows. Learning-oriented, step-by-step, always involves doing something concrete.
- **How-to guides** solve. The reader has a goal, the guide assists. Assumes competence, task-oriented, no hand-holding.
- **Reference** describes. Exhaustive, factual, austere. Parameters, return types, defaults, examples. Consulted, not read.
- **Explanation** clarifies. Background, architecture, design decisions, "why." Deepens understanding without prescribing action.

When a page feels bloated, you're mixing types. A how-to guide that stops to explain architecture should link to an explanation page instead. A tutorial that lists every config option should link to the reference.

## Organize Navigation for the Reader
**Users navigate by task and intent, not by your internal file structure.**
- Top-level sections map to user intent: "I'm new" (Getting Started), "I need to do X" (Guides), "I need the spec" (Reference), "I want to understand why" (Concepts).
- Don't mirror your source tree, team structure, or module hierarchy in navigation.
- Group by what users are trying to accomplish, not by what component implements it.

## Keep the Sidebar Shallow
**Two sidebar levels. Three at most. Beyond that, users lose orientation.**
- Top-level sections as horizontal tabs or primary nav. Sidebar for secondary navigation within each section.
- Within each section, the sidebar should be scannable at a glance. If it scrolls, the section is too large — split it.
- Group sidebar items into 5-8 item clusters using section headers.
- Never nest deeper than 3 levels total.

## Give Every Section a Landing Page
**Clicking a section should orient, not dump the reader on the first child page.**
- Every nav section gets an index page that explains what's in the section and links to key pages.
- Landing pages surface the 20% of pages that serve 80% of visits. Put the most-used links at the top.

## Size Pages for Comprehension
**One topic per page. 800-3,000 words. Enough to be useful, short enough to finish.**
- If a page covers two unrelated things, split it. If two pages cover the same thing, merge and redirect.
- Link aggressively. Every mention of a concept, command, or component that has its own page should be a link.
- End pages with "Next steps" or related links.

## Make Getting Started Ruthlessly Short
**One "aha moment." Under 5 minutes. Nothing else.**
- Installation, one working example, done. The quickstart is not a feature tour.
- Cut prerequisites to the minimum.
- Defer everything that isn't required for the first success. Link to them.

## Structure Reference to Mirror the System
**Reference architecture follows the thing it describes, not the reader's workflow.**
- CLI reference mirrors the command tree. Config reference mirrors the config file structure. API reference mirrors the endpoint hierarchy.
- Every entry: name, description, parameters/options, defaults, types, one example.
- Don't narrate. Reference is looked up, not read.