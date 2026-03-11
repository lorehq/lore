# MCP Resolution — Deep Reference

## Overview

MCP (Model Context Protocol) servers extend agent capabilities with external tools.
Lore manages MCP server declarations as JSON files in `MCP/` directories, merging
them across layers and projecting platform-native config files.

## Declaration Format

Each MCP server is a single JSON file in an `MCP/` directory:

```json
{
  "command": "node",
  "args": ["server.js", "--port", "3000"],
  "env": {
    "API_KEY": "${API_KEY}"
  }
}
```

- Filename (minus `.json`) = server name (e.g., `lore-server.json` → `lore-server`)
- `command` — required, the executable to run
- `args` — optional, command arguments
- `env` — optional, environment variables

## Directory Scanning (`readMCPDir`)

`readMCPDir(dir)` scans a directory for `*.json` files. For each file:
1. Reads and parses JSON
2. Skips files without a `command` field
3. Resolves relative args: if an arg is not absolute and doesn't start with `-`,
   checks if the file exists relative to the JSON file's directory. Only resolves
   to absolute path if the file actually exists on disk.
4. Returns `MCPServer{Name, Command, Args, Env}`

**Important:** Non-JSON files in the `MCP/` directory are ignored. This allows
bundles to colocate server implementations (e.g., `.js` files) alongside their
declarations without interfering with scanning.

## Three-Layer Merge

MCP merges independently from rules/skills/agents:

```
Layer 1: Bundle MCP/*.json     (lowest — all enabled bundles, priority order)
Layer 2: Global MCP/*.json     (~/.config/lore/MCP/)
Layer 3: Project MCP/*.json    (.lore/MCP/ — highest)
```

Override by server name at each layer. If bundle and project both declare
`lore-server.json`, the project version wins.

**Note:** The harness layer does NOT participate in MCP merge.

### Bundle MCP (`readBundleMCP`)

Iterates all active bundle directories in priority order. Later bundles override
earlier ones for same-named servers. Uses `activeBundleDirs()` which reads
`.lore/config.json` `"bundles"` array.

## Platform Projection

MCP config is written to platform-specific locations:

| Platform | Config file | Format |
|----------|------------|--------|
| Claude | `.mcp.json` | `{"mcpServers": {"name": {"command": ..., "args": ..., "env": ...}}}` |
| Cursor | `.cursor/mcp.json` | Same format |
| Others | Varies | Platform-dependent |

The `writeMCPConfig(path, servers)` function generates the config file from the
merged server list. Each server entry includes `command`, `args`, and optionally `env`.

## Bundle MCP Implementation

Bundles store MCP server declarations AND implementations in the same `MCP/` directory:

```
~/.lore-os/MCP/
  lore-server.json     # Declaration (scanned by readMCPDir)
  lore-server.js       # Implementation (ignored by scanner, used by command)
```

The declaration's `args` typically reference the implementation file with a relative
path. The scanner resolves this to an absolute path during scanning.

Example declaration (`lore-server.json`):
```json
{
  "command": "node",
  "args": ["lore-server.js"]
}
```

After resolution, `args[0]` becomes `/home/user/.lore-os/MCP/lore-server.js`.

## Troubleshooting

**Server not appearing in generated config:**
- Check that the JSON file is valid (use `jq . < file.json`)
- Verify `command` field is present and non-empty
- Check the MCP directory path is correct for the layer
- For bundles: verify the bundle is enabled in `.lore/config.json`

**Server not connecting:**
1. Check `.mcp.json` exists (run `lore generate`)
2. Verify the command exists: `which <command>`
3. Verify args point to existing files (check resolved paths)
4. Test manually:
   ```bash
   echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}' | <command> <args>
   ```
5. Check env vars are set in the shell

**Relative path not resolving:**
- Only resolves if `filepath.IsAbs(arg)` is false AND `!strings.HasPrefix(arg, "-")`
- AND `os.Stat(filepath.Join(dir, arg))` succeeds
- If the target file doesn't exist on disk, the arg is kept as-is
- This prevents resolving non-path strings (like echo messages) to file paths

**Wrong server version used:**
- Check layer priority: Project > Global > Bundle
- Use `lore generate` with verbose output to see which layer each server comes from
- Server name (filename) determines override — rename to avoid collisions
