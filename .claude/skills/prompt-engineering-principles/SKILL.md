---
name: prompt-engineering-principles
description: Hardened prompt engineering principles for writing effective agent prompts
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
# Hardened Prompt Engineering

## 1. Structural Anchoring (The Signal Spike)
**Attention is not uniform. The middle of the prompt is a "dead zone."**

- **The Fix**: Place the most critical instructions at the **Absolute Start** (Mandates) or **Absolute End** (Final Constraint Check).
- **The Signal**: Use high-contrast **Unicode Bars** (`▆▆▆`) and **Unique Semantic IDs** (`[LORE-HARNESS-PROTOCOL]`) to create a distinct landmark in the KV cache that the attention mechanism can index.
- **Visual Framing**: Use **Box Drawing** characters for metadata and schemas. This signals to the model that the content is a "Fixed Structure" rather than "Fluid Conversation."

## 2. Multi-Dimensional Anchoring (Identity + Structure)
**Identity defines "Who," but the Anchor defines "Where" and "How."**

- **The Fix**: Tie critical instructions to unique structural marks.
- **The Technique**: "Your behavior is governed by the protocols marked by the `[LORE-HARNESS-PROTOCOL]` anchor."
- **Resistance**: This prevents drift during long sessions by forcing a hard reset back to the anchored protocol in every turn.

## 3. Graduated Salience (3-Tier Color System)
**Not everything is equally important. Reserve maximum-intensity framing for genuine safety.**

- **Bright Red** (`\x1b[91m`): Security violations, credential protection, write-guard failures. The "stop everything" tier.
- **Bright Yellow** (`\x1b[93m`): Core protocol (search-first, capture reminders, checkpoints). Important but not dangerous.
- **Bright Cyan** (`\x1b[96m`): Style guidance (coding standards, docs formatting). Helpful but lowest priority.
- **The Why**: Overusing red erodes its signal. A system where everything is critical is a system where nothing is.

## 4. Economy Over Verbosity
**Every token is noise unless it is signal.**

- **The Fix**: Remove decorative, duplicated, and speculative instructions. If removing a line doesn't change the outcome, delete it.
- **The Layout**: Structure before content. Isolate model-agnostic instructions from model-specific formatting hints. Polish the wording last.

## 5. Ground and Bound Uncertainty
**Uncertainty hidden is uncertainty compounded.**

- **The Fix**: Define exactly which sources are allowed. Require factual claims to be traceable.
- **The Policy**: Define explicit fallback behavior for missing evidence (e.g., "insufficient evidence"). A model that knows how to fail gracefully is a model that won't hallucinate.

## 6. Demonstrate the Output Contract
**Show target shape concretely.**

- **The Fix**: Provide schema/templates for format-critical tasks. Use literal structure (JSON/Table fields).
- **The Heuristic**: 1-3 representative examples (Few-shot) are worth 1,000 rules. Examples teach tone, format, and edge handling faster than descriptions.

## 7. Decomposition Before Scale
**Split complex tasks into staged units.**

- **The Fix**: Use stage pipelines (Extract -> Transform -> Synthesize -> Verify). Assign pass/fail criteria to each stage.
- **The Goal**: Design for failure localization. If a stage fails, the caller can redirect without re-running the entire task.

## 8. Soften for Stronger Models
**Aggressive language that helped weaker models hurts stronger ones.**

- Remove anti-laziness prompts ("be thorough") — on capable models these cause runaway over-exploration.
- Soften tool triggers: "You MUST use this tool" → "Use this tool when it would help."
- Avoid persona-heavy framing (roles, moral duties) except for security, where a strong frame is warranted.