---
name: lore-semantic-search
description: Query local semantic search endpoints reliably when Fetch/WebFetch blocks localhost or private URLs
user-invocable: false
allowed-tools: Bash, Read, Grep
banner-loaded: true
---

# Semantic Search Query (Local)

When `docker.search` in `.lore/config.json` points to localhost or a private network, `Fetch`/`WebFetch` may fail due to URL restrictions.

## Reliable Query Pattern

Use `Bash` with Node's built-in `fetch` so queries work consistently across macOS, Linux, and Windows environments that run Node.

```bash
node -e "const u=new URL(process.env.SEM_URL);u.searchParams.set('q',process.env.SEM_Q||'');u.searchParams.set('k',process.env.SEM_K||'8');fetch(u).then(r=>r.text()).then(t=>process.stdout.write(t)).catch(e=>{console.error(e.message);process.exit(1);});"
```

Set environment variables before the command:

- `SEM_URL` (example: `http://localhost:8080/search`)
- `SEM_Q` query text
- `SEM_K` optional top-k

## When to Use Which

- Known path or keyword → `Read`/`Glob`/`Grep` directly (exact, cheaper)
- Unknown concept → semantic search, then read matched files

If no useful matches: shallow lookup `docs/knowledge/` → `docs/work/` → `docs/context/`

## Checking Availability

Read `.lore/config.json`. If `docker.search` exists, semantic search is available:

```bash
node -e "const c=require('./.lore/lib/config').getConfig('.');console.log(c.docker?.search ? JSON.stringify(c.docker.search) : 'unavailable')"
```

If output is `unavailable`, skip to grep/glob fallback immediately.

## Notes

- Always include `q` query parameter when calling semantic search.
- Prefer short, concrete queries first, then broaden if needed.
