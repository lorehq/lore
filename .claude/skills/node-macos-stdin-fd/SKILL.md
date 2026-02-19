---
name: node-macos-stdin-fd
description: macOS pitfalls for Node.js subprocess stdin delivery and tmp dir symlinks
trigger: subprocess stdin or state file issues on macOS in Node.js tests
category: testing
domain: Orchestrator
---

# Node.js macOS test pitfalls: stdin, cwd symlinks, and spawnSync

## 1. stdin via `fs.readFileSync(0)` is flaky on macOS

Shell pipes (`echo '...' | node`) intermittently return empty string on macOS.

**Fix:** Use `execSync` with the `input` option — this works reliably:

```javascript
const raw = execSync(`node "${hookFile}"`, {
  cwd: dir,
  input: JSON.stringify(stdinData),
  encoding: 'utf8',
});
```

**Avoid:** `spawnSync` with `stdio: [fd, 'pipe', 'pipe']` — causes additional regressions.

## 2. spawnSync cwd resolves symlinks — hash mismatch

macOS `os.tmpdir()` returns `/var/folders/...` but `process.cwd()` inside `spawnSync` children returns `/private/var/folders/...` (resolved symlink). If hooks hash `process.cwd()` for state file paths, the test's hash (from unresolved path) won't match.

**Fix:** Use `fs.realpathSync(dir)` when computing hashes in test helpers:

```javascript
function getStateFile(dir) {
  const realDir = fs.realpathSync(dir);
  const hash = crypto.createHash('md5').update(realDir).digest('hex').slice(0, 8);
  return path.join(dir, '.git', `lore-tracker-${hash}.json`);
}
```

## 3. Prefer execSync over spawnSync for hook tests

`execSync` with `input` matches the pattern used by working Claude hooks tests. `spawnSync` introduces macOS-specific regressions even for hooks that don't read stdin.

## Applies to

Node.js tests spawning subprocesses on macOS, especially with temp directories and stdin delivery. Critical for CI with macOS runners.
