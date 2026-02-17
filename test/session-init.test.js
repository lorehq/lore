const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// session-init.js uses __dirname:
//   require('./lib/parse-agents') → hooks/lib/parse-agents.js
//   root = path.join(__dirname, '..') → parent of hooks/
// So temp structure needs: tmp/hooks/session-init.js + tmp/hooks/lib/parse-agents.js
// and all data files under tmp/

function setup(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-session-'));
  const hooksDir = path.join(dir, 'hooks', 'lib');
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, '..', 'hooks', 'session-init.js'),
    path.join(dir, 'hooks', 'session-init.js')
  );
  fs.copyFileSync(
    path.join(__dirname, '..', 'hooks', 'lib', 'parse-agents.js'),
    path.join(hooksDir, 'parse-agents.js')
  );

  // Minimal structure so the hook doesn't error
  fs.mkdirSync(path.join(dir, 'docs', 'work', 'roadmaps'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs', 'work', 'plans'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.claude', 'skills'), { recursive: true });

  if (opts.config) {
    fs.writeFileSync(path.join(dir, '.lore-config'), JSON.stringify(opts.config));
  }
  if (opts.registry) {
    fs.writeFileSync(path.join(dir, 'agent-registry.md'), opts.registry);
  }
  if (opts.docsIndex) {
    fs.writeFileSync(path.join(dir, 'docs', 'index.md'), opts.docsIndex);
  }
  if (opts.memory) {
    fs.writeFileSync(path.join(dir, 'MEMORY.local.md'), opts.memory);
  }

  return dir;
}

function runHook(dir) {
  return execSync(`node "${path.join(dir, 'hooks', 'session-init.js')}"`, {
    cwd: dir,
    encoding: 'utf8',
  });
}

test('shows version from .lore-config', () => {
  const dir = setup({ config: { version: '1.2.3' } });
  const out = runHook(dir);
  assert.ok(out.includes('=== LORE v1.2.3 ==='));
});

test('shows "(none yet)" when no agents', () => {
  const dir = setup();
  const out = runHook(dir);
  assert.ok(out.includes('(none yet)'));
});

test('shows active roadmap title and summary', () => {
  const dir = setup();
  const rmDir = path.join(dir, 'docs', 'work', 'roadmaps', 'my-roadmap');
  fs.mkdirSync(rmDir, { recursive: true });
  fs.writeFileSync(path.join(rmDir, 'index.md'), [
    '---',
    'title: My Roadmap',
    'status: active',
    'summary: Phase 1 in progress',
    '---',
    '# My Roadmap',
  ].join('\n'));
  const out = runHook(dir);
  assert.ok(out.includes('ACTIVE ROADMAPS:'));
  assert.ok(out.includes('My Roadmap (Phase 1 in progress)'));
});

test('shows on-hold label', () => {
  const dir = setup();
  const rmDir = path.join(dir, 'docs', 'work', 'roadmaps', 'paused');
  fs.mkdirSync(rmDir, { recursive: true });
  fs.writeFileSync(path.join(rmDir, 'index.md'), [
    '---',
    'title: Paused Roadmap',
    'status: on-hold',
    '---',
  ].join('\n'));
  const out = runHook(dir);
  assert.ok(out.includes('Paused Roadmap [ON HOLD]'));
});

test('strips YAML frontmatter from docs/index.md', () => {
  const dir = setup({
    docsIndex: '---\ntitle: My Project\nhide: true\n---\n\n# Project Docs\n\nSome content here.',
  });
  const out = runHook(dir);
  assert.ok(out.includes('PROJECT:'));
  assert.ok(out.includes('# Project Docs'));
  assert.ok(out.includes('Some content here.'));
  assert.ok(!out.includes('hide: true'), 'frontmatter should be stripped');
});

test('creates MEMORY.local.md if missing', () => {
  const dir = setup();
  const memPath = path.join(dir, 'MEMORY.local.md');
  assert.ok(!fs.existsSync(memPath), 'should not exist before hook runs');
  runHook(dir);
  assert.ok(fs.existsSync(memPath), 'should be created by hook');
  assert.equal(fs.readFileSync(memPath, 'utf8'), '# Local Memory\n');
});

test('builds knowledge map tree', () => {
  const dir = setup();
  // Create some skill directories
  fs.mkdirSync(path.join(dir, '.claude', 'skills', 'my-skill'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude', 'skills', 'my-skill', 'SKILL.md'), '# Skill');
  const out = runHook(dir);
  assert.ok(out.includes('KNOWLEDGE MAP:'));
  assert.ok(out.includes('.claude/skills/'));
  assert.ok(out.includes('my-skill/'));
});

test('skips archive directories in tree', () => {
  const dir = setup();
  fs.mkdirSync(path.join(dir, 'docs', 'work', 'roadmaps', 'archive', 'old-item'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'work', 'roadmaps', 'archive', 'old-item', 'index.md'), '# Old');
  const out = runHook(dir);
  // archive/ should appear as a node but not be expanded
  assert.ok(!out.includes('old-item'), 'archive contents should not be expanded');
});
