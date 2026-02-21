const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Integration tests for MCP server profile-conditional tool registration.
// Spawns lore-server.js as a child process, sends JSON-RPC over stdin,
// and asserts on tool listing and tool call responses.

const serverSrc = path.join(__dirname, '..', '.cursor', 'mcp', 'lore-server.js');
const libSrc = path.join(__dirname, '..', '.lore', 'lib');

function setup(opts = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-mcp-')));

  // MCP server imports from path.join(hubDir, 'lib', ...) — copy lib files there
  const libDir = path.join(dir, 'lib');
  fs.mkdirSync(libDir, { recursive: true });
  for (const f of fs.readdirSync(libSrc)) {
    fs.copyFileSync(path.join(libSrc, f), path.join(libDir, f));
  }

  // getConfig reads from <hubDir>/.lore/config.json
  fs.mkdirSync(path.join(dir, '.lore'), { recursive: true });
  if (opts.config) {
    fs.writeFileSync(path.join(dir, '.lore', 'config.json'), JSON.stringify(opts.config));
  }

  // Minimal project structure for loreContext
  fs.mkdirSync(path.join(dir, 'docs', 'work', 'roadmaps'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs', 'work', 'plans'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.lore', 'agents'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });

  return dir;
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// Send a JSON-RPC request to the server process and wait for a response line.
function sendRPC(proc, request) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('RPC timeout')), 5000);
    const handler = (data) => {
      const line = data.toString().trim();
      if (!line) return;
      try {
        const parsed = JSON.parse(line);
        proc.stdout.removeListener('data', handler);
        clearTimeout(timeout);
        resolve(parsed);
      } catch {}
    };
    proc.stdout.on('data', handler);
    proc.stdin.write(JSON.stringify(request) + '\n');
  });
}

// Send a notification (no response expected).
function sendNotification(proc, request) {
  proc.stdin.write(JSON.stringify(request) + '\n');
}

async function startServer(dir) {
  const proc = spawn('node', [serverSrc], {
    cwd: dir,
    env: { ...process.env, LORE_HUB: dir },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Initialize handshake
  await sendRPC(proc, {
    jsonrpc: '2.0',
    id: 0,
    method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test' } },
  });
  sendNotification(proc, { jsonrpc: '2.0', method: 'notifications/initialized' });

  return proc;
}

function stopServer(proc) {
  return new Promise((resolve) => {
    proc.once('exit', resolve);
    proc.stdin.end();
    proc.kill();
  });
}

// ── tools/list ──

test('mcp: minimal profile only exposes lore_context', async () => {
  const dir = setup({ config: { profile: 'minimal' } });
  let proc;
  try {
    proc = await startServer(dir);
    const res = await sendRPC(proc, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const names = res.result.tools.map((t) => t.name);
    assert.deepEqual(names, ['lore_context'], 'minimal should only expose lore_context');
  } finally {
    if (proc) await stopServer(proc);
    cleanup(dir);
  }
});

test('mcp: standard profile exposes all 3 tools', async () => {
  const dir = setup({ config: { profile: 'standard' } });
  let proc;
  try {
    proc = await startServer(dir);
    const res = await sendRPC(proc, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const names = res.result.tools.map((t) => t.name);
    assert.deepEqual(names, ['lore_check_in', 'lore_context', 'lore_write_guard']);
  } finally {
    if (proc) await stopServer(proc);
    cleanup(dir);
  }
});

// ── tools/call edge case: cached tool list calls hidden tool ──

test('mcp: lore_check_in returns graceful response in minimal', async () => {
  const dir = setup({ config: { profile: 'minimal' } });
  let proc;
  try {
    proc = await startServer(dir);
    const res = await sendRPC(proc, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'lore_check_in', arguments: {} },
    });
    const text = res.result.content[0].text;
    assert.ok(text.includes('minimal'), 'should mention minimal profile');
    assert.ok(text.includes('/lore-capture'), 'should suggest /lore-capture');
    assert.equal(res.result.isError, undefined, 'should not be an error');
  } finally {
    if (proc) await stopServer(proc);
    cleanup(dir);
  }
});

test('mcp: lore_context works in minimal profile', async () => {
  const dir = setup({ config: { profile: 'minimal', version: '0.9.0' } });
  let proc;
  try {
    proc = await startServer(dir);
    const res = await sendRPC(proc, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'lore_context', arguments: {} },
    });
    const text = res.result.content[0].text;
    assert.ok(text.includes('Lore v0.9.0'));
  } finally {
    if (proc) await stopServer(proc);
    cleanup(dir);
  }
});
