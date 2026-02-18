---
name: lore-create-todo-with-capture
description: Append a capture checkpoint to task lists
domain: Orchestrator
scope: internal
user-invocable: false
allowed-tools: TaskCreate, TaskUpdate
---

# Create Todo List with Capture

Append a final capture checkpoint to every task list.

## Algorithm

**Input**: N tasks from user
**Output**: N tasks + 1 final capture task

The capture task is always last. No intermediate checkpoints.

## Capture Task

```
activeForm: "Performing capture"

Follow the capture checklist — review session, create skills, update registries, validate consistency.
```
