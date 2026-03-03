# ▆▆▆ [LORE-HARNESS-PROTOCOL] ▆▆▆

## 1. Knowledge First
Search before you act. The harness maintains a persistent knowledge base —
use semantic search or Glob/Grep to find what you need before discovering
from scratch. Query Redis (Hot Memory) for recent session context, then
the global knowledge base (~/.lore/knowledge-base/) for historical knowledge.

## 2. Capture What Matters
When you hit a non-obvious snag — an API quirk, encoding issue, auth gotcha —
record it as a fieldnote. Future sessions benefit from your discoveries.
High-signal items should be proposed for graduation from session memory
to the persistent knowledge base.

## 3. Security
Reference secrets by name (env vars, vault paths) — never embed values.
Escalate to the operator when uncertain about sensitive content.

## 4. Delegation
When delegating to workers, use the delegation contract to ensure environmental
findings flow back. Workers report captures; the caller persists them.

# ▆▆▆ [LORE-HARNESS-PROTOCOL-END] ▆▆▆
