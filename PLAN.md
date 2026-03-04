# Sidecar Refactor: Global Docker Compose + MCP Memory Tools

## Problem

1. **Docker config is messy.** `docker-compose.yml` lives per-project, `.env` per-project, `docker.search.address/port` wired through config.json, port computed at runtime. Too many moving parts.
2. **No MCP tools for hot memory.** Agents interact with Redis only indirectly (hook activity pings, memprint skill via curl). Semantic search already has MCP — memory should too.
3. **Per-project sidecar doesn't match reality.** The sidecar indexes the global KB (`~/.lore/knowledge-base/`). One machine, one sidecar, one compose file.

## Design

### Docker compose moves to `~/.lore/`

- New migration `002-docker-sidecar.js` writes `docker-compose.yml` and `.env` to `~/.lore/`
- Compose mounts `./knowledge-base:/data/knowledge-base:ro` (relative to `~/.lore/`)
- Redis data persists at `~/.lore/redis-data/`
- Well-known port: `9185` (semantic search), configurable by editing compose directly
- `LORE_TOKEN` generated in `~/.lore/.env` (one token per machine)
- Users customize the compose file directly — no config.json indirection

### MCP server expands with memory + fieldnote tools

Merge into existing `search-server.js` (rename to `lore-server.js`):

| Tool | Description |
|------|-------------|
| `lore_search` | Semantic search across KB (existing) |
| `lore_read` | Read a KB file by path (existing) |
| `lore_health` | Container health check (existing) |
| `lore_hot_list` | **NEW** — List hot memory facts with scores |
| `lore_hot_record` | **NEW** — Record a fact/observation to hot memory |
| `lore_fieldnote_create` | **NEW** — Create a fieldnote in the KB |

### Config simplification

Remove from project `.lore/config.json`:
- `docker.search.address` / `docker.search.port` (replaced by well-known port)
- `docker.semantic.*` (move to compose env vars or sidecar defaults)

Add to global `~/.lore/config.json`:
- `sidecarPort: 9185` (optional override, default assumed if missing)

### Hook simplification

- **activity-ping.js** — Use `getSidecarPort()` helper (reads global config or defaults to 9185). Remove project config lookup.
- **search-guard.js** — Check sidecar availability via port probe instead of config existence.
- **prompt-preamble.js** — Same simplification.
- **banner.js** — Remove `getHotMemory()` and hot memory display from `buildStaticBanner`. Agent uses `lore_hot_list` MCP tool instead.

## Changes

### 1. `lib/global.js` — add `getSidecarPort()` helper

```js
function getSidecarPort() {
  try {
    const configPath = path.join(getGlobalPath(), 'config.json');
    if (!fs.existsSync(configPath)) return 9185;
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return data.sidecarPort || 9185;
  } catch { return 9185; }
}
```

Also add `getGlobalToken()` — reads `LORE_TOKEN` from `~/.lore/.env`.

### 2. `migrations/002-docker-sidecar.js` — scaffold compose + env

Creates:
- `~/.lore/docker-compose.yml` (only if missing — user customizations preserved)
- `~/.lore/.env` with `LORE_TOKEN` (only if missing)
- `~/.lore/redis-data/` directory

### 3. `mcp/search-server.js` → `mcp/lore-server.js` — expand tools

- Rename file (update `.mcp.json` and platform templates)
- Change `getSearchBaseUrl()` to use `getSidecarPort()` from `lib/global.js` instead of project config
- Change `getToken()` to use `getGlobalToken()` instead of project `.env`
- Add `lore_hot_list` tool — `GET /memory/hot?limit=N`
- Add `lore_hot_record` tool — `POST /activity` with `{ path, content }`
- Add `lore_fieldnote_create` tool — creates `~/.lore/knowledge-base/fieldnotes/{name}/FIELDNOTE.md`
- Update path resolution for global KB (no more project doc mounting)

### 4. `hooks/lib/activity-ping.js` — simplify

Replace config-based host/port lookup with `getSidecarPort()` and `getGlobalToken()`. Remove `getConfig()` dependency.

