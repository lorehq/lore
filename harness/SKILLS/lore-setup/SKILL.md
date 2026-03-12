---
name: lore-setup
description: First-run setup — configure global environment or initialize a project
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# Setup — Configure Lore

Guides the operator through first-time setup at the global or project level.

## Detecting What Needs Setup

Check for the default LORE.md stubs — they contain a "not configured yet" message:

- **Global stub detected** → offer global setup (operator profile, machine, environment)
- **Project stub detected** → offer project setup (repo context, rules, conventions)
- **Both stubs** → start with global (it feeds into all projects), then project

## Workflow

### 1. Determine Scope

Ask: "Is this a **global** setup (your environment across all projects) or a **project** setup (this specific repo)?"

If the global LORE.md still has the default stub, recommend global setup first.

### 2. Load the Right Reference

- For global setup → load `references/global-setup.md`
- For project setup → load `references/project-setup.md`

### 3. Follow the Reference

Each reference has a step-by-step workflow. Key phases:

**Global setup:**
1. Gather operator profile (role, experience, preferences)
2. Scout machine context (OS, runtimes, tools)
3. Understand environment (cloud, services, infrastructure)
4. Write global LORE.md and create global rules
5. Verify

**Project setup:**
1. Understand the codebase (stack, layout, conventions)
2. Write project LORE.md with repo context
3. Create project-specific rules
4. Enable bundles and configure platforms
5. Migrate any `.pre-lore` backups
6. Generate and commit

### 4. Replace the Stub

After setup, the LORE.md should contain real instructions — not the default stub.
The "not configured yet" message is the signal that setup is needed.
