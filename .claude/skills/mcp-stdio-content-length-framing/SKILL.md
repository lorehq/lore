---
name: mcp-stdio-content-length-framing
description: MCP stdio transport uses Content-Length header framing, not newline-delimited JSON
domain: MCP
user-invocable: false
allowed-tools: Bash, Read, Edit
---

# MCP stdio Content-Length Framing

MCP's stdio transport uses LSP-style `Content-Length` header framing. Each message
(request and response) must be preceded by a header block. Newline-delimited JSON
will cause the client to hang waiting for a properly framed response.

## Format

```
Content-Length: <byte-length>\r\n
\r\n
<JSON body>
```

- `Content-Length` is the **byte length** of the JSON body (use `Buffer.byteLength()`, not `.length`)
- Header and body are separated by `\r\n\r\n` (two CRLFs)
- No trailing newline after the JSON body

## Sending (Node.js)

```javascript
function send(obj) {
  const body = JSON.stringify(obj);
  const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
  process.stdout.write(header + body);
}
```

## Receiving (Node.js)

Parse stdin as a stream buffer — accumulate chunks, scan for `\r\n\r\n` separator,
extract `Content-Length` from the header, wait for the full body, then parse JSON.
Multiple messages can arrive in a single chunk.

## Gotchas

- **Not newline-delimited**: `readline` on stdin will never fire because there are
  no newlines between messages. The client hangs indefinitely.
- **Byte length vs char length**: Multi-byte UTF-8 characters (arrows, em-dashes)
  make `string.length` wrong. Always use `Buffer.byteLength()`.
- **stdout is the channel**: All debug/error logging must go to `stderr` only.
  Any stray `console.log()` corrupts the framing.
- **Notifications have no response**: MCP notifications (no `id` field, e.g.
  `notifications/initialized`) must not produce any output.
