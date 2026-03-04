---
name: coding-principles
description: Coding principles — surface confusion early, write less code, prove it works
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
# Coding

## Surface Confusion Early
**Uncertainty hidden is uncertainty compounded.**
- State assumptions before writing code. If uncertain, ask.
- When multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If requirements are ambiguous, stop and clarify. Don't guess.

## Write Less Code
**The best code is the code you didn't write.**
- Solve exactly what was asked. No speculative features.
- Don't abstract what's used once. Three similar lines beat a premature helper.
- Don't add configurability, extensibility, or error handling for scenarios that can't happen.
- If 200 lines could be 50, rewrite.

## Change Only What You Must
**Every changed line should trace to the request.**
- Don't improve adjacent code, comments, or formatting.
- Don't refactor what isn't broken. Match existing style.
- If you notice unrelated problems, mention them — don't fix them.
- Remove imports, variables, and functions YOUR changes made unused. Leave pre-existing dead code alone.

## Prove It Works
**Untested code is unfinished code.**
- Write or run tests before calling it done. No test framework? Verify manually and show output.
- After two failed fix attempts, stop. Re-read the error, re-read the code, reconsider the approach entirely.
- Check security basics: no hardcoded secrets, no unvalidated input in queries or commands, no exposed internals.

## Plan, Execute, Verify
**Define done. Work toward it. Confirm you got there.**
Transform tasks into verifiable outcomes:
- "Add validation" → write tests for invalid inputs, then make them pass.
- "Fix the bug" → reproduce it with a test, then make it pass.
- "Refactor X" → ensure tests pass before and after.

For multi-step work, state the plan up front:
```
1. [Step] → verify: [how]
2. [Step] → verify: [how]
3. [Step] → verify: [how]
```