---
name: prompt-engineering
description: Prompt engineering principles for writing effective agent instructions, skills, and rules
user-invocable: true
---

# Prompt Engineering Principles

Guidelines for writing Lore rules, skills, agent definitions, and LORE.md content
that produce reliable, high-quality agent behavior.

## Structure for Progressive Disclosure

Agent context is expensive. Load information in tiers:
- **Tier 1 (always loaded):** Name + description. Must be specific enough to trigger correctly.
- **Tier 2 (on activation):** Instructions body. Keep under 5000 tokens. Focus on workflow and constraints.
- **Tier 3 (on demand):** Reference files in `references/`, `scripts/`, `assets/`. Unlimited depth.

Never put reference material in the body. Point to it: "Load `references/foo.md` for details."

## Write Rules That Trigger Correctly

Rules have four activation modes based on frontmatter:

| Mode | Fields | When |
|------|--------|------|
| Always | neither | Every conversation |
| Auto-attached | `globs:` only | When matching files are in context |
| Agent-requested | `description:` only | Agent decides (Cursor/Copilot) |
| Scoped+described | both | Either trigger |

- **Always rules** should be short and universally applicable. Don't put project-specific knowledge here.
- **Scoped rules** should have tight globs. Broad globs (`**/*.go`) load on nearly every file.
- **Description** is for the agent, not the user. Write it as a trigger condition: "Apply when modifying database migration files."

## Write Clear Agent Instructions

- Lead with identity and purpose: "You are a X. You do Y."
- State constraints before capabilities: what NOT to do matters more.
- List tools and skills the agent can use — don't assume discovery.
- Define the workflow as numbered steps. Agents follow explicit sequences better than implied ones.
- End with rules that prevent common failure modes.

## Write Actionable Skill Instructions

- Start with the trigger: when should this skill be invoked?
- Describe the workflow step by step. Each step should be a concrete action.
- Point to reference files for domain knowledge — don't inline it.
- Specify the expected output format: "Show the operator a table of..."
- Include error handling: what to do when the expected input isn't available.

## Write Effective LORE.md Content

LORE.md is accumulated from all layers (bundle → global → project). Project content has highest LLM weight (appears last).

- Keep it focused on context the agent needs for THIS project/environment.
- Don't duplicate what's in rules — rules are toggleable, LORE.md is always loaded.
- Use it for: repo layout, naming conventions, key architectural decisions, team agreements.
- Don't use it for: step-by-step procedures (use skills), file-scoped guidance (use rules).

## Description Field Best Practices

The `description` field on rules, skills, and agents serves different purposes:
- **Skills:** Catalog-level summary. Must be specific enough to match user intent.
- **Agents:** What the agent does. Used for delegation decisions.
- **Rules (description mode):** Trigger condition for agent-requested loading. Write as: "Apply when..."

## Common Anti-Patterns

- **Wall of text in body:** Split into body (workflow) + references (knowledge). Agents skim long bodies.
- **Vague descriptions:** "Helps with code" won't trigger correctly. "Apply when writing or reviewing Go test files" will.
- **Duplicated instructions:** If the same guidance appears in multiple places, it will drift. Single-source it.
- **Hardcoded paths/values:** Use relative references and env var names. Content may be projected to different locations.
- **Over-broad globs:** `**/*` on a rule makes it always-loaded in practice. Be specific.
- **Missing allowed-tools:** Skills without `allowed-tools` may get blocked by platform permission systems.
