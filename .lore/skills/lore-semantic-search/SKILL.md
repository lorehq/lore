---
name: lore-semantic-search
description: Query local semantic search endpoints reliably when Fetch/WebFetch blocks localhost or private URLs
user-invocable: false
allowed-tools: Bash, Read, Grep
banner-loaded: true
---

# Semantic Search Query (Local)

When `docker.search` in `.lore/config.json` points to localhost or a private network, `Fetch`/`WebFetch` may fail due to URL restrictions.

## Query Methods

### Node.js (built-in fetch)

```bash
SEM_URL="http://localhost:PORT/search" SEM_Q="your query" SEM_K=5 \
node -e "const u=new URL(process.env.SEM_URL);u.searchParams.set('q',process.env.SEM_Q||'');u.searchParams.set('k',process.env.SEM_K||'8');fetch(u).then(r=>r.text()).then(t=>process.stdout.write(t)).catch(e=>{console.error(e.message);process.exit(1);});"
```

### curl

```bash
# Default: returns file paths (paths_min mode)
curl -s "http://localhost:PORT/search?q=your+query&k=5"

# Full mode: includes score and snippet per result
curl -s "http://localhost:PORT/search?q=your+query&k=5&mode=full"
```

## Checking Availability

```bash
node -e "const c=require('./.lore/lib/config').getConfig('.');console.log(c.docker?.search ? JSON.stringify(c.docker.search) : 'unavailable')"
```

If output is `unavailable`, skip to Grep/Glob fallback immediately.

## Gotchas

- **MAX_K defaults to 2** — queries requesting `k` higher than `MAX_K` raise a validation error. Set `-e MAX_K=10` when starting the container.
- **Paths in responses are relative** to the mounted volume root. Prepend the local mount path to read them.
- **Model loading takes 30-60s on first start** — health returns `ok: true` only after indexing completes; poll before querying.
- **WebFetch fails on localhost** — always use Bash (Node fetch or curl) for lore-docker endpoints.
- Always include the `q` query parameter. Prefer short, concrete queries first, then broaden if needed.
