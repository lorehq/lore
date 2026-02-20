---
name: mcp-stdio-content-length-framing
description: Cursor MCP uses newline-delimited JSON over stdio, not Content-Length framing
user-invocable: false
allowed-tools: Bash, Read, Edit
---

# MCP stdio Transport — Cursor

Cursor's MCP client uses **newline-delimited JSON** over stdio, not LSP-style
Content-Length header framing. The MCP spec and SDK documentation describe
Content-Length framing, but Cursor's actual implementation sends one JSON
message per line terminated by `\n`.

## Correct Transport (Node.js)

```javascript
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
  const req = JSON.parse(line);
  const res = handleRequest(req);
  if (res) process.stdout.write(JSON.stringify(res) + '\n');
});
```

## Gotchas

- **Not Content-Length framed**: Despite the MCP spec describing LSP-style
  `Content-Length: N\r\n\r\n{...}` framing, Cursor sends plain `{...}\n`.
  A Content-Length parser will buffer forever waiting for `\r\n\r\n`.
- **Protocol version**: Cursor sends `protocolVersion: "2025-11-25"`. Echo the
  client's version back — hardcoding an older version may cause rejection.
- **stdout is the channel**: All debug/error logging must go to `stderr` only.
  Any stray `console.log()` corrupts the transport.
- **Notifications have no response**: MCP notifications (no `id` field, e.g.
  `notifications/initialized`) must not produce any output.
- **Disabled state persists**: If the MCP server fails on first connect, Cursor
  marks it "Disabled" and won't retry until the user re-enables it in
  Settings > Tools & MCP. A full Cursor restart may also be needed.
