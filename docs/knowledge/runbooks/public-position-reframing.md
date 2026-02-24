# Public Position Reframing

Reframe all public-facing text across all Lore repos from "framework / persistent memory" positioning to **"Coding Agent Harness"** positioning. Aligns with the industry-standard harness engineering category (OpenAI, Anthropic, Martin Fowler, LangChain).

## Positioning Summary

**Old framing:** "Persistent memory for AI coding agents" / "lightweight framework" / "knowledge-persistent coding agent framework"

**New framing:** Lore is a **coding agent harness** — the operating layer that wraps AI coding agents to control what they know, how they behave, and what they work on. Agents are interchangeable execution engines; Lore governs them.

**Harness = memory + orchestration + conventions + guardrails + context control.** Memory gets users in the door; the harness is why they stay.

**Category claim:** Harness engineering (OpenAI coined, Anthropic published, Martin Fowler wrote about, LangChain building). Lore is a shipped, working implementation.

## Terminology Map

| Old | New | Scope |
|-----|-----|-------|
| "Persistent memory for AI coding agents" | "Coding agent harness" | Taglines, descriptions, meta |
| "Persistent memory for coding agents" | "Coding agent harness" | mkdocs site_description |
| "lightweight framework that gives coding agents persistent memory" | "harness for AI coding agents" | Prose descriptions |
| "Knowledge-persistent coding agent framework" | "Coding agent harness" | .lore/instructions.md, CLAUDE.md |
| "Create a new Lore knowledge-persistent agent repo" | "Scaffold a new Lore instance" | create-lore package.json, help text |
| "Bootstrap a new Lore knowledge-persistent agent repo" | "Scaffold a new Lore coding agent harness" | create-lore CLI, CONTRIBUTING |
| "The framework activates through hooks" | "The harness activates through hooks" | Docs, README |
| "framework" (when describing Lore as a product) | "harness" | Selective — see exclusions |

### Exclusions — DO NOT Change

- `framework-guard.js` — file name
- `framework-owned` / `framework-owned files` — internal ownership term (the harness owns these files)
- `lore-* prefix = framework-owned` — internal convention
- "framework skills", "framework agents", "framework workers" — internal ownership tier
- "overwritten on sync" / "framework infrastructure" in sync context — internal mechanics
- `sync-framework.sh` — script name
- Any test file content

## Prerequisites

- All four repos checked out locally: `lore`, `lore-docs`, `create-lore`, `lore-docker`
- Documentation convention loaded: `docs/context/conventions/documentation.md`
- Clean git state in all repos

## Phase 1: Config & Metadata (orchestrator — sequential)

Update non-prose metadata fields. These are exact replacements.

| File | Field | Old | New |
|------|-------|-----|-----|
| `lore-docs/mkdocs.yml` | `site_description` | `Persistent memory for coding agents` | `Coding agent harness` |
| `create-lore/package.json` | `description` | `Create a new Lore knowledge-persistent agent repo` | `Scaffold a new Lore coding agent harness` |
| `create-lore/package.json` | `keywords` | `["lore","agent","ai","knowledge"]` | `["lore","agent","ai","harness","coding-agent"]` |
| `create-lore/bin/create-lore.js` | comment line 3 | `Bootstrap a new Lore knowledge-persistent agent repo.` | `Scaffold a new Lore coding agent harness.` |
| `create-lore/bin/create-lore.js` | help text line 28 | `Bootstrap a new Lore knowledge-persistent agent repo.` | `Scaffold a new Lore coding agent harness.` |
| `lore/.lore/instructions.md` | line 3 | `Knowledge-persistent coding agent framework.` | `Coding agent harness.` |

After editing `.lore/instructions.md`, regenerate `CLAUDE.md`:

```bash
node .lore/scripts/generate-claude-md.js
```

## Phase 2: READMEs (parallel — sonnet workers, 1 per repo)

Launch 4 workers in parallel. Each worker loads:

