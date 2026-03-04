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
