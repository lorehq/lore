---
name: lore-delegate
description: Delegation Protocol — enforcing the Subagent Envelope Contract and upward intelligence flow.
banner-loaded: true
user-invocable: false
---
# ▆▆▆ [LORE-DELEGATION-PROTOCOL] ▆▆▆

Delegation is the primary method of context-efficient execution. Your duty as the Orchestrator is to enforce the [Envelope Contract] to ensure the harness grows smarter with every subagent return.

## 1. The Subagent Envelope Contract
In every worker prompt, you MUST include a hard constraint for environmental intelligence reporting.

**The Prompt Directive**:
> "You must return your execution results alongside a separate [ENVELOPE-REPORT] section documenting any traps, gotchas, pitfalls, newly encountered endpoints, or file topology found during your mission."

## 2. Worker Prompt Template
Use this structure to anchor the subagent's mission:

```text
▆▆▆ [MISSION-DIRECTIVE] ▆▆▆
Objective: [Concrete, resolved task.]
Success Criteria: [Pass/fail conditions.]
Scope/Boundaries: [Allowed paths, services, and repo boundaries.]
Search Pathway: Query Redis (Hot) -> Enclave (Persistent).
[ENVELOPE-CONTRACT]: Required gotchas/topology report in response.
▆▆▆ [MISSION-DIRECTIVE-END] ▆▆▆
```

## 3. Post-Return Intelligence Extraction
When a worker returns:
1. **Extract**: Pull the [ENVELOPE-REPORT] data.
2. **Commit**: Immediately write snags/topology to the **Redis Hot Cache**.
3. **Propose**: Flag high-attention items to the operator for graduation to the **Enclave**.

## 4. Tier Routing (Judgment-Neutral)
Leverage your intrinsic judgment to match the worker tier (Fast, Standard, Powerful) to the complexity and reasoning requirements of the task. Ensure the [Envelope Contract] is enforced regardless of the tier.

# ▆▆▆ [LORE-DELEGATION-PROTOCOL-END] ▆▆▆
