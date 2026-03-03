# First Session Setup: Homelab

Grounds the agent in operator identity, network topology, infrastructure, and services before any project work begins. Run once per instance. Follow phases in order — each phase depends on the previous.

**Profile:** Operators managing personal infrastructure — Proxmox clusters, self-hosted services, home automation, NAS, media servers — with no enterprise org context.

**How to invoke:** Ask the agent: *"Walk me through first-session setup."*

!!! tip "Recommended: start the docs sidecar first"
    Run `/lore-docker` before Phase 1. The Docker sidecar provides semantic search and a live docs UI — every skill, environment doc, and runbook created in later phases becomes instantly searchable. Skip if Docker isn't available; everything works without it.

---

## Phase 1: Identity

**Goal:** Tell the agent who it is, who it serves, and what it must never do without asking.

### Operator Profile

Create `~/.lore/knowledge-base/operator-profile.md`.

Minimum fields:
- Name, homelab purpose (learning, media, home automation, development)
- Infrastructure management style: Ansible, Terraform, click-ops, manual SSH — no judgment, adapt to the operator's workflow
- Accounts: GitHub (personal), self-hosted Gitea/Forgejo if applicable
- Tool and CLI preferences

Without it, the agent has no operator context — it knows the KB but not who it's working for.

### Agent Rules

Edit `docs/context/agent-rules.md`.

Minimum fields:
- Deployment assignment: instance name, operator
- Scope: what domains this instance covers (infrastructure management, service deployment, etc.)
- **Critical rule:** Never auto-apply destructive changes — reboots, VM destruction, firewall modifications, storage pool changes, VLAN reassignments — without explicit operator confirmation. The agent has SSH and API access to production infrastructure.

This file is injected as PROJECT context every session.

### Machine Inventory

Create `~/.lore/knowledge-base/environment/machine.md`.

Capture: hostname, OS, installed runtimes, CLI tools (Ansible, Terraform, kubectl, docker, ssh), shell environment. This is the management workstation — not the homelab nodes (those come in Phase 4).

---

## Phase 2: Model Configuration

**Goal:** Wire the three-tier worker system before any delegation happens.

Set model aliases in `~/.claude/settings.json` under `env`:

```json
"ANTHROPIC_DEFAULT_HAIKU_MODEL": "<fast-model>",
"ANTHROPIC_DEFAULT_SONNET_MODEL": "<default-model>",
"ANTHROPIC_DEFAULT_OPUS_MODEL": "<powerful-model>"
```

After setting aliases, regenerate agent frontmatter:

```bash
node .lore/harness/lib/generate-agents.js
```

**Do not skip.** Claude Code silently ignores full model IDs in agent frontmatter — all workers run at the caller's tier with no error.

Verify by asking the agent to run a worker test: each tier (fast/default/powerful) should report the model it's running on.

---

## Phase 3: Keystore

**Goal:** Establish a secret store before ingesting any credentials.

**Rule:** Secrets never go in the KB. The KB documents item names and what they're for — never values.

Options:

| Option | Best for |
|--------|----------|
| Vaultwarden (self-hosted) | Already running in the homelab; full control |
| `pass` (GPG-based) | Lightweight, git-friendly, no server needed |
| 1Password / Bitwarden (cloud) | Cross-machine sync without self-hosting |

Authenticate the CLI, verify access, and document the tool and item naming convention in `~/.lore/knowledge-base/environment/`.

Typical homelab items to catalog (names and purposes only, never values):
- Proxmox API tokens
- SSH keys (per host or shared)
- Router/firewall admin credentials
- Service API keys (DNS provider, backup target, etc.)
- Container registry credentials

---

## Phase 4: Network Mapping

**Goal:** Map the network before anything else. Every subsequent phase references network context — which VLAN, which subnet, which interface. Without this, the agent asks the operator to clarify repeatedly.

**This phase is the key differentiator from Knowledge Worker.** Enterprise environments start with cloud CLIs. Homelab starts with the network.

### Discovery

Ask the operator what runs routing/firewall — OPNsense, pfSense, OpenWrt, Unifi, MikroTik, or other. Access methods:

- **Config export** — OPNsense XML backup, pfSense config, OpenWrt UCI export
- **API** — OPNsense/pfSense REST API, Unifi controller API
- **SSH** — direct CLI access to parse running config

### Document

Extract and write to `~/.lore/knowledge-base/environment/network-topology.md`:

- **VLANs** — ID, name, purpose, subnet, gateway, DHCP range
- **Firewall rules** — inter-VLAN policy, port forwards, NAT
- **Switch topology** — which ports on which switches, trunk vs access, VLAN assignments
- **Wireless** — SSIDs, VLAN bindings, AP model/location
- **DNS** — upstream resolvers, local overrides, split-horizon if applicable

If the network is simple (flat, one subnet, consumer router), this phase is quick — document what's there and move on.

---

## Phase 5: Infrastructure Inventory

**Goal:** Map physical and virtual compute, storage, and HA configuration.

### Hypervisors

Connect to the hypervisor management interface. For Proxmox (most common):

- **Proxmox API** — URL + API token from keystore (Phase 3)
- **SSH** — enumerate via `pvesh` or `/etc/pve`

