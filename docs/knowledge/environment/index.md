# Environment Knowledge

The `environment/` directory maps the infrastructure and services you interact with. Facts captured here prevent re-discovery during future sessions.

## Structure

- **Inventory** (`inventory/`): Catalog of URLs, API endpoints, account IDs, and service names.
- **Decisions** (`decisions/`): Architectural Decision Records (ADRs) and technical trade-offs.
- **Diagrams** (`diagrams/`): Mermaid or ASCII maps of system relationships.
- **Reference** (`reference/`): External documentation links, CLI flags, and third-party quirks.

## Capture Rules

When you interact with a new service or API:
1. **Check:** Is this service already documented in `inventory/`?
2. **Act:** If not, propose a new entry.
3. **Reference:** Mention the relevant `docs/knowledge/environment/` file in your task summary.

Knowledge captured here must be **Environment-Specific** (concrete URLs, IDs). **Reusable Fixes** (path encoding, auth header tricks) belong in `.lore/fieldnotes/`.

