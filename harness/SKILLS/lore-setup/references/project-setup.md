# Project Setup Guide

Project setup configures `.lore/` for a specific project.

## When to Run

- After `lore init` (project LORE.md contains the default stub)
- When joining an existing Lore project that needs local configuration
- When the operator wants to add project-specific instructions

## Steps

### 1. Understand the Project

Before writing instructions, understand the codebase:

- **Language and framework:** What's the primary stack?
- **Repository layout:** Monorepo? Microservices? Standard Go/Node/Python layout?
- **Build system:** How is the project built and tested?
- **Key conventions:** Naming, file organization, architectural patterns

Scan the project to gather context:
```bash
# See what's here
ls -la
cat README.md 2>/dev/null | head -50

# Detect stack
ls package.json go.mod Cargo.toml pyproject.toml requirements.txt 2>/dev/null

# Check for existing CI/test commands
cat Makefile 2>/dev/null | head -30
cat package.json 2>/dev/null | grep -A5 '"scripts"'
```

### 2. Write Project LORE.md

Replace the default stub with clear project context:

```markdown
# Project Instructions

## About This Repo
Brief description of what this project is and does.

## Repo Layout
\`\`\`
src/           # Application source
tests/         # Test files
scripts/       # Build and deploy scripts
docs/          # Documentation
\`\`\`

## Key Commands
- Build: `make build`
- Test: `make test`
- Lint: `make lint`
- Deploy: `make deploy-staging`

## Conventions
- File naming: kebab-case for files, PascalCase for components
- Error handling: always return errors, never swallow them
- Tests: colocated with source files as `*_test.go`

## Architecture
Brief description of key architectural decisions and patterns.
```

### 3. Create Project Rules

Ask the operator about project-specific coding standards:

- **Style rules:** Specific patterns to follow or avoid
- **Architecture rules:** Layer boundaries, import restrictions
- **Testing rules:** Coverage expectations, test patterns
- **Security rules:** Project-specific security concerns

Create rules in `.lore/RULES/` using `/lore-create`. Common examples:

- `code-style.md` — always-loaded coding conventions
- `api-patterns.md` — scoped to `**/*api*` or `**/*handler*`
- `test-patterns.md` — scoped to `**/*test*` or `**/*spec*`
- `database.md` — scoped to `**/*migration*` or `**/*model*`

### 4. Enable Bundles

If bundles are installed, enable ones relevant to this project:

```bash
lore bundle list          # See what's available
lore bundle enable <slug> # Enable for this project
```

### 5. Configure Platforms

Verify the right platforms are enabled in `.lore/config.json`:

```bash
cat .lore/config.json
```

Add or remove platforms as needed.

### 6. Migrate Pre-Lore Content

If `.pre-lore` backups exist from `lore init`:

1. Scan for `*.pre-lore` files at the project root
2. Extract useful content from mandate files (CLAUDE.md, etc.) into `.lore/LORE.md`
3. Convert existing rules to `.lore/RULES/`
4. Move existing skills to `.lore/SKILLS/`
5. Move existing agents to `.lore/AGENTS/`
6. Offer to delete backups after migration

### 7. Generate and Verify

```bash
lore generate
```

Check that projected files look correct:
- Mandate files contain the LORE.md content
- Rules appear in platform-specific locations
- Skills and agents are projected

### 8. Commit

```bash
git add .lore/ CLAUDE.md .cursor/ .github/ .gemini/ .windsurf/ .opencode/ AGENTS.md GEMINI.md .windsurfrules .mcp.json
git commit -m "Configure Lore for this project"
```

## Notes

- Project content is always included — no policy toggle needed
- Project LORE.md content appears LAST in accumulated mandates (highest LLM weight)
- Don't duplicate global concerns in the project — use global rules for cross-project standards
- Keep LORE.md focused on context, not procedures (use skills for procedures)
