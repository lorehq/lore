---
name: documentation-principles
description: Documentation principles — don't duplicate, keep it short, don't let docs rot
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
# Documentation

## Don't Duplicate
**One source of truth per fact. Everything else links.**
- Before writing, check if the information already exists. If it does, link to it.
- If two files say the same thing, delete one and point to the other.
- README, comments, docstrings, and commit messages serve different purposes. Don't repeat content across them.
- If you find yourself copying a paragraph, you're creating a future contradiction.

## Keep It Short
**Say it once, say it clearly, stop.**
- One topic per page. If a doc covers two unrelated things, split it.
- Cut filler: "it should be noted that", "in order to", "as mentioned above." Just state the thing.
- One code example beats a paragraph of explanation.
- If a page exceeds 150 lines, it's probably two pages.

## Don't Let Docs Rot
**Stale docs are worse than no docs.**
- When you change code, update the docs that describe it in the same change.
- If you find a doc that contradicts the code, fix or delete it immediately.
- Don't leave commented-out content, TODO placeholders, or "will be updated later" notes. They never get updated.
- Outdated docs actively mislead. Absence is safer than inaccuracy.

## Don't Create Docs Nobody Asked For
**Docs solve real problems. They are not a deliverable.**
- Don't proactively generate README files, architecture docs, or guides unless requested.
- Don't write a page that restates what another page already covers. Link instead.
- Don't document internal implementation details that only matter if you're reading the source.
- If you wouldn't read it, don't write it.

## Be Precise
**Vague docs create vague understanding.**
- Use exact names: file paths, function names, CLI commands. Not "the config file" — which one?
- Replace vague pronouns ("it", "this", "that") with the explicit noun when ambiguous.
- Use consistent terminology. Pick one term per concept and stick with it project-wide.
- Concrete over abstract: specific values, real examples, actual commands.