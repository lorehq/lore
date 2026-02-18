---
name: lore-create-todo-with-capture
description: Append a capture checkpoint and optimize task lists for parallelism
domain: Orchestrator
user-invocable: false
allowed-tools: TaskCreate, TaskUpdate
---

# Create Todo List with Capture

Append a final capture checkpoint to every task list and structure tasks for safe parallel execution.

## Algorithm

**Input**: N tasks from user
**Output**: N tasks organized into dependency order + 1 final capture task

The capture task is always last. No intermediate checkpoints.

## Planning Rules

1. Identify dependencies first.
2. Put prerequisite tasks before dependent tasks.
3. Mark independent tasks as parallelizable so subagents can run them concurrently.
4. Keep only dependency-gated tasks in sequence.
5. Keep capture as the final task after all execution branches converge.

## Capture Task

```
activeForm: "Performing capture"

Follow the capture checklist — review session, create skills, update registries, validate consistency.
```
