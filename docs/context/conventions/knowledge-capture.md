---
required: false
---
# Knowledge Capture

How knowledge entries should be written and organized. For routing rules (what goes where), see `.lore/instructions.md`.

## 1. Ask Before Writing

**No knowledge write happens without operator approval.**

- Before creating a skill, runbook, environment doc, or work item — state the file path and a one-line description of the content.
- Ask the operator: "Is that okay?" Proceed only after approval.
- This applies to all writes under `docs/` and `.lore/skills/`.
- Workers never write knowledge — they report findings to the orchestrator, who proposes writes to the operator.

## 2. One Canonical Location Per Fact

**If changing one fact means editing multiple files, the structure is wrong.**

- Every piece of reference data (IPs, endpoints, service configs) lives in exactly one file. Everything else links to it.
- Before adding information, search for where it already exists. Add to that file or link to it.
- Tables and lists consolidate naturally. Five services on the same platform belong in one table, not five pages.
- When you find duplication, fix it: pick the canonical location, consolidate, replace copies with links.

## 3. Consolidate, Don't Scatter

**A file should earn its existence. Thin files are overhead.**

- If a page is under 30 lines, it's a section in a parent file — not its own page.
- Related services, endpoints, or configs belong in a single reference table. Don't create a page per service when a row per service will do.
- Group by domain, not by when you learned it. "All backup targets" beats "backup-vaultwarden, backup-docker, backup-proxmox, backup-media, backup-offsite, backup-network."
- Runbooks for trivial operations (single command, one config export) belong as entries in a quick-reference list.

## 4. Minimize Update Cost

**Structure for maintainability, not comprehensiveness.**

- Before creating a new file, ask: "If this data changes, how many files do I touch?" If the answer is more than one, restructure.
- Reference data (IPs, ports, VLANs, service URLs) belongs in inventory tables, not embedded in prose across runbooks and plans.
- Runbooks should reference inventory data by link, not by copying it inline.
- When infrastructure changes, one file update should be sufficient.

## 5. Keep It Scannable

**Walls of prose hide information. Structure reveals it.**

- Use tables for anything with repeating attributes (services, VMs, endpoints, backup schedules).
- Use short bullets for facts. Save paragraphs for decisions that need rationale.
- Front-load the key insight. First sentence answers "what do I need to know?"
- Headings should be specific enough to find by scanning. "NFS Configuration" beats "Additional Notes."

## 6. Don't Capture Noise

**Not everything learned is worth persisting.**

- Don't capture session-specific context (current task state, in-progress decisions).
- Don't write knowledge that restates what code or config files already make obvious.
- Don't create entries for hypothetical problems you haven't hit.
- Don't capture what's already in instructions or conventions. Link instead.
