---
name: lore-memprint
description: Memory Imprinting — promote hot cache facts to the persistent knowledge base
type: command
user-invocable: true
model: sonnet
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Memprint

Imprint "hot" session experiences into the permanent knowledge base.

## Overview

Lore uses heat-based tiering to manage context. Facts start in the Hot Tier (Redis STM) and promote to the Persistent Tier (Markdown KB) after reaching a heat threshold. Memprint is the promotion gate.

## Process

### 1. Scan Hot Cache

Retrieve active memory facts from the sidecar:

```bash
curl -s "http://localhost:${LORE_SEMANTIC_PORT:-9185}/memory/hot?limit=20"
```

If the sidecar is unavailable, fall back to `.lore/memory.local.md`.

### 2. Heat Filter

Score each fact by recency and frequency. Present only facts above the heat threshold (default: score > 1.0) to the operator. Show path, hit count, last access time, and current score.

### 3. Present for Approval

Show the operator a numbered list of print-ready facts. For each:
- **Path**: the hot cache key
- **Score**: current heat score
- **Proposed location**: where it would land in the KB

The operator selects which facts to promote, skip, or discard.

### 4. Commit

For each approved fact:
1. Read the source content from the hot cache or session memory.
2. Write to the appropriate KB location:
   - Environment facts → `~/.lore/knowledge-base/environment/`
   - Operator preferences → `~/.lore/knowledge-base/operator-profile.md`
   - Project-specific → project `.lore/` directory
3. Add frontmatter (`title`, `tags`, `type`) per KB structure rules.
4. Verify the file was written and is valid markdown.

### 5. Cleanup

After successful promotion, the hot cache entry remains (it decays naturally). Do not delete hot cache entries — they continue to track access frequency.

## Routing Rules

| Fact Type | Destination |
|-----------|-------------|
| Machine/infra detail | `~/.lore/knowledge-base/environment/` |
| Operator preference | `~/.lore/knowledge-base/operator-profile.md` |
| Project convention | `.lore/` in the project repo |
| Recurring snag | `~/.lore/knowledge-base/fieldnotes/` via `/lore-create-fieldnote` |
| Procedural knowledge | `~/.lore/knowledge-base/runbooks/` or `/lore-create-skill` |
