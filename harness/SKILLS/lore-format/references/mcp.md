# Creating MCP Server Declarations

## Location

- Project: `.lore/MCP/<name>.json`
- Global: `~/.config/lore/MCP/<name>.json`

The filename (minus `.json`) becomes the server name.

## Schema

```json
{
  "command": "node",
  "args": ["path/to/server.js", "--port", "3000"],
  "env": {
    "API_KEY": "${API_KEY}"
  }
}
```

| Field | Required | Type | Purpose |
|-------|----------|------|---------|
| `command` | Yes | string | Executable to run |
| `args` | No | string[] | Command arguments |
| `env` | No | object | Environment variables |

## Path Resolution

Relative paths in `args` are resolved to absolute only if the file exists on disk. This prevents resolving non-path strings (like `"--port"`) as paths.

## Merge Behavior

MCP uses three-layer **accumulation** (not last-wins):
- All layers contribute their servers
- Same-named server: higher layer wins (project > global > bundle)
- No per-server policy toggle

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
  "env": { "DATABASE_URL": "${DATABASE_URL}" }
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

## Platform Support

Only Claude Code (`.mcp.json`) and Cursor (`.cursor/mcp.json`) currently project MCP configs.

## Tips

- Never embed secret values — use `${VAR_NAME}` syntax
- Non-JSON files in `MCP/` are ignored (safe to colocate implementations)
- Test manually: `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}' | node server.js`
