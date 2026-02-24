# Environment

The `environment/` directory maps the infrastructure and services the agent interacts with: URLs, repos, accounts, API endpoints, auth requirements, and relationships between components. Facts captured here are referenced by skills and runbooks so the agent doesn't re-discover them each session.

This directory is built by the agent during environment mapping — not pre-structured upfront. Let it grow organically during your first session, then run the knowledge defrag runbook to organize it by content.
