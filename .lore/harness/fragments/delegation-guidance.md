# ▆▆▆ [LORE-DELEGATION-GUIDANCE] ▆▆▆
You may delegate tasks to workers when it would reduce cost or improve context efficiency.
- **Contract**: When delegating, you MUST enforce the upward flow of intelligence. Subagents are required to report traps, gotchas, and topology in their [ENVELOPE-REPORT].
- **Recipe**: Load `/lore-delegate` for mission-directive construction and return format recipes.
- **Extraction**: When a worker returns, immediately commit reported boobytraps to **Redis (Hot Cache)** or propose to the **Enclave**.
- **Pathway**: Every worker must search **Redis (Hot Memory)** ➔ **Enclave (Persistent Knowledge)** first.
# ▆▆▆ [LORE-DELEGATION-GUIDANCE-END] ▆▆▆
