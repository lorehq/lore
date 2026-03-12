# Creating Hook Scripts

## Location

- Project: `.lore/HOOKS/<event>.mjs`
- Global: `~/.config/lore/HOOKS/<event>.mjs`
- Bundle: anywhere in bundle, referenced via `manifest.json` `"hooks"` field

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

Only ONE script runs per event. No chaining.

## Bundle Hook Declaration

Bundles declare hooks in `manifest.json`, not via directory scanning:

```json
{
  "manifest_version": 1,
  "slug": "my-bundle",
  "name": "My Bundle",
  "version": "1.0.0",
  "description": "Example bundle with hooks",
  "hooks": {
    "pre-tool-use": "HOOKS/pre-tool-use.mjs",
    "post-tool-use": "HOOKS/post-tool-use.mjs",
    "prompt-submit": "HOOKS/prompt-submit.mjs",
    "stop": "HOOKS/stop.mjs"
  }
}
```

Paths are relative to bundle root. Scripts can live in `HOOKS/` or any directory — only the manifest path matters.

## One Script, Multiple Concerns

Lore runs ONE script per event. If you need multiple behaviors on the same event (e.g., block destructive commands AND warn about console.log), combine them into a single script using tool-name matching:

```javascript
import { readFileSync } from "fs";

const input = JSON.parse(readFileSync("/dev/stdin", "utf8"));
const tool = input.tool_name || "";
const toolInput = input.tool_input || {};

// --- Guard: block destructive bash commands ---
if (tool === "Bash") {
  const cmd = toolInput.command || "";
  if (/\brm\s+-rf\b/.test(cmd) || /\bgit\s+push\s+--force\b/.test(cmd)) {
    console.log(JSON.stringify({
      decision: "deny",
      reason: `Destructive command blocked: ${cmd.slice(0, 80)}`
    }));
    process.exit(0);
  }
  if (/\bgit\s+push\b/.test(cmd)) {
    console.log(JSON.stringify({
      decision: "ask",
      message: "Review changes before pushing?"
    }));
    process.exit(0);
  }
}

// --- Guard: warn on writing to protected paths ---
if (tool === "Write" || tool === "Edit") {
  const path = toolInput.file_path || toolInput.path || "";
  if (/\.(env|pem|key)$/.test(path)) {
    console.log(JSON.stringify({
      decision: "deny",
      reason: `Writing to sensitive file blocked: ${path}`
    }));
    process.exit(0);
  }
}

// Default: allow
console.log(JSON.stringify({ decision: "allow" }));
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
- `{}` or empty = no-op (allow)
- `{ "decision": "allow" }` = explicitly allow
- `{ "decision": "deny", "reason": "..." }` = block with message
- `{ "decision": "ask", "message": "..." }` = prompt operator for confirmation
- `{ "additionalContext": "..." }` = inject text into agent context
- `{ "decision": "block", "reason": "..." }` = block stop (Stop event only)

## Script Templates

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

**PromptSubmit — keyword detection:**
```javascript
import { readFileSync } from "fs";
const input = JSON.parse(readFileSync("/dev/stdin", "utf8"));
const message = input.user_message || input.message || "";

if (/deploy|production|release/i.test(message)) {
  console.log(JSON.stringify({
    additionalContext: "REMINDER: This appears to be a production-related request. Verify all changes are tested before proceeding."
  }));
}
```

**SessionStart — context loading:**
```javascript
import { readFileSync, existsSync } from "fs";
const input = JSON.parse(readFileSync("/dev/stdin", "utf8"));

const contextFile = ".dev/session-context.md";
if (existsSync(contextFile)) {
  const context = readFileSync(contextFile, "utf8");
  console.log(JSON.stringify({
    additionalContext: `Session context loaded:\n${context}`
  }));
}
```

**Stop — end-of-session reminders:**
```javascript
import { readFileSync } from "fs";
import { execSync } from "child_process";

const input = JSON.parse(readFileSync("/dev/stdin", "utf8"));

try {
  const uncommitted = execSync("git diff --name-only HEAD 2>/dev/null", { encoding: "utf8" }).trim();
  if (uncommitted) {
    console.log(JSON.stringify({
      additionalContext: `REMINDER: You have uncommitted changes:\n${uncommitted}`
    }));
  }
} catch { /* not a git repo or no changes */ }
```

## Important

- **All scripts are Node.js ES modules** (`.mjs`). Invoked via `node <script>`. No bash.
- **Stderr must not contain JSON.** Debug logs go to `/tmp/`. Stderr contamination causes platform errors.
- **Stop blocking varies by platform.** Claude/Copilot support `block` decision; Cursor/Windsurf don't.
- **Exit early with `process.exit(0)`** after writing your decision. Don't fall through to default logic.
- **No external dependencies.** Scripts run with Node.js built-ins only — no npm packages.