Document in `~/.lore/knowledge-base/environment/hypervisors.md`:
- Nodes, CPU/RAM specs, cluster membership
- HA configuration and resource groups

### Storage

Document in `~/.lore/knowledge-base/environment/storage.md`:
- **Ceph** — monitors, OSDs, pools, cluster networks, replication factor
- **ZFS** — pools, datasets, compression settings, snapshot policies
- **NFS/SMB exports** — what's shared, from where, to which networks
- **Proxmox storage config** — which backends, where VMs and backups land

### Compute

Enumerate all VMs and containers across nodes. Document in `~/.lore/knowledge-base/environment/compute-inventory.md`:
- VMID, name, hosting node, allocated resources (CPU, RAM, disk)
- Network interfaces and IPs — cross-reference with VLAN map from Phase 4
- Purpose — ask operator to annotate anything not inferrable from hostname

---

## Phase 6: Service Mapping

**Goal:** Enumerate running services — containers, orchestration, DNS, reverse proxy, backups, media.

This phase typically requires SSH-ing into multiple hosts or querying APIs. Ask the operator which hosts run Docker/Podman and how to reach them.

### Containers

Run `docker ps` (or equivalent) on each host. Catalog: container name, image, ports, volumes, restart policy, compose stack.

### Orchestration (if applicable)

k3s, k8s, Docker Swarm — map nodes, namespaces, deployments, services, ingress rules.

### Reverse Proxy

Nginx Proxy Manager, Traefik, or Caddy — enumerate proxy hosts, backends, SSL certificate status.

### DNS

AdGuard Home, Pi-hole, or CoreDNS — upstream config, local DNS entries, conditional forwarding, DHCP leases.

### Backups

Proxmox Backup Server, Borg, Restic, rsync — schedules, targets, retention policies, last successful run.

### Media & Other Stacks

Arr stack, Jellyfin/Plex, Immich, Home Assistant — document each service's role, host, storage, and network connections.

Write service docs to `~/.lore/knowledge-base/environment/` — one per logical group (containers, dns, backups, media) or one per host, based on operator preference. Propose the structure and wait for approval before writing.

**Snags, gotchas, quirks become fieldnotes.** During service mapping, snags will surface — a container needing a specific network mode, a backup that fails silently, a DNS rebinding issue. Each is a fieldnote candidate. Propose; create after operator approval.

---

## Phase 7: IaC Bootstrap (Optional)

**Goal:** Connect existing infrastructure-as-code repos or establish a starting point.

**If IaC already exists** (Terraform for Proxmox VMs, Ansible for host config, Pulumi, NixOS): discover repos, map what's managed vs manual, document the boundary.

**If no IaC yet:** propose a starting point based on Phases 4–6 discovery:
- Ansible inventory from discovered hosts and roles
- Terraform resources for Proxmox VM/container definitions
- Shell-based approach if that fits the operator's workflow

This phase is optional. Many productive homelabs run on manual configuration — the agent's value is in documenting what exists, not forcing a workflow change.

---

## Phase 8: Semantic Search & Knowledge Defrag

### Semantic Search

```bash
/lore-docker
```

Ports are auto-computed per project (hash-based). After starting:

```bash
/lore-docker status
```

### Knowledge Defrag

**Run after the environment is substantially documented — not before.**

Once Phases 1–6 are complete and the KB has accumulated, run the knowledge defrag runbook to restructure the global knowledge base by content rather than creation order.

```bash
git checkout -b knowledge-defrag-$(date +%Y%m%d)
# Then: "Run the knowledge defrag runbook"
```

### First Work Item

If the operator has a current project (migrating a service, expanding storage, new backup target), create an epic or initiative now — the agent has full context to scope it.

---

## Verification Checklist

- [ ] Operator profile and agent rules reflect current deployment
- [ ] Destructive-operation confirmation rule is in agent-rules.md
- [ ] Worker tiers (fast/default/powerful) route to the expected models
- [ ] Keystore accessible — agent can retrieve a test item
- [ ] Network topology documented (VLANs, subnets, firewall rules)
- [ ] Hypervisors and compute inventory current
- [ ] Services cataloged with ports, hosts, and purposes
- [ ] Semantic search returning results for infrastructure terms
- [ ] Active initiatives and epics created for current projects (if any)

---

## Snags

- **Network before compute** — map VLANs and subnets before inventorying hosts. Every VM and container references network context; without the map, docs are incomplete.
- **Keystore before credentials** — configure Phase 3 before authenticating CLIs. Credentials ingested first have nowhere secure to go.
- **Worker tier routing** — Claude Code silently ignores full model IDs in agent frontmatter. Use short aliases and run `generate-agents.js` after any alias change.
- **Management workstation ≠ homelab nodes** — Phase 1 machine inventory covers the machine running the agent. Homelab nodes are discovered in Phase 5 via SSH/API.
- **TLS required for localhost secret stores** — `bw` CLI 2026.x raises `InsecureUrlNotAllowedError` for localhost HTTP. Self-hosted Vaultwarden must serve TLS; a self-signed cert is sufficient.
- **Proxmox API tokens need explicit permissions** — a token inherits no permissions by default. The operator must assign PVEAuditor (read-only) or PVEAdmin to the token's user/role.
- **`docker ps -a` beats memory** — stopped containers surface services faster than trying to recall what was running across multiple hosts.
