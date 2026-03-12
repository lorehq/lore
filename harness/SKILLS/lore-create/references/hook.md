# Creating Hook Overrides

## Location

- Project: `.lore/HOOKS/<event>.mjs`
- Global: `~/.config/lore/HOOKS/<event>.mjs`

No `lore generate` needed — hooks resolve at runtime.

## Events

| Event | Filename | When it fires |
|-------|----------|---------------|
| PreToolUse | `pre-tool-use.mjs` | Before a tool executes |
| PostToolUse | `post-tool-use.mjs` | After a tool executes |
| PromptSubmit | `prompt-submit.mjs` | Before user message is processed |
| SessionStart | `session-start.mjs` | Session begins or resumes |
| Stop | `stop.mjs` | Agent finishes responding |
| PreCompact | `pre-compact.mjs` | Before context compression |
| SessionEnd | `session-end.mjs` | Session terminates |

## Resolution Order (last-wins)

1. **Project** `.lore/HOOKS/` (highest)
2. **Global** `~/.config/lore/HOOKS/`
3. **Bundle** declared in `manifest.json` (lowest)

Only ONE script runs per event.

## Script Templates

**PreToolUse — permission decision:**
```javascript
import { readFileSync } from "fs";

const input = JSON.parse(readFileSync("/dev/stdin", "utf8"));
const toolName = input.tool_name || "";

if (toolName === "rm") {
  console.log(JSON.stringify({
    decision: "deny",
    reason: "Destructive tool blocked"
  }));
} else {
  console.log(JSON.stringify({ decision: "allow" }));
}
```

**PostToolUse / PromptSubmit — context injection:**
```javascript
import { readFileSync } from "fs";
const input = JSON.parse(readFileSync("/dev/stdin", "utf8"));

console.log(JSON.stringify({
  additionalContext: "Reminder text injected into agent context."
}));
```

**No-op (pass-through):**
```javascript
// Empty output = allow/continue
```

## Input/Output Contract

**Input (stdin):** JSON from the platform, augmented with `lore.session`:
```json
{
  "tool_name": "write_file",
  "tool_input": { "path": "...", "content": "..." },
  "lore": { "session": { "id": "abc123", "platform": "claude" } }
}
```

**Output (stdout):**
- `{}` or empty = no-op
- `{ "decision": "allow" }` = allow
- `{ "decision": "deny", "reason": "..." }` = block
- `{ "decision": "ask", "message": "..." }` = prompt operator
- `{ "additionalContext": "..." }` = inject context
- `{ "decision": "block", "reason": "..." }` = block stop (Stop event only, not all platforms)

## Important

- **Stderr must not contain JSON.** Debug logs go to `/tmp`. Stderr contamination causes platform errors.
- **Stop blocking varies by platform.** Claude/Copilot support it; Cursor/Windsurf don't.
- Scripts are Node.js ES modules (`.mjs`). Use `import` not `require`.
