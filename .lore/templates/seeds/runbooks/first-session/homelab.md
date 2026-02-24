# First Session Setup: Homelab

> **Coming soon.** This runbook is planned for a future release.

**Profile:** Operators managing personal infrastructure — self-hosted services, home automation, local development stacks, NAS, media servers — with no enterprise org context.

In the meantime, [knowledge-worker.md](knowledge-worker.md) covers many universal patterns that apply here: identity setup, keystore (local Vaultwarden works well), Docker inventory discovery, and service mapping. Skip or adapt the enterprise-specific phases (cloud CLI auth, org wiki, corporate secret stores).

**What will differ:**
- No corporate cloud CLI — local tooling (Docker, Proxmox, Ansible, Terraform for homelab) instead
- Personal GitHub or self-hosted Gitea rather than enterprise VCS
- Secret store: local Vaultwarden or `pass` — no enterprise KMS
- Service mapping focused on local network topology, not cloud architecture
- No org wiki — documentation lives in the instance KB itself
