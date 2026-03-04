---
name: lore-semantic-search
description: Query the knowledge base using semantic search via MCP tools or direct HTTP
type: reference
user-invocable: false
banner-loaded: true
---

# Semantic Search Query (Local)

**Preferred:** Use the `lore_search` MCP tool when available — it handles search + path resolution in a single call. The methods below are fallbacks for environments without MCP support.

## Query Methods

### curl

```bash
# Default: returns file paths
curl -s "http://localhost:9185/search?q=your+query&k=5"

# Full mode: includes score and snippet per result
curl -s "http://localhost:9185/search?q=your+query&k=5&mode=full"
```

### Node.js (built-in fetch)

```bash
SEM_URL="http://localhost:9185/search" SEM_Q="your query" SEM_K=5 \
node -e "const u=new URL(process.env.SEM_URL);u.searchParams.set('q',process.env.SEM_Q||'');u.searchParams.set('k',process.env.SEM_K||'8');fetch(u).then(r=>r.text()).then(t=>process.stdout.write(t)).catch(e=>{console.error(e.message);process.exit(1);});"
```

## Checking Availability

```bash
curl -sf http://localhost:9185/health
```

## Snags

- **Model loading takes 30-60s on first start** — health returns `ok: true` only after indexing completes; poll before querying.
- **WebFetch fails on localhost** — always use Bash (Node fetch or curl) for sidecar endpoints.
- Always include the `q` query parameter. Prefer short, concrete queries first, then broaden if needed.