- `docs/context/conventions/documentation.md`

Each worker receives the Terminology Map and the specific README to rewrite.

### Worker 2a — lore/README.md

Reframe the tagline, "What You Get", "Before/After", and "How It Works" sections through the harness lens.

Key changes:
- Line 3: `**Persistent memory for AI coding agents.**` → `**Coding agent harness.**`
- Line 11: Rewrite the pitch paragraph to lead with the harness concept — Lore wraps your coding agent to control what it knows, how it behaves, and what it works on
- "What You Get" section: Reframe bullets through the harness lens (the harness manages memory, enforces conventions, orchestrates delegation, tracks work)
- "Before/After" section: "Without a harness" / "With Lore"
- "How It Works" section: Frame as harness components (hooks, skills, agents, docs, scripts)

### Worker 2b — create-lore/README.md

- Line 1: `Bootstrap a new [Lore](...) project — persistent memory for AI coding agents.` → `Scaffold a new [Lore](...) instance — a coding agent harness.`
- "The Problem" section: Keep the pain statement, add harness framing in the solution
- "What Lore Does" section: Reframe through harness lens — Lore wraps your coding agent to govern sessions

### Worker 2c — lore-docker/README.md

- Line 3: Add context that this is the runtime sidecar for the Lore coding agent harness
- Minimal changes — this is infrastructure documentation, not positioning

### Worker 2d — lore-docs/README.md

- Add one line: "Public documentation for [Lore](https://github.com/lorehq/lore), the coding agent harness."

## Phase 3: Core Docs Pages (parallel — sonnet workers, 4 workers)

Split the 8 core pages across 4 workers. Each worker loads:

- `docs/context/conventions/documentation.md`
- Terminology Map from this runbook

### Worker 3a — index.md + getting-started.md

**index.md (home page — highest impact):**
- Line 7: Rewrite hero line. Keep the pain hook ("Your coding agent forgets everything between sessions") but reframe the solution through the harness: "Lore is a harness for AI coding agents — it wraps your agent to control what it knows, how it behaves, and what it works on."
- "What You Get" bullets: Reframe as harness capabilities. Lead each with the harness function (memory, orchestration, conventions, work tracking)
- "Quick Start" section: Replace "The framework activates" → "The harness activates"

**getting-started.md:**
- Light touch. Check for any "framework" references in product-description context and replace with "harness"

### Worker 3b — how-it-works.md + how-delegation-works.md

**how-it-works.md:**
- Already has a strong "Harness Engineering" section — promote it
- Line 7 opener: Reinforce the harness framing
- "Harness Engineering" section: Strengthen. This is now the core identity, not just a concept
- "Three Goals" heading: Consider reframing as "Three Harness Functions" or keeping as-is

**how-delegation-works.md:**
- Line 7: "The orchestrator-worker model is one of Lore's three core goals" → reframe as a harness capability
- Light touch otherwise — delegation mechanics don't change

### Worker 3c — when-to-use-lore.md + cost-evidence.md

**when-to-use-lore.md:**
- Comparison table: Add harness framing to Lore's row
- "Lore's main value over simpler approaches" paragraph: Reframe through harness lens
- "Good Fit" / "Poor Fit" sections: Reference harness where appropriate

**cost-evidence.md:**
- Condition table: Column header `Framework` → `Harness`
- "Where the Savings Come From" section: These are harness mechanisms
- Light touch — this is empirical data, mostly protected

### Worker 3d — production-readiness.md + troubleshooting.md

**production-readiness.md:**
- "Lore is pre-1.0 software" → "Lore is a pre-1.0 coding agent harness"
- Security section: "Lore hooks" → keep as-is (hooks are a harness component, not the harness itself)
- Supply chain section: Keep as-is

**troubleshooting.md:**
- Minimal changes. Check for "framework" in product-description context only.

## Phase 4: Guide Pages (parallel — sonnet workers, 2 workers)

