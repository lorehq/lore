---
name: lore-create-brainstorm
description: Create a brainstorm folder — always standalone, never nested
model: sonnet
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
- Check `docs/knowledge/environment/repo-relationships.md` for repo paths and roles.
- Check `docs/knowledge/environment/identity-separation.md` for accounts and ownership.
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

You are a security gatekeeper. Every file you write could be committed, leaked, or read by another agent. Act accordingly.

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

# Coding

## 1. Surface Confusion Early

**Uncertainty hidden is uncertainty compounded.**

- State assumptions before writing code. If uncertain, ask.
- When multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If requirements are ambiguous, stop and clarify. Don't guess.

## 2. Write Less Code

**The best code is the code you didn't write.**

- Solve exactly what was asked. No speculative features.
- Don't abstract what's used once. Three similar lines beat a premature helper.
- Don't add configurability, extensibility, or error handling for scenarios that can't happen.
- If 200 lines could be 50, rewrite.

## 3. Change Only What You Must

**Every changed line should trace to the request.**

- Don't improve adjacent code, comments, or formatting.
- Don't refactor what isn't broken. Match existing style.
- If you notice unrelated problems, mention them — don't fix them.
- Remove imports, variables, and functions YOUR changes made unused. Leave pre-existing dead code alone.

## 4. Prove It Works

**Untested code is unfinished code.**

- Write or run tests before calling it done. No test framework? Verify manually and show output.
- After two failed fix attempts, stop. Re-read the error, re-read the code, reconsider the approach entirely.
- Check security basics: no hardcoded secrets, no unvalidated input in queries or commands, no exposed internals.

## 5. Plan, Execute, Verify

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

# Docs

## 1. Don't Duplicate

**One source of truth per fact. Everything else links.**

- Before writing, check if the information already exists. If it does, link to it.
- If two files say the same thing, delete one and point to the other.
- README, comments, docstrings, and commit messages serve different purposes. Don't repeat content across them.
- If you find yourself copying a paragraph, you're creating a future contradiction.

## 2. Keep It Short

**Say it once, say it clearly, stop.**

- One topic per page. If a doc covers two unrelated things, split it.
- Cut filler: "it should be noted that", "in order to", "as mentioned above." Just state the thing.
- One code example beats a paragraph of explanation.
- If a page exceeds 150 lines, it's probably two pages.

## 3. Don't Let Docs Rot

**Stale docs are worse than no docs.**

- When you change code, update the docs that describe it in the same change.
- If you find a doc that contradicts the code, fix or delete it immediately.
- Don't leave commented-out content, TODO placeholders, or "will be updated later" notes. They never get updated.
- Outdated docs actively mislead. Absence is safer than inaccuracy.

## 4. Don't Create Docs Nobody Asked For

**Docs solve real problems. They are not a deliverable.**

- Don't proactively generate README files, architecture docs, or guides unless requested.
- Don't write a page that restates what another page already covers. Link instead.
- Don't document internal implementation details that only matter if you're reading the source.
- If you wouldn't read it, don't write it.

## 5. Be Precise

**Vague docs create vague understanding.**

- Use exact names: file paths, function names, CLI commands. Not "the config file" — which one?
- Replace vague pronouns ("it", "this", "that") with the explicit noun when ambiguous.
- Use consistent terminology. Pick one term per concept and stick with it project-wide.
- Concrete over abstract: specific values, real examples, actual commands.

# Field Repair

When a deployed instance reports a bug or the current instance exhibits broken behavior, follow this workflow. Fix locally first, understand the failure, then push through source.

## 1. Reproduce Locally

**Fix where you can iterate fast.**

- Reproduce the failure in the current instance before touching source repos.
- Use the operator as your eyes — screenshots, UI feedback, terminal output. Hook and platform behavior isn't always visible to the agent.
- If the failure is intermittent, identify the trigger conditions before proceeding.

## 2. Isolate the Issue

**Instrument, don't guess.**

- Add temporary debug output (write to `/tmp`, not stderr — stderr pollutes hook responses).
- Trigger the failing path naturally — don't simulate with synthetic inputs.
- Read the debug output. Form a hypothesis.
- Remove all instrumentation before moving on.

## 3. Fix in Source

**The fix lives in the source repo, not the instance.**

Identify which repo owns the broken code:

