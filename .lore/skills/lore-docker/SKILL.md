---
name: lore-docker
description: Start, stop, or inspect the local Lore sidecar (semantic search and memory)
type: command
user-invocable: true
allowed-tools: Bash
---
# Lore Sidecar

Manage the local Lore sidecar lifecycle.

The sidecar provides semantic search and high-speed short-term memory (STM) for agent sessions.

## Platform detection

Detect the OS for process queries:
- `uname -s` → `Linux` or `Darwin` = Unix, `MINGW*` or `MSYS*` or `CYGWIN*` = Windows

## Process

Interpret intent from user input:
- default or `start` -> start sidecar
- `stop` -> stop sidecar
- `status` -> report current state

### Start

1. Compute ports and project name:
   - Read config for explicit ports (`docker.search.port`), else compute hash-based port (starting at 10001).
   - `COMPOSE_PROJECT_NAME="$(basename "$PWD")"`
2. Run Docker:
    - Check Docker daemon: `docker info > /dev/null 2>&1`
    - Pull image: `docker pull lorehq/lore-docker:latest`
    - Start services: `docker compose -f .lore/docker-compose.yml up -d`
    - Wait for search port to respond.
    - Verify health: `curl -s http://localhost:$LORE_SEMANTIC_PORT/health`

### Stop

1. Stop Docker services: `docker compose -f .lore/docker-compose.yml down`
2. Clear docker config from `.lore/config.json`.

### Status

1. Check container state and verify HTTP response at `LORE_SEMANTIC_PORT/health`.

## Snags

- `docker compose` project name must be exported as `COMPOSE_PROJECT_NAME` to avoid container naming collisions.
- Semantic search model loading can take 30-60 seconds on first start. Poll `/health` until `ok: true`.
