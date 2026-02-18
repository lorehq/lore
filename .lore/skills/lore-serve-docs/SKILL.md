---
name: lore-serve-docs
description: Start the local docs site with live reload. Installs Python and mkdocs-material if needed.
domain: Documentation
scope: internal
user-invocable: true
allowed-tools: Bash
---
# Serve Docs Locally

Start `mkdocs serve` with live reload. Installs dependencies if missing.

## Process

1. Check if Python is available (`python3 --version || python --version`)
   - If missing, guide installation based on OS:
     - **macOS**: `brew install python3` (or download from python.org)
     - **Linux (Debian/Ubuntu)**: `sudo apt install python3 python3-pip`
     - **Linux (Fedora)**: `sudo dnf install python3 python3-pip`
   - If the user doesn't want to install Python, suggest `/lore-serve-docs-docker` instead
2. Check if mkdocs is installed (`command -v mkdocs`)
   - If not installed, install via `pip install mkdocs-material` (includes mkdocs, pymdownx, etc.)
   - If `pip` not found, try `pip3`
3. Check if already running (`pgrep -f 'mkdocs serve'`)
   - If `pgrep` finds a PID, **always verify** it's actually serving: `curl -s -o /dev/null -w '%{http_code}' http://localhost:8000`
   - If curl succeeds (200): report the URL, don't start a second instance
   - If curl fails: the process is stale — kill it (`kill $(pgrep -f 'mkdocs serve')`) and continue to step 4
4. Start in background: `nohup mkdocs serve > /dev/null 2>&1 &`
5. Wait briefly (`sleep 2`), then verify with `curl -s -o /dev/null -w '%{http_code}' http://localhost:8000`
   - If curl still fails, check `mkdocs serve` output for errors (port conflict, config error)
6. Report to user:
   - URL: http://localhost:8000
   - Live reload is automatic — editing docs/, mkdocs.yml, or running generate-nav.sh triggers rebuild
   - To stop: use `/lore-stop-docs`

## Gotchas

- **Stale process**: `pgrep` can find a dead/zombie mkdocs process — always verify with curl before trusting it
- **Port 8000 conflict**: If mkdocs fails to bind, suggest `mkdocs serve --dev-addr 0.0.0.0:8001`
- **pip not found**: Try `pip3` first, then suggest `/lore-serve-docs-docker` as the zero-install alternative
