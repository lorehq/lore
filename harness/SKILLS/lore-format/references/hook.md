# Creating Hook Behaviors

## Location

Hook behaviors can be added at three layers. All layers accumulate — every behavior across all layers runs in parallel per event.

- **Bundle**: declared in `manifest.json` as `{name, script}` objects
- **Global**: `~/.config/lore/HOOKS/<event>/<name>.mjs`
- **Project**: `.lore/HOOKS/<event>/<name>.mjs`

No `lore generate` needed — hooks resolve at runtime.

## Events

| Event | Filename | When it fires |
|-------|----------|---------------|
| PreToolUse | `pre-tool-use` | Before a tool executes |
| PostToolUse | `post-tool-use` | After a tool executes |
| PromptSubmit | `prompt-submit` | Before user message is processed |
| SessionStart | `session-start` | Session begins or resumes |
| Stop | `stop` | Agent finishes responding |
| PreCompact | `pre-compact` | Before context compression |
| SessionEnd | `session-end` | Session terminates |

## Accumulation (all layers contribute)

All behaviors from all layers run in parallel per event:

1. **Bundle** behaviors from `manifest.json` (lowest priority)
2. **Global** behaviors from `~/.config/lore/HOOKS/<event>/*.mjs`
3. **Project** behaviors from `.lore/HOOKS/<event>/*.mjs` (highest priority)

For **blocking events** (pre-tool-use, prompt-submit, stop): if ANY behavior returns a block/deny decision, the event is blocked. Block reasons from all failing scripts are concatenated.

For **non-blocking events** (post-tool-use, session-start, pre-compact, session-end): all behaviors run, failures are logged to stderr but don't block.

## Bundle Hook Declaration

Bundles declare behaviors as arrays of `{name, script}` objects per event:

```json
{
  "manifest_version": 1,
  "slug": "my-bundle",
  "name": "My Bundle",
  "version": "1.0.0",
  "description": "Example bundle with hooks",
  "hooks": {
    "pre-tool-use": [
      { "name": "Destructive Guard", "script": "SCRIPTS/destructive-guard.mjs" },
      { "name": "Secrets Guard", "script": "SCRIPTS/secrets-guard.mjs" }
    ],
    "prompt-submit": [
      { "name": "Deploy Warning", "script": "SCRIPTS/deploy-warning.mjs" }
    ]
  }
}
```

Each behavior is one file, one job, one name. The `name` field is human-readable and displayed in the TUI.

## Global/Project Hook Layout

For global and project layers, behaviors are organized as files inside event directories:

```
HOOKS/
  pre-tool-use/
    destructive-guard.mjs
    secrets-guard.mjs
  prompt-submit/
    deploy-warning.mjs
```

The filename (minus `.mjs`) becomes the behavior name. Legacy single-file layout (`HOOKS/<event>.mjs`) is still supported as a fallback.

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
- `{}` or empty = no-op (allow)
- `{ "decision": "allow" }` = explicitly allow
- `{ "decision": "deny", "reason": "..." }` = block with message
- `{ "decision": "ask", "message": "..." }` = prompt operator for confirmation
- `{ "additionalContext": "..." }` = inject text into agent context
- `{ "decision": "block", "reason": "..." }` = block stop (Stop event only)

## Script Templates

**PreToolUse — single-purpose guard:**
```javascript
import { readFileSync } from "fs";

const input = JSON.parse(readFileSync("/dev/stdin", "utf8"));
const tool = input.tool_name || "";
const toolInput = input.tool_input || {};

if (tool === "Bash") {
  const cmd = toolInput.command || "";
  if (/\brm\s+-rf\b/.test(cmd) || /\bgit\s+push\s+--force\b/.test(cmd)) {
    console.log(JSON.stringify({
      decision: "deny",
      reason: `Destructive command blocked: ${cmd.slice(0, 80)}`
    }));
    process.exit(0);
  }
}

// Default: allow
console.log(JSON.stringify({ decision: "allow" }));
```

**PostToolUse — lint warning after edit:**
```javascript
import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";

const input = JSON.parse(readFileSync("/dev/stdin", "utf8"));
const tool = input.tool_name || "";
const filePath = input.tool_input?.file_path || "";

if ((tool === "Edit" || tool === "Write") && /\.(ts|tsx|js|jsx)$/.test(filePath) && existsSync(filePath)) {
  try {
    const output = execSync(`grep -n "console\\.log" "${filePath}" 2>/dev/null`, { encoding: "utf8" });
    if (output.trim()) {
      console.log(JSON.stringify({
        additionalContext: `WARNING: console.log found in ${filePath}:\n${output.trim()}`
      }));
      process.exit(0);
    }
  } catch { /* grep returns 1 if no matches — not an error */ }
}

// No-op for other tools
```

**PromptSubmit — context injection:**
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

## Important

- **All scripts are Node.js ES modules** (`.mjs`). Invoked via `node <script>`. No bash.
- **Stderr must not contain JSON.** Debug logs go to `/tmp/`. Stderr contamination causes platform errors.
- **Stop blocking varies by platform.** Claude/Copilot support `block` decision; Cursor/Windsurf don't.
- **Exit early with `process.exit(0)`** after writing your decision. Don't fall through to default logic.
- **No external dependencies.** Scripts run with Node.js built-ins only — no npm packages.
- **One behavior per file.** Keep each script focused on a single concern. Use multiple behaviors on the same event instead of combining logic into one script.
