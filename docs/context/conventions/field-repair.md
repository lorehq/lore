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
| lore | `~/Github/lore` | Hooks, lib, scripts, skills, conventions, templates |
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

- Gotcha → create a skill (mandatory for non-obvious failures).
- Environment fact → `docs/knowledge/environment/`.
- Affected procedure → update the relevant runbook.
- If none apply, state "No capture needed" with a one-line reason.
