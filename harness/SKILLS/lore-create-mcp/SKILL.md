---
name: lore-create-mcp
description: Create a new MCP server declaration for use with Lore
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---

# Create MCP Server Declaration

Create a properly formatted MCP server JSON declaration.

## Workflow

1. **Ask the operator:**
   - What MCP server do they want to add? (name, purpose)
   - What command runs it? (e.g., `node`, `npx`, `python`)
   - What arguments does it need?
   - Any environment variables?
   - Where? (project `.lore/MCP/`, or global `~/.config/lore/MCP/`)

2. **Choose a name:**
   - The filename (minus `.json`) becomes the server name
   - Kebab-case: `my-server.json` → server name `my-server`

3. **Write the declaration:**
   ```json
   {
     "command": "node",
     "args": ["path/to/server.js", "--port", "3000"],
     "env": {
       "API_KEY": "${API_KEY}"
     }
   }
   ```

4. **Write to the correct path:**
   - Project: `.lore/MCP/<name>.json`
   - Global: `~/.config/lore/MCP/<name>.json`

5. **Regenerate:** Run `lore generate` to project the MCP config.

6. **Verify:** Check that the server appears in:
   - Claude: `.mcp.json` under `mcpServers.<name>`
   - Cursor: `.cursor/mcp.json` under `mcpServers.<name>`

## Schema Reference

| Field | Required | Type | Purpose |
|-------|----------|------|---------|
| `command` | Yes | string | Executable to run |
| `args` | No | string[] | Command arguments |
| `env` | No | object | Environment variables |

## Path Resolution

- Relative paths in `args` are resolved to absolute only if the file exists on disk
- This prevents resolving non-path strings (like `"--port"`) as paths
- Use relative paths when the server script lives alongside the declaration

## Merge Behavior

MCP servers use three-layer **accumulation** (not last-wins):
- All layers contribute their servers
- Same-named server: higher layer wins (project > global > bundle)
- No per-server policy toggle — servers always accumulate

## Common Patterns

**npx-based server:**
```json
{
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
}
```

**Python server:**
```json
{
  "command": "python",
  "args": ["-m", "my_mcp_server"],
  "env": {
    "DATABASE_URL": "${DATABASE_URL}"
  }
}
```

**Local script alongside declaration:**
```json
{
  "command": "node",
  "args": ["my-server.js"]
}
```
Place `my-server.js` in the same `MCP/` directory. Non-JSON files are ignored by the scanner.

## Notes

- Only Claude Code and Cursor currently support MCP projection
- Environment variables use `${VAR_NAME}` syntax — never embed actual secret values
- Non-JSON files in `MCP/` directories are ignored (safe to colocate implementations)
