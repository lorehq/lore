# Working Across Repos

Lore is a knowledge hub — one project that tracks and performs work across all your other repositories. Your work repos stay clean. Knowledge compounds here.

## Why a Central Hub

Without a central project, you have two options — both worse:

1. **Agent files in every repo** — knowledge fragments. The same gotcha gets rediscovered per-repo. No cross-project context. Work repos get cluttered with skills, docs, and hooks that have nothing to do with the application.
2. **No persistent knowledge** — the agent starts cold every session. No skills, no context docs, no work tracking.

A single Lore project avoids both. Knowledge compounds in one place, work repos stay clean, and cross-project context builds naturally.

## How It Works

```mermaid
flowchart TD
    Lore["Lore Project<br/>(launch agent here)"]
    Lore -->|work on| A["app-api/"]
    Lore -->|work on| B["app-frontend/"]
    Lore -->|work on| C["infra/"]

    A -->|knowledge flows back| Lore
    B -->|knowledge flows back| Lore
    C -->|knowledge flows back| Lore
```

1. **Launch your agent from the Lore project.** This loads hooks, skills, and context — everything the agent needs to operate with persistent memory.

2. **Tell it to work on other repos.** The agent reads, writes, and runs commands across repos using absolute paths.

3. **Knowledge captures back to Lore.** Gotchas become skills, endpoints go to context docs, multi-step procedures become runbooks — all stored here, available next session.

## What Stays in Lore

| Artifact | Example |
|----------|---------|
| **Skills** | "This API requires case-sensitive org names" |
| **Context docs** | Repo inventory, service endpoints, relationships |
| **Runbooks** | "How to deploy app-api to staging" |
| **Work items** | Roadmaps and plans that span multiple repos |

None of this pollutes your work repos.

## The One Rule

**Always launch your agent from the Lore project directory.** That's what loads the operating principles, hooks, and accumulated knowledge. If you launch from a work repo instead, the agent starts without context.

## IDE Workflow: lore link

The One Rule works for CLI tools. For IDEs, opening the Lore project means losing the work repo's file tree, git, and search. `/lore-link` resolves this — run it once from the hub and hooks follow you into the work repo.

```
/lore-link ~/projects/my-app          # Link a work repo
/lore-link --unlink ~/projects/my-app  # Remove the link
/lore-link --list                       # Show linked repos
/lore-link --refresh                    # Regenerate all configs
```

This generates lightweight configs in the target repo that delegate to the hub's hooks via `LORE_HUB`. All generated files are auto-gitignored. Knowledge still captures to the hub.

Run `/lore-link --refresh` after `/lore-update` to regenerate configs with the latest hooks.

## Framework Updates

The Lore framework (hooks, scripts, built-in skills) updates separately from your knowledge. Run `/lore-update` to pull the latest framework files. Your docs, agents, and work items are never touched.