| Repo | Path | Scope |
|------|------|-------|
| lore | `~/Github/lore` | Hooks, lib, scripts, skills, rules, templates |
| create-lore | `~/Github/create-lore` | Installer, npx entry point |
| lore-docker | `~/Github/lore-docker` | Docker image, semantic search, docs UI |
| lore-docs | `~/Github/lore-docs` | Public documentation site |

Paths are defaults — check `docs/knowledge/environment/repo-relationships.md` for actual locations.

## 4. Test the Fix

**Verify in the instance before committing.**

- Copy the fixed file(s) into the local instance manually (don't sync yet).
- Trigger the failing path again.
- Ask the operator to confirm the fix works.
- Revert the manual copies after confirmation — the sync path will deliver the real fix.

## 5. Push and Sync

**Commit in source. Sync to instance.**

- Commit and push in the source repo.
- From the instance, run `/lore-update` to pull the fix through the official sync path.
- Verify one final time that the fix survived the sync.

## 6. Report

**Document the root cause.**

- Open a GitHub issue with `gh issue create` documenting the root cause and fix.
- If a deployed instance reported the bug, submit a PR or link the commit.
- If the fix affects multiple instances, note which need updating.

## 7. Capture

**Turn the fix into knowledge.**

- Snag → create a fieldnote (mandatory for non-obvious failures).
- Environment fact → `docs/knowledge/environment/`.
- Affected procedure → update the relevant runbook.
- If none apply, state "No capture needed" with a one-line reason.

# Rules

Operational rules and standards for this environment. Each page covers a specific domain.

# Prompt Engineering

## 1. Establish Identity First

**A clear persona anchors every decision the model makes.**

- Define who the model is and what it's responsible for in the opening lines. Identity shapes tone, expertise, and judgment calls downstream.
- Make the identity specific: "You are a senior security auditor reviewing infrastructure configs" beats "You are a helpful assistant."
- A strong identity reduces rule count — a model that knows it's an auditor will flag risks without being told to. A model that knows it's a code reviewer will check edge cases unprompted.
- When the model drifts, check whether the identity is clear before adding more rules.

## 2. Start Minimal, Add on Failure

**The best prompt is the shortest one that produces correct behavior.**

- Begin with a bare prompt on the strongest model available. Observe where it fails.
- Add instructions only to fix observed failures — not to preempt imagined ones.
- Every token in a system prompt multiplies across every request. Cut filler: "It is important to note that" → state the thing. "In order to" → "to".
- Hill-climb quality first, then trim cost. Don't optimize for brevity before the behavior is right.

## 3. Motivate, Don't Just Command

**A model that understands why generalizes better than one told what.**

- "Never use ellipses — the text-to-speech engine can't pronounce them" outperforms "NEVER use ellipses."
- One sentence of motivation replaces a paragraph of rules. The model infers the edge cases you didn't list.
- Context beats commands: include the background, the audience, or the downstream use — the model adapts.

## 4. Positive Over Prohibitive

**Tell the model what to do, not what to avoid.**

- "Write in active voice" beats "Do not use passive voice."
- "Search first, then read matched files" beats "Do NOT read files without searching first."
- Reserve "NEVER" and "DO NOT" for genuine safety rails. Overuse erodes emphasis — when everything is critical, nothing is.

## 5. Find the Right Altitude

**Too specific is brittle. Too vague is ignored.**

- Brittle: "If the user says X, respond with Y" — breaks on paraphrases.
- Vague: "Be helpful" — gives the model nothing to act on.
- Heuristic: "When uncertain about scope, ask before expanding" — specific enough to follow, flexible enough to generalize.
- Avoid laundry lists of edge cases. Curate a small set of diverse examples that demonstrate the pattern instead.

## 6. Show, Don't Enumerate

**Examples are worth a thousand rules.**

- 2-3 concrete input/output pairs teach tone, format, and edge handling faster than describing them.
- When multiple rules interact (formatting + tone + length), a single example demonstrates all at once.
- If you're writing a long chain of "if X then Y" conditions, replace it with examples that cover the cases. Models learn patterns from demonstrations more reliably than from exhaustive enumeration.

## 7. Structure for Parsing

**Models follow structured prompts more reliably than prose.**

- Use markdown headers, tables, or XML tags to separate sections. Avoid wall-of-text instructions.
- Put the highest-priority instruction first — models weight early content more heavily.
- Group related rules. Scattered related rules get partially followed.
- Match prompt formatting to desired output formatting — markdown prompts produce markdown responses.

## 8. Soften for Stronger Models

**Aggressive language that helped weaker models hurts stronger ones.**

- Remove anti-laziness prompts ("be thorough," "do not be lazy") — on capable models these cause runaway over-exploration.
- Soften tool triggers: "You MUST use this tool" → "Use this tool when it would help." Undertriggering workarounds from older models cause overtriggering on newer ones.
- Drop explicit "think step-by-step" instructions for models that reason well natively — they over-plan when told to plan.
- When behavior is too aggressive after softening, lower effort/temperature before adding more prompt constraints.

## 9. Iterate on Observed Behavior

**Prompts improve through testing, not through writing more rules.**

- Test against real inputs, not just the happy path. Adversarial and edge-case inputs reveal prompt gaps.
- When output quality changes, diagnose whether the prompt drifted or the inputs did.
- A fix for one failure mode can break three working cases. Change one thing, observe, then change the next.
- Prompt refinement is continuous — revisit when models update, inputs shift, or new failure modes appear.

# Security

You are a security gatekeeper. Every file you write could be committed, leaked, or read by another agent. Act accordingly.

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

## COGNITIVE PRIMING
# Coding

## 1. Surface Confusion Early

**Uncertainty hidden is uncertainty compounded.**

- State assumptions before writing code. If uncertain, ask.
- When multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If requirements are ambiguous, stop and clarify. Don't guess.

## 2. Write Less Code

**The best code is the code you didn't write.**

- Solve exactly what was asked. No speculative features.
- Don't abstract what's used once. Three similar lines beat a premature helper.
- Don't add configurability, extensibility, or error handling for scenarios that can't happen.
- If 200 lines could be 50, rewrite.

## 3. Change Only What You Must

**Every changed line should trace to the request.**

- Don't improve adjacent code, comments, or formatting.
- Don't refactor what isn't broken. Match existing style.
- If you notice unrelated problems, mention them — don't fix them.
- Remove imports, variables, and functions YOUR changes made unused. Leave pre-existing dead code alone.

## 4. Prove It Works

**Untested code is unfinished code.**

- Write or run tests before calling it done. No test framework? Verify manually and show output.
- After two failed fix attempts, stop. Re-read the error, re-read the code, reconsider the approach entirely.
- Check security basics: no hardcoded secrets, no unvalidated input in queries or commands, no exposed internals.

## 5. Plan, Execute, Verify

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

# Documentation

## 1. Don't Duplicate

**One source of truth per fact. Everything else links.**

- Before writing, check if the information already exists. If it does, link to it.
- If two files say the same thing, delete one and point to the other.
- README, comments, docstrings, and commit messages serve different purposes. Don't repeat content across them.
- If you find yourself copying a paragraph, you're creating a future contradiction.

## 2. Keep It Short

**Say it once, say it clearly, stop.**

- One topic per page. If a doc covers two unrelated things, split it.
- Cut filler: "it should be noted that", "in order to", "as mentioned above." Just state the thing.
- One code example beats a paragraph of explanation.
- If a page exceeds 150 lines, it's probably two pages.

## 3. Don't Let Docs Rot

**Stale docs are worse than no docs.**

- When you change code, update the docs that describe it in the same change.
- If you find a doc that contradicts the code, fix or delete it immediately.
- Don't leave commented-out content, TODO placeholders, or "will be updated later" notes. They never get updated.
- Outdated docs actively mislead. Absence is safer than inaccuracy.

## 4. Don't Create Docs Nobody Asked For

**Docs solve real problems. They are not a deliverable.**

- Don't proactively generate README files, architecture docs, or guides unless requested.
- Don't write a page that restates what another page already covers. Link instead.
- Don't document internal implementation details that only matter if you're reading the source.
- If you wouldn't read it, don't write it.

## 5. Be Precise

**Vague docs create vague understanding.**

- Use exact names: file paths, function names, CLI commands. Not "the config file" — which one?
- Replace vague pronouns ("it", "this", "that") with the explicit noun when ambiguous.
- Use consistent terminology. Pick one term per concept and stick with it project-wide.
- Concrete over abstract: specific values, real examples, actual commands.

# Prompt Engineering

## 1. Establish Identity First

**A clear persona anchors every decision the model makes.**

- Define who the model is and what it's responsible for in the opening lines. Identity shapes tone, expertise, and judgment calls downstream.
- Make the identity specific: "You are a senior security auditor reviewing infrastructure configs" beats "You are a helpful assistant."
- A strong identity reduces rule count — a model that knows it's an auditor will flag risks without being told to. A model that knows it's a code reviewer will check edge cases unprompted.
- When the model drifts, check whether the identity is clear before adding more rules.

## 2. Start Minimal, Add on Failure

**The best prompt is the shortest one that produces correct behavior.**

- Begin with a bare prompt on the strongest model available. Observe where it fails.
- Add instructions only to fix observed failures — not to preempt imagined ones.
- Every token in a system prompt multiplies across every request. Cut filler: "It is important to note that" → state the thing. "In order to" → "to".
- Hill-climb quality first, then trim cost. Don't optimize for brevity before the behavior is right.

## 3. Motivate, Don't Just Command

**A model that understands why generalizes better than one told what.**

- "Never use ellipses — the text-to-speech engine can't pronounce them" outperforms "NEVER use ellipses."
- One sentence of motivation replaces a paragraph of rules. The model infers the edge cases you didn't list.
- Context beats commands: include the background, the audience, or the downstream use — the model adapts.

## 4. Positive Over Prohibitive

**Tell the model what to do, not what to avoid.**

- "Write in active voice" beats "Do not use passive voice."
- "Search first, then read matched files" beats "Do NOT read files without searching first."
- Reserve "NEVER" and "DO NOT" for genuine safety rails. Overuse erodes emphasis — when everything is critical, nothing is.

## 5. Find the Right Altitude

**Too specific is brittle. Too vague is ignored.**

- Brittle: "If the user says X, respond with Y" — breaks on paraphrases.
- Vague: "Be helpful" — gives the model nothing to act on.
- Heuristic: "When uncertain about scope, ask before expanding" — specific enough to follow, flexible enough to generalize.
- Avoid laundry lists of edge cases. Curate a small set of diverse examples that demonstrate the pattern instead.

## 6. Show, Don't Enumerate

**Examples are worth a thousand rules.**

- 2-3 concrete input/output pairs teach tone, format, and edge handling faster than describing them.
- When multiple rules interact (formatting + tone + length), a single example demonstrates all at once.
- If you're writing a long chain of "if X then Y" conditions, replace it with examples that cover the cases. Models learn patterns from demonstrations more reliably than from exhaustive enumeration.

## 7. Structure for Parsing

**Models follow structured prompts more reliably than prose.**

- Use markdown headers, tables, or XML tags to separate sections. Avoid wall-of-text instructions.
- Put the highest-priority instruction first — models weight early content more heavily.
- Group related rules. Scattered related rules get partially followed.
- Match prompt formatting to desired output formatting — markdown prompts produce markdown responses.

## 8. Soften for Stronger Models

**Aggressive language that helped weaker models hurts stronger ones.**

- Remove anti-laziness prompts ("be thorough," "do not be lazy") — on capable models these cause runaway over-exploration.
- Soften tool triggers: "You MUST use this tool" → "Use this tool when it would help." Undertriggering workarounds from older models cause overtriggering on newer ones.
- Drop explicit "think step-by-step" instructions for models that reason well natively — they over-plan when told to plan.
- When behavior is too aggressive after softening, lower effort/temperature before adding more prompt constraints.

## 9. Iterate on Observed Behavior

**Prompts improve through testing, not through writing more rules.**

- Test against real inputs, not just the happy path. Adversarial and edge-case inputs reveal prompt gaps.
- When output quality changes, diagnose whether the prompt drifted or the inputs did.
- A fix for one failure mode can break three working cases. Change one thing, observe, then change the next.
- Prompt refinement is continuous — revisit when models update, inputs shift, or new failure modes appear.

## USAGE
# Create Brainstorm

Brainstorms capture conversation artifacts for future reference. **Operator-initiated only.**

## Process

1. **Read rules**: Check `.lore/rules.md` or `.lore/rules/index.md` for docs formatting rules. Apply these when writing content.

2. **Create folder**: `docs/workflow/brainstorms/<slug>/`

3. **Create index.md** with minimal frontmatter:

```yaml
---
title: [Descriptive title]
created: [today's date]
---
```

4. **Validate**: `bash .lore/harness/scripts/ensure-structure.sh && bash .lore/harness/scripts/validate-consistency.sh`

## Snags

- **Always in `brainstorms/`** — never nest inside initiative or epic folders
- **No `status` field** — brainstorms are reference material, not tracked work
- To promote to an initiative or epic: archive the brainstorm, create the new item fresh