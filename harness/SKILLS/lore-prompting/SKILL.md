---
name: lore-prompting
description: Prompt engineering principles for writing effective rules, skills, agents, and LORE.md content
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

- **Always rules** should be short and universally applicable.
- **Scoped rules** should have tight globs. Broad globs (`**/*.go`) load on nearly every file.
- **Description** is for the agent, not the user. Write as a trigger: "Apply when modifying database migration files."

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
- Specify the expected output format.
- Include error handling: what to do when expected input isn't available.

## Write Effective LORE.md Content

LORE.md is accumulated from all layers (bundle -> global -> project). Project content has highest LLM weight (appears last).

- Focus on context the agent needs for THIS project/environment.
- Don't duplicate what's in rules — rules are toggleable, LORE.md is always loaded.
- Use for: repo layout, naming conventions, key architectural decisions, team agreements.
- Don't use for: step-by-step procedures (use skills), file-scoped guidance (use rules).

## Description Field Best Practices

The `description` field serves different purposes per content type:
- **Skills:** Catalog-level summary. Must be specific enough to match user intent.
- **Agents:** What the agent does. Used for delegation decisions.
- **Rules (description mode):** Trigger condition for agent-requested loading. Write as: "Apply when..."

## Common Anti-Patterns

- **Wall of text in body:** Split into body (workflow) + references (knowledge).
- **Vague descriptions:** "Helps with code" won't trigger. "Apply when writing Go test files" will.
- **Duplicated instructions:** Same guidance in multiple places will drift. Single-source it.
- **Hardcoded paths/values:** Use relative references and env var names.
- **Over-broad globs:** `**/*` makes a rule always-loaded in practice. Be specific.
- **Missing allowed-tools:** Skills without `allowed-tools` may get blocked by platform permissions.
