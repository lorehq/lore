# Customizing the Environment Section

The `docs/environment/` directory is yours to organize however fits your domain. The default structure (systems, conventions, diagrams) is a starting point — not a constraint.

## How It Works

The nav is generated dynamically from whatever directories and files exist under `docs/environment/`. Add a folder, put markdown in it, run `bash scripts/generate-nav.sh`, and it appears in nav automatically.

## Adding a Section

Create a directory and an `index.md`:

```
docs/environment/
└── my-new-section/
    └── index.md
```

The directory name becomes the nav label (kebab-case is converted to Title Case: `my-new-section` becomes "My New Section").

## Removing a Default Section

Delete the directory. The nav generator skips missing directories.

```bash
rm -rf docs/environment/diagrams
bash scripts/generate-nav.sh
```

## Examples by Domain

### DevOps / Platform Engineering

```
docs/environment/
├── infrastructure/     # Cloud accounts, regions, clusters
├── ci-cd/              # Pipelines, runners, deploy targets
├── monitoring/         # Dashboards, alerts, SLOs
├── secrets/            # Vault paths, rotation policies (no actual secrets)
└── conventions/        # Naming, tagging, branching standards
```

### Full-Stack Development

```
docs/environment/
├── services/           # APIs, databases, message queues
├── frontend/           # Build tools, CDN, feature flags
├── testing/            # Test environments, fixtures, mocks
└── conventions/        # Code style, PR process, release flow
```

### Homelab / Self-Hosted

```
docs/environment/
├── hosts/              # Servers, VMs, containers
├── networking/         # DNS, VLANs, reverse proxies
├── storage/            # NAS, backups, replication
└── services/           # Apps, dashboards, automation
```

## Nav Generation

The nav updates when you run `bash scripts/generate-nav.sh`. A PostToolUse hook detects docs/ changes and reminds the agent to regenerate nav automatically.

Sections appear in nav only when they contain at least one `.md` file. Empty directories (or directories with only `.gitkeep`) are skipped.
