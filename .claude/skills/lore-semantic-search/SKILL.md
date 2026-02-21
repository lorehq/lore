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

## Fallback Behavior

If semantic search fails or returns no useful matches:

1. Perform shallow lookup in order: `docs/knowledge/` -> `docs/work/` -> `docs/context/`
2. Use focused `Grep`/`Read` before broad scans

## Notes

- Always include `q` query parameter when calling semantic search.
- Prefer short, concrete queries first, then broaden if needed.
