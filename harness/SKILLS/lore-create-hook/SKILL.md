---
name: lore-create-hook
description: Create a hook override script at the project or global level
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---

# Create Hook Override

Create a hook script that overrides the bundle's default behavior for a specific event.

## When to Use

- Override a bundle hook for this project only (project-level)
- Add a hook behavior that applies to all projects (global-level)
- Customize what happens at a specific lifecycle event

## Workflow

1. **Ask the operator:**
   - Which hook event? (see table below)
   - What should it do? (the behavior)
   - Project-level or global-level override?

2. **Choose the event:**

   | Event | Filename | When it fires |
   |-------|----------|---------------|
   | PreToolUse | `pre-tool-use.mjs` | Before a tool executes — can allow/deny/ask |
   | PostToolUse | `post-tool-use.mjs` | After a tool executes — can inject context |
   | PromptSubmit | `prompt-submit.mjs` | Before user message is processed |
   | SessionStart | `session-start.mjs` | Session begins or resumes |
   | Stop | `stop.mjs` | Agent finishes responding |
   | PreCompact | `pre-compact.mjs` | Before context window compression |
   | SessionEnd | `session-end.mjs` | Session terminates |

3. **Write the script:**

   Hook scripts are Node.js ES modules (`.mjs`). They read JSON from stdin and write JSON to stdout.

   **Template — PreToolUse (permission decision):**
   ```javascript
   import { readFileSync } from "fs";

   const input = JSON.parse(readFileSync("/dev/stdin", "utf8"));
   const toolName = input.tool_name || "";

   // Example: block dangerous tools
   if (toolName === "rm" || toolName === "delete") {
     console.log(JSON.stringify({
       decision: "deny",
       reason: "Destructive tool blocked by project hook"
     }));
   } else {
     console.log(JSON.stringify({ decision: "allow" }));
   }
   ```

   **Template — PostToolUse / PromptSubmit (context injection):**
   ```javascript
   import { readFileSync } from "fs";

   const input = JSON.parse(readFileSync("/dev/stdin", "utf8"));

   // Example: inject reminder after every tool use
   console.log(JSON.stringify({
     additionalContext: "Remember to follow the project coding standards."
   }));
   ```

   **Template — Stop (observe or block):**
   ```javascript
   import { readFileSync } from "fs";

   const input = JSON.parse(readFileSync("/dev/stdin", "utf8"));

   // Example: log completion (observational — don't block)
   // Blocking is not supported on all platforms
   console.log(JSON.stringify({}));
   ```

   **Template — no-op (pass-through):**
   ```javascript
   // Empty output = no-op (allow/continue)
   ```

4. **Write to the correct path:**
   - Project: `.lore/HOOKS/<event>.mjs`
   - Global: `~/.config/lore/HOOKS/<event>.mjs`

5. **Verify override:** The hook takes effect immediately — no `lore generate` needed.
   Hook resolution is runtime, not projection-time.

## Resolution Order

Hooks use three-layer **last-wins** resolution:
1. **Project** `.lore/HOOKS/` (highest priority)
2. **Global** `~/.config/lore/HOOKS/`
3. **Bundle** declared in `manifest.json` (lowest)

Only ONE script runs per event — the highest-priority layer wins.

## Input/Output Contract

**Input (stdin):** JSON from the platform, augmented with `lore.session` block:
```json
{
  "tool_name": "write_file",
  "tool_input": { "path": "...", "content": "..." },
  "lore": {
    "session": { "id": "abc123", "platform": "claude" }
  }
}
```

**Output (stdout):**
- `{}` or empty = no-op (allow/continue)
- `{ "decision": "allow" }` = explicitly allow
- `{ "decision": "deny", "reason": "..." }` = block with explanation
- `{ "decision": "ask", "message": "..." }` = prompt operator for approval
- `{ "additionalContext": "..." }` = inject text into agent context

## Important

- **Stderr must not contain JSON.** Debug output goes to `/tmp` or a log file. Stderr contamination causes platform errors.
- **Stop blocking varies by platform.** Claude/Copilot support it; Cursor/Windsurf don't. Treat Stop as observational.
- **No `lore generate` needed.** Hooks are resolved at runtime by the binary, not during projection.
