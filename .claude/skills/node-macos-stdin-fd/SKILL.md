---
name: node-macos-stdin-fd
trigger: subprocess stdin delivery in Node.js tests
category: testing
---

# Node.js macOS stdin: use file descriptor, not pipe

`fs.readFileSync(0, 'utf8')` is unreliable on macOS when stdin is delivered via:

- Shell pipe: `echo '...' | node script.js`
- `execSync` with `input` option
- `spawnSync` with `input` option

All three methods work on Linux but intermittently return empty string on macOS.

## Fix

Write stdin data to a temp file, open it as a file descriptor, and pass via `stdio` array:

```javascript
const inputFile = path.join(cwd, '.test-stdin.json');
fs.writeFileSync(inputFile, JSON.stringify(data));
const fd = fs.openSync(inputFile, 'r');
try {
  const result = spawnSync('node', [script], {
    stdio: [fd, 'pipe', 'pipe'],
    cwd,
    encoding: 'utf8',
    timeout: 5000,
  });
  return result;
} finally {
  fs.closeSync(fd);
  fs.unlinkSync(inputFile);
}
```

## Why

macOS has different pipe buffering behavior than Linux. When Node.js synchronously reads fd 0 at process startup, the pipe may not be ready yet. A file descriptor backed by an actual file is always immediately readable.

## Applies to

Any Node.js test that spawns a subprocess and needs to deliver JSON via stdin, especially in CI with macOS runners.
