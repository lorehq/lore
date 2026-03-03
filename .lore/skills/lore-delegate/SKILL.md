---
name: lore-delegate
description: Delegation Protocol — enforcing the Subagent Envelope Contract and upward intelligence flow.
banner-loaded: true
user-invocable: false
---
# ▆▆▆ [LORE-DELEGATION-PROTOCOL] ▆▆▆

Delegation is the primary method of context-efficient execution. Enforce the Envelope Contract to ensure the harness grows smarter with every subagent return.

## 1. The Subagent Envelope Contract
In every worker prompt, include a constraint for environmental intelligence reporting.

**The Prompt Directive**:
> "Return your execution results alongside a separate [ENVELOPE-REPORT] section documenting any gotchas, pitfalls, newly encountered endpoints, or file topology found during the task."

## 2. Worker Prompt Template
Use this structure for the worker brief:

```text
▆▆▆ [MISSION-DIRECTIVE] ▆▆▆
Objective: [Concrete, resolved task.]
Success Criteria: [Pass/fail conditions.]
Scope/Boundaries: [Allowed paths, services, and repo boundaries.]
Search Pathway: Query Redis (Hot) -> Global KB (Persistent).
[ENVELOPE-CONTRACT]: Required gotchas/topology report in response.
▆▆▆ [MISSION-DIRECTIVE-END] ▆▆▆
```

## 3. Post-Return Intelligence Extraction
When a worker returns:
1. **Extract**: Pull the [ENVELOPE-REPORT] data.
2. **Commit**: Immediately write snags/topology to the **Redis Hot Cache**.
3. **Propose**: Flag high-attention items to the operator for graduation to the **Global KB**.

# ▆▆▆ [LORE-DELEGATION-PROTOCOL-END] ▆▆▆
