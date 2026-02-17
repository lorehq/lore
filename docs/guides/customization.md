# Customization

## Agent Rules

`docs/context/agent-rules.md` is injected into every agent session as the PROJECT context. Put your project identity, behavior rules, and coding standards here.

The file is **sticky** — if deleted, the session hook recreates it with a skeleton template on next startup. Customize the template sections (About, Agent Behavior, Conventions, Coding Rules) to match your project.

This replaces what you'd normally put in `CLAUDE.md` / `.cursorrules` or `agents.md` — but lives in docs where it's browsable and version-controlled.

## Context Folder Structure

The `docs/context/` directory is yours to organize. The default structure (conventions, runbooks, diagrams) is a starting point — not a constraint.

**Adding a section:** Create a directory with markdown files. Run `bash scripts/generate-nav.sh` and it appears in nav automatically. Use kebab-case for directory names — the nav generator converts them to Title Case.

**Removing a section:** Delete the directory and regenerate nav.

**Auto-scaffold:** Directories with markdown files but no `index.md` get one created automatically during nav generation, so every section gets an Overview link.

## Local Notes

The `docs/context/local/` directory is gitignored. Use it for scratch notes, credentials references, or anything you don't want committed. It's sticky — recreated on session start if deleted.

## Nav Generation

Run `bash scripts/generate-nav.sh` to regenerate navigation. A PostToolUse hook detects `docs/` changes and reminds the agent to run this automatically.
