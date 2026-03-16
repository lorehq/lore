# Global Setup Guide

Global setup configures `~/.config/lore/` for operator-wide defaults that apply across all projects.

## When to Run

- First Lore installation (global LORE.md contains the default stub)
- New machine setup
- When the operator wants to update their global preferences

## Steps

### 1. Operator Profile

Gather information about the operator to tailor agent behavior:

- **Role:** What do they do? (backend engineer, full-stack, data scientist, etc.)
- **Experience level:** How should explanations be framed?
- **Preferred languages/frameworks:** What do they work with most?
- **Communication style:** Terse or detailed? Do they want summaries?
- **Coding style preferences:** Tabs/spaces, naming conventions, etc.

Write these as clear instructions in `~/.config/lore/LORE.md`. Example:

```markdown
# Global Instructions

## About Me
I'm a senior backend engineer. I work primarily in Go and TypeScript.
Don't explain basics — give me the direct answer.

## Coding Preferences
- Use descriptive variable names, no abbreviations
- Error handling: return errors, don't panic
- Tests: table-driven tests in Go, describe blocks in TypeScript
- No comments unless the logic is genuinely non-obvious
```

### 2. Machine Context

Gather system information the agent might need:

```bash
# OS and architecture
uname -a

# Key runtimes
node --version 2>/dev/null
go version 2>/dev/null
python3 --version 2>/dev/null
rustc --version 2>/dev/null

# Package managers
which npm pnpm yarn brew apt 2>/dev/null

# Key tools
git --version
docker --version 2>/dev/null
```

Add relevant details to the global LORE.md or create a global rule for machine-specific guidance.

### 3. Environment Context

Ask about the operator's working environment:

- **Cloud provider:** AWS, GCP, Azure, etc.
- **Key services:** Databases, message queues, CI/CD platforms
- **Internal tools:** Monorepo tooling, deployment systems, code review platforms
- **Security requirements:** Credential management, compliance standards

Create global rules for recurring environmental concerns. Example:

```markdown
# ~/.config/lore/RULES/credentials.md
---
description: Apply when working with secrets, API keys, or credentials
---

Never embed secrets in code. Use environment variables or vault references.
Our secrets are in AWS Secrets Manager — reference by ARN, never by value.
```

### 4. Global Rules

Ask if there are instructions the operator wants applied everywhere:

- Code quality standards
- Security practices
- Communication preferences
- Tool usage preferences

Create rules in `~/.config/lore/RULES/` for each concern.

### 5. Verify

After setup:
- Run `lore generate` in an active project to see the global content projected
- Check that the global LORE.md no longer contains the default stub
- Confirm global rules appear in the TUI's Global pane

## Notes

- Global items default to "off" per-project. The operator must enable them via inherit.json or the TUI.
- The global LORE.md is always accumulated (no toggle needed).
- Don't overload global config — project-specific concerns belong in `.lore/`.