### 5. `lib/banner.js` — remove hot memory

- Delete `getHotMemory()` function
- Remove hot memory display from `buildStaticBanner()` (fading warnings, ACTIVE MEMORY line)
- Remove `http` import, `getLoreToken` import
- `buildStaticBanner` becomes sync (no async hot memory fetch)

### 6. `hooks/search-guard.js` — simplify sidecar detection

Replace `docker.search && docker.search.address` check with `getSidecarPort()` existence (always truthy since default is 9185). Or probe `localhost:PORT/health` with a fast timeout.

Simpler: just always assume sidecar MAY be available. The nudge to use semantic search is useful regardless.

### 7. `hooks/prompt-preamble.js` — simplify

Same pattern: remove config-based sidecar detection. Always include semantic search in the preamble (it's a good habit even if sidecar is down — the MCP tool handles the error).

### 8. `lib/security.js` — global token

Add `getGlobalToken()` that reads from `~/.lore/.env`. Keep `getLoreToken()` for backwards compat but deprecate.

### 9. `skills/lore-docker/SKILL.md` — use global compose

- Change compose path: `docker compose -f ~/.lore/docker-compose.yml up -d`
- Remove port computation and config writing
- Remove "clear docker config" on stop (nothing to clear)
- Simplify to: start, stop, status against the global compose

### 10. `skills/lore-memprint/SKILL.md` — reference MCP tools

Update to mention `lore_hot_list` MCP tool as primary method. Keep curl fallback.

### 11. `skills/lore-semantic-search/SKILL.md` — simplify

Remove config-checking section. Port is always 9185 (or global config). Point users to MCP tool as primary method.

### 12. `templates/config.json` — remove docker section

Remove `docker.semantic.*` block. These become sidecar-side config (compose env vars or image defaults).

### 13. `scripts/sync-harness.sh` — stop syncing docker-compose.yml

Remove line 131: `[ -f "$SOURCE/.lore/docker-compose.yml" ] && cp ...`

### 14. `.mcp.json` — rename server

`"lore-search"` → `"lore"`, args point to `lore-server.js`.

### 15. Platform templates — update MCP config

Update `.claude/settings.json`, `.gemini/settings.json`, `.cursor/mcp.json` templates to reference `lore-server.js`.

### 16. `create-lore.js` — remove .env creation

Remove `.env` creation from the installer (no more per-project env). The `ensureGlobalDir()` migration handles `~/.lore/.env`.

### 17. Tests

**`test/global.test.js`** — Add tests for `getSidecarPort()` and `getGlobalToken()`.

**`test/session-init.test.js`** — Verify no hot memory in banner output (already the case since banner is dynamic-only in hooks).

**`test/banner.test.js`** — Remove hot memory test expectations. Verify `buildStaticBanner` is sync.

**`test/mcp-server.test.js`** (new or expand existing) — Test new MCP tools: `lore_hot_list`, `lore_hot_record`, `lore_fieldnote_create`.

**`create-lore/test/create-lore.test.js`** — Remove `.env` expectations.

### 18. Documentation (lore-docs)

- `reference/configuration.md` — Remove `docker.search.*` and `docker.semantic.*` fields. Add `sidecarPort`.
- `explanation/global-directory.md` — Add docker-compose section, explain the sidecar lives here.
- `reference/mcp-tools.md` (new or update) — Document all 6 MCP tools.

## Implementation Order

1. `lib/global.js` additions (`getSidecarPort`, `getGlobalToken`)
2. `migrations/002-docker-sidecar.js`
3. `mcp/lore-server.js` (rename + expand)
4. `.mcp.json` + platform template updates
5. Hook simplifications (activity-ping, search-guard, prompt-preamble)
6. `lib/banner.js` hot memory removal
7. `lib/security.js` global token
8. Skills updates (lore-docker, lore-memprint, lore-semantic-search)
9. `templates/config.json` cleanup
10. `sync-harness.sh` update
11. `create-lore.js` cleanup
12. Tests
13. Documentation
