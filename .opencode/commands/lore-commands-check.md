---
description: Smoke-check OpenCode Lore slash command files
---
Run the OpenCode command smoke check and summarize warnings:
!`bash scripts/check-opencode-commands.sh || true`

If linked repos are missing files, recommend:
`bash scripts/lore-link.sh --refresh`
