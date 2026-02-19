# Customization

## Agent Rules

`docs/context/agent-rules.md` is injected into every agent session as the PROJECT context. Put your project identity and behavior rules here.

The file is **sticky** — if deleted, the session hook recreates it with a skeleton template (About, Agent Behavior sections) on next startup.

Coding standards go in `docs/context/conventions/` — a directory with per-domain pages (`coding.md`, `docs.md`). Conventions are also injected every session. Both are sticky and recreated if deleted.

This replaces what you'd normally put in `CLAUDE.md` / `.cursor/rules/` — but lives in docs where it's browsable and version-controlled.

## Conventions

`docs/context/conventions/` holds behavioral rules the agent follows when writing files. Each `.md` file is one convention. A write-time guard hook reinforces relevant conventions before every file write based on the target path — security fires on every write, docs fires for `docs/` paths, and so on. Remaining conventions are listed as a menu so the agent can self-serve.

To add a custom convention, drop a markdown file in the directory. Use bold principle lines (`**Like this.**`) — the guard extracts these for write-time reminders. No hook changes needed.

## Context vs Knowledge

`docs/context/` holds rules and conventions injected every session (agent-rules, coding standards). `docs/knowledge/` holds reference material loaded on-demand (environment details, runbooks, scratch notes).

Both directories are yours to organize — the default structures are starting points, not constraints.

**Adding a section:** Create a directory with markdown files. Run `bash scripts/generate-nav.sh` and it appears in nav automatically. Use kebab-case for directory names — the nav generator converts them to Title Case.

**Removing a section:** Delete the directory and regenerate nav.

**Auto-scaffold:** Directories with markdown files but no `index.md` get one created automatically during nav generation, so every section gets an Overview link.

## Local Notes

The `docs/knowledge/local/` directory is gitignored. Use it for scratch notes, credentials references, or anything you don't want committed. It's sticky — recreated on session start if deleted.

## Nav Generation

Run `bash scripts/generate-nav.sh` to regenerate navigation. A PostToolUse hook detects `docs/` changes and reminds the agent to run this automatically.
