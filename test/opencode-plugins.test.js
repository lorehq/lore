// Tests for OpenCode plugins (.opencode/plugins/).
// Each test creates a temp dir with the plugin files, shared lib, and a
// minimal project structure, then dynamically imports the ESM plugin.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const pluginsSrc = path.join(__dirname, '..', '.opencode', 'plugins');
const libSrc = path.join(__dirname, '..', 'lib');

function setup(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-opencode-'));

  // Shared lib — plugins resolve ../../lib/ via createRequire(import.meta.url)
  const libDir = path.join(dir, 'lib');
  fs.mkdirSync(libDir, { recursive: true });
  for (const f of fs.readdirSync(libSrc)) {
    fs.copyFileSync(path.join(libSrc, f), path.join(libDir, f));
  }

  // Copy plugins with ESM package.json so .js files resolve as modules
  const pluginsDir = path.join(dir, '.opencode', 'plugins');
  fs.mkdirSync(pluginsDir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.opencode', 'package.json'), '{"type":"module"}');
  for (const f of fs.readdirSync(pluginsSrc)) {
    fs.copyFileSync(path.join(pluginsSrc, f), path.join(pluginsDir, f));
  }

  // Minimal project structure
  fs.mkdirSync(path.join(dir, 'docs', 'work', 'roadmaps'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs', 'work', 'plans'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.lore', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.git'));

  if (opts.config) {
    fs.writeFileSync(path.join(dir, '.lore-config'), JSON.stringify(opts.config));
  }
  if (opts.registry) {
    fs.writeFileSync(path.join(dir, 'agent-registry.md'), opts.registry);
  }
  if (opts.agentRules) {
    fs.mkdirSync(path.join(dir, 'docs', 'context'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs', 'context', 'agent-rules.md'), opts.agentRules);
  }
  return dir;
}

function mockClient() {
  const logs = [];
  return {
    logs,
    app: { log: async ({ body }) => logs.push(body) },
  };
}

function pluginUrl(dir, name) {
  return `file://${path.join(dir, '.opencode', 'plugins', name)}`;
}

// ── Session Init ──

test('session-init: shows version in banner', async (t) => {
  const dir = setup({ config: { version: '2.0.0' } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const client = mockClient();
  const { SessionInit } = await import(pluginUrl(dir, 'session-init.js'));
  await SessionInit({ directory: dir, client });
  assert.ok(client.logs[0].message.includes('=== LORE v2.0.0 ==='));
});

test('session-init: shows "(none yet)" when no agents', async (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const client = mockClient();
  const { SessionInit } = await import(pluginUrl(dir, 'session-init.js'));
  await SessionInit({ directory: dir, client });
  assert.ok(client.logs[0].message.includes('(none yet)'));
});

test('session-init: shows agent domains', async (t) => {
  const dir = setup({
    registry: [
      '| Agent | Domain | Description |',
      '|---|---|---|',
      '| `doc-agent` | Documentation | Docs |',
    ].join('\n'),
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const client = mockClient();
  const { SessionInit } = await import(pluginUrl(dir, 'session-init.js'));
  await SessionInit({ directory: dir, client });
  assert.ok(client.logs[0].message.includes('Documentation'));
});

test('session-init: shows active roadmaps', async (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const rmDir = path.join(dir, 'docs', 'work', 'roadmaps', 'test-rm');
  fs.mkdirSync(rmDir, { recursive: true });
  fs.writeFileSync(path.join(rmDir, 'index.md'),
    '---\ntitle: Test RM\nstatus: active\nsummary: Phase 1\n---\n');
  const client = mockClient();
  const { SessionInit } = await import(pluginUrl(dir, 'session-init.js'));
  await SessionInit({ directory: dir, client });
  assert.ok(client.logs[0].message.includes('ACTIVE ROADMAPS:'));
  assert.ok(client.logs[0].message.includes('Test RM (Phase 1)'));
});

test('session-init: injects project context', async (t) => {
  const dir = setup({
    agentRules: '---\ntitle: Rules\n---\n\n# My Project\n\nCustom rules.',
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const client = mockClient();
  const { SessionInit } = await import(pluginUrl(dir, 'session-init.js'));
  await SessionInit({ directory: dir, client });
  assert.ok(client.logs[0].message.includes('PROJECT:'));
  assert.ok(client.logs[0].message.includes('Custom rules.'));
});

test('session-init: creates sticky files', async (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const client = mockClient();
  const { SessionInit } = await import(pluginUrl(dir, 'session-init.js'));
  await SessionInit({ directory: dir, client });
  assert.ok(fs.existsSync(path.join(dir, 'docs', 'knowledge', 'local', 'index.md')));
  assert.ok(fs.existsSync(path.join(dir, 'docs', 'context', 'agent-rules.md')));
  assert.ok(fs.existsSync(path.join(dir, 'MEMORY.local.md')));
});

test('session-init: compaction pushes banner to context', async (t) => {
  const dir = setup({ config: { version: '2.0.0' } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const client = mockClient();
  const { SessionInit } = await import(pluginUrl(dir, 'session-init.js'));
  const hooks = await SessionInit({ directory: dir, client });
  const output = { context: [] };
  await hooks['experimental.session.compacting']({}, output);
  assert.ok(output.context[0].includes('=== LORE v2.0.0 ==='));
});

test('session-init: session.created re-emits banner', async (t) => {
  const dir = setup({ config: { version: '2.0.0' } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const client = mockClient();
  const { SessionInit } = await import(pluginUrl(dir, 'session-init.js'));
  const hooks = await SessionInit({ directory: dir, client });
  client.logs.length = 0;
  await hooks['session.created']();
  assert.equal(client.logs.length, 1);
  assert.ok(client.logs[0].message.includes('=== LORE v2.0.0 ==='));
});

// ── Knowledge Tracker ──

test('knowledge-tracker: silent on read-only tools', async (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const client = mockClient();
  const { KnowledgeTracker } = await import(pluginUrl(dir, 'knowledge-tracker.js'));
  const hooks = await KnowledgeTracker({ directory: dir, client });
  for (const tool of ['Read', 'Grep', 'Glob']) {
    await hooks['tool.execute.after']({ tool });
  }
  assert.equal(client.logs.length, 0, 'no logs for read-only tools');
});

test('knowledge-tracker: gentle reminder on first bash', async (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const client = mockClient();
  const { KnowledgeTracker } = await import(pluginUrl(dir, 'knowledge-tracker.js'));
  const hooks = await KnowledgeTracker({ directory: dir, client });
  await hooks['tool.execute.after']({ tool: 'Bash' });
  assert.equal(client.logs[0].level, 'info');
  assert.ok(client.logs[0].message.includes('Gotcha?'));
});

test('knowledge-tracker: escalates at 3 consecutive bash', async (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const client = mockClient();
  const { KnowledgeTracker } = await import(pluginUrl(dir, 'knowledge-tracker.js'));
  const hooks = await KnowledgeTracker({ directory: dir, client });
  await hooks['tool.execute.after']({ tool: 'Bash' });
  await hooks['tool.execute.after']({ tool: 'Bash' });
  await hooks['tool.execute.after']({ tool: 'Bash' });
  assert.ok(client.logs.at(-1).message.includes('3 commands in a row'));
  assert.equal(client.logs.at(-1).level, 'warn');
});

test('knowledge-tracker: strong warning at 5 consecutive bash', async (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const client = mockClient();
  const { KnowledgeTracker } = await import(pluginUrl(dir, 'knowledge-tracker.js'));
  const hooks = await KnowledgeTracker({ directory: dir, client });
  for (let i = 0; i < 5; i++) {
    await hooks['tool.execute.after']({ tool: 'Bash' });
  }
  assert.ok(client.logs.at(-1).message.includes('5 consecutive commands'));
  assert.equal(client.logs.at(-1).level, 'warn');
});

test('knowledge-tracker: resets counter on knowledge capture', async (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const client = mockClient();
  const { KnowledgeTracker } = await import(pluginUrl(dir, 'knowledge-tracker.js'));
  const hooks = await KnowledgeTracker({ directory: dir, client });
  await hooks['tool.execute.after']({ tool: 'Bash' });
  await hooks['tool.execute.after']({ tool: 'Bash' });
  // Knowledge capture resets
  await hooks['tool.execute.after']({ tool: 'Write', args: { file_path: '/proj/docs/foo.md' } });
  client.logs.length = 0;
  // Next bash should be count=1 (gentle, not "in a row")
  await hooks['tool.execute.after']({ tool: 'Bash' });
  assert.ok(!client.logs[0].message.includes('in a row'));
});

test('knowledge-tracker: MEMORY.local.md scratch notes warning', async (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const client = mockClient();
  const { KnowledgeTracker } = await import(pluginUrl(dir, 'knowledge-tracker.js'));
  const hooks = await KnowledgeTracker({ directory: dir, client });
  await hooks['tool.execute.after']({ tool: 'Write', args: { file_path: '/proj/MEMORY.local.md' } });
  assert.ok(client.logs.at(-1).message.includes('scratch notes'));
});

test('knowledge-tracker: error pattern message on bash failure', async (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const client = mockClient();
  const { KnowledgeTracker } = await import(pluginUrl(dir, 'knowledge-tracker.js'));
  const hooks = await KnowledgeTracker({ directory: dir, client });
  await hooks['tool.execute.after']({ tool: 'Bash', error: 'command failed' });
  assert.ok(client.logs[0].message.includes('Error pattern'));
});

test('knowledge-tracker: respects custom thresholds from .lore-config', async (t) => {
  const dir = setup({ config: { version: '1.0.0', nudgeThreshold: 2, warnThreshold: 4 } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const client = mockClient();
  const { KnowledgeTracker } = await import(pluginUrl(dir, 'knowledge-tracker.js'));
  const hooks = await KnowledgeTracker({ directory: dir, client });
  // 2nd bash should now nudge (custom threshold)
  await hooks['tool.execute.after']({ tool: 'Bash' });
  await hooks['tool.execute.after']({ tool: 'Bash' });
  assert.ok(client.logs.at(-1).message.includes('2 commands in a row'));
});

// ── Protect Memory ──

test('protect-memory: blocks writes to MEMORY.md at project root', async (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { ProtectMemory } = await import(pluginUrl(dir, 'protect-memory.js'));
  const hooks = await ProtectMemory({ directory: dir });
  await assert.rejects(
    () => hooks['tool.execute.before'](
      { tool: 'Write' },
      { args: { file_path: path.join(dir, 'MEMORY.md') } }
    ),
    /MEMORY\.local\.md/
  );
});

test('protect-memory: blocks reads to MEMORY.md at project root', async (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { ProtectMemory } = await import(pluginUrl(dir, 'protect-memory.js'));
  const hooks = await ProtectMemory({ directory: dir });
  await assert.rejects(
    () => hooks['tool.execute.before'](
      { tool: 'Read' },
      { args: { file_path: path.join(dir, 'MEMORY.md') } }
    ),
    /MEMORY\.local\.md/
  );
});

test('protect-memory: read error mentions MEMORY.local.md', async (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { ProtectMemory } = await import(pluginUrl(dir, 'protect-memory.js'));
  const hooks = await ProtectMemory({ directory: dir });
  await assert.rejects(
    () => hooks['tool.execute.before'](
      { tool: 'Read' },
      { args: { file_path: path.join(dir, 'MEMORY.md') } }
    ),
    { message: /Read that file instead/ }
  );
});

test('protect-memory: write error shows routing table', async (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { ProtectMemory } = await import(pluginUrl(dir, 'protect-memory.js'));
  const hooks = await ProtectMemory({ directory: dir });
  await assert.rejects(
    () => hooks['tool.execute.before'](
      { tool: 'Edit' },
      { args: { file_path: path.join(dir, 'MEMORY.md') } }
    ),
    { message: /create-skill/ }
  );
});

test('protect-memory: allows MEMORY.local.md', async (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { ProtectMemory } = await import(pluginUrl(dir, 'protect-memory.js'));
  const hooks = await ProtectMemory({ directory: dir });
  await hooks['tool.execute.before'](
    { tool: 'Write' },
    { args: { file_path: path.join(dir, 'MEMORY.local.md') } }
  );
});

test('protect-memory: allows nested MEMORY.md', async (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { ProtectMemory } = await import(pluginUrl(dir, 'protect-memory.js'));
  const hooks = await ProtectMemory({ directory: dir });
  await hooks['tool.execute.before'](
    { tool: 'Write' },
    { args: { file_path: path.join(dir, 'subdir', 'MEMORY.md') } }
  );
});

// ── Context Path Guide ──

test('context-path-guide: logs tree for docs/knowledge/ writes', async (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'docs', 'knowledge', 'environment'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'knowledge', 'environment', 'test.md'), '# Test');
  const client = mockClient();
  const { ContextPathGuide } = await import(pluginUrl(dir, 'context-path-guide.js'));
  const hooks = await ContextPathGuide({ directory: dir, client });
  await hooks['tool.execute.before'](
    { tool: 'Write' },
    { args: { file_path: path.join(dir, 'docs', 'knowledge', 'environment', 'new.md') } }
  );
  assert.equal(client.logs.length, 1);
  assert.ok(client.logs[0].message.includes('docs/knowledge/'));
  assert.ok(client.logs[0].message.includes('environment/'));
});

test('context-path-guide: logs tree for docs/context/ writes', async (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'docs', 'context'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'context', 'agent-rules.md'), '# Rules');
  const client = mockClient();
  const { ContextPathGuide } = await import(pluginUrl(dir, 'context-path-guide.js'));
  const hooks = await ContextPathGuide({ directory: dir, client });
  await hooks['tool.execute.before'](
    { tool: 'Write' },
    { args: { file_path: path.join(dir, 'docs', 'context', 'test.md') } }
  );
  assert.equal(client.logs.length, 1);
  assert.ok(client.logs[0].message.includes('docs/context/'));
  assert.ok(client.logs[0].message.includes('environment data goes in docs/knowledge/'));
});

test('context-path-guide: silent for non-docs writes', async (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const client = mockClient();
  const { ContextPathGuide } = await import(pluginUrl(dir, 'context-path-guide.js'));
  const hooks = await ContextPathGuide({ directory: dir, client });
  await hooks['tool.execute.before'](
    { tool: 'Write' },
    { args: { file_path: path.join(dir, 'src', 'main.js') } }
  );
  assert.equal(client.logs.length, 0);
});

test('context-path-guide: silent for read tools', async (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const client = mockClient();
  const { ContextPathGuide } = await import(pluginUrl(dir, 'context-path-guide.js'));
  const hooks = await ContextPathGuide({ directory: dir, client });
  await hooks['tool.execute.before'](
    { tool: 'Read' },
    { args: { file_path: path.join(dir, 'docs', 'knowledge', 'test.md') } }
  );
  assert.equal(client.logs.length, 0);
});

test('protect-memory: ignores non-file tools', async (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { ProtectMemory } = await import(pluginUrl(dir, 'protect-memory.js'));
  const hooks = await ProtectMemory({ directory: dir });
  await hooks['tool.execute.before'](
    { tool: 'Bash' },
    { args: { command: 'cat MEMORY.md' } }
  );
});