### Worker 4a — interaction.md + cross-repo-workflow.md + conventions.md + roadmaps-and-plans.md

- `interaction.md`: "You direct, Lore captures" — keep. Check for framework references
- `cross-repo-workflow.md`: "Lore is designed as a hub" — keep. Light touch
- `conventions.md`: "Every new Lore instance ships with conventions" — keep. Replace "framework never overwrites" → "harness never overwrites" only in product-description contexts. Keep "Framework-owned" as internal term
- `roadmaps-and-plans.md`: Read and check for framework references

### Worker 4b — configuration.md + docs-ui.md + platform-support.md + hook-architecture.md

- `configuration.md`: Minimal changes. Technical reference.
- `docs-ui.md`: "alongside the agent" — keep. Check for framework references
- `platform-support.md`: "Lore supports three coding agent platforms" — consider "Lore harnesses three coding agent platforms" or keep as-is. Light touch
- `hook-architecture.md`: "Lore hooks into the agent's lifecycle" — this IS harness language. Keep. Check for framework references

## Phase 5: CONTRIBUTING & SECURITY (orchestrator — sequential)

- `lore/CONTRIBUTING.md`: No framework-description text. Keep as-is.
- `create-lore/CONTRIBUTING.md`: "create-lore is the CLI scaffolder for Lore" — keep as-is.
- SECURITY files: Keep as-is.

## Phase 6: Validation (orchestrator — sequential)

After all phases complete:

```bash
# Search all repos for remaining old framing
grep -ri "persistent memory for" lore/ lore-docs/ create-lore/ lore-docker/
grep -ri "knowledge-persistent" lore/ lore-docs/ create-lore/ lore-docker/
grep -ri "lightweight framework" lore/ lore-docs/ create-lore/ lore-docker/
grep -ri "coding agent framework" lore/ lore-docs/ create-lore/ lore-docker/
```

Expected: zero hits in non-test, non-changelog files.

Validate consistency:

```bash
cd lore && bash .lore/scripts/validate-consistency.sh
```

## Model Allocation

| Phase | Model | Workers | Convention | Rationale |
|-------|-------|---------|-----------|-----------|
| Phase 1 Config | Orchestrator | 1 | none | Exact replacements, no judgment |
| Phase 2 READMEs | Sonnet | 4 | documentation | Prose rewriting requires judgment |
| Phase 3 Core Docs | Sonnet | 4 | documentation | High-impact public pages |
| Phase 4 Guides | Sonnet | 2 | documentation | Lower-impact, lighter changes |
| Phase 5 Contributing | Orchestrator | 1 | none | Check-only, minimal edits |
| Phase 6 Validation | Orchestrator | 1 | none | Grep + script execution |

## Parallelization Diagram

```
Phase 1 (config):    [orchestrator — metadata edits]
                     ──────────────────────────────────
Phase 2 (READMEs):   [lore]  [create-lore]  [lore-docker]  [lore-docs]
                     ──────────────────────────────────
Phase 3 (core docs): [index+gs] [hiw+hdw] [wtu+ce] [pr+ts]
                     ──────────────────────────────────
Phase 4 (guides):    [interaction+xrepo+conv+rp] [config+ui+plat+hooks]
                     ──────────────────────────────────
Phase 5 (contrib):   [orchestrator — check + light edits]
                     ──────────────────────────────────
Phase 6 (validate):  [grep sweep + consistency check]
```

## Conventions

Workers load `docs/context/conventions/documentation.md` only. Key principles to follow:

1. **Don't Duplicate** — update text in-place, don't add new sections restating the harness concept
2. **Keep It Short** — "harness" is one word that replaces paragraphs of explanation. Don't over-explain it
3. **Be Precise** — use "harness" consistently. Don't alternate between "harness", "system", "layer", "platform"
4. **Don't Create Docs Nobody Asked For** — this is a reframing of existing text, not an opportunity to add new pages

## Rollback

All changes are local file edits. `git checkout .` in each repo reverts everything.
