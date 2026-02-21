---
name: lore-docker-update-volume-conflict
description: Pulling a new lore-docker image fails with PermissionError on runtime_data volume — remove volumes before restart
tags: [docker, lore-docker, volumes, upgrade]
---

# lore-docker-update-volume-conflict

## Gotcha

After pulling a new `lorehq/lore-docker` image, the container crashes on startup with:

```
PermissionError: [Errno 13] Permission denied: PosixPath('/runtime-data/docs-work')
```

The `runtime_data` named volume was created by the previous container with different file ownership. The new image's entrypoint calls `shutil.rmtree()` on that path and fails.

## Fix

Stop the container **and remove volumes**, then start fresh:

```bash
docker compose -f .lore/docker-compose.yml down -v
LORE_DOCS_PORT=<port> LORE_SEMANTIC_PORT=<port> docker compose -f .lore/docker-compose.yml up -d
```

The `-v` flag removes the `runtime_data` and `runtime_cache` named volumes so the new container creates them fresh with correct ownership.

## Notes

- `down` without `-v` leaves the volumes intact — the error will recur
- Semantic search re-indexes on first start after volume removal (may take 30-60s)
- This only affects image version upgrades, not normal restarts
