const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const PROJECTOR = path.resolve(__dirname, '../.lore/harness/lib/projector.js');

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-projector-'));
  // Minimal harness structure needed by projector
  const lore = path.join(dir, '.lore');
  fs.mkdirSync(path.join(lore, 'harness', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(lore, 'harness', 'templates'), { recursive: true });
  fs.mkdirSync(path.join(lore, 'rules'), { recursive: true });

  // Copy harness lib files the projector needs
  const libSrc = path.resolve(__dirname, '../.lore/harness/lib');
  for (const f of fs.readdirSync(libSrc)) {
    fs.cpSync(path.join(libSrc, f), path.join(lore, 'harness', 'lib', f), { recursive: true });
  }

  // Minimal instructions.md
  fs.writeFileSync(path.join(lore, 'instructions.md'), '# Test Instructions\n');

  return dir;
}

function writeConfig(dir, config) {
  fs.writeFileSync(path.join(dir, '.lore', 'config.json'), JSON.stringify(config));
}

function runProjector(dir) {
  // Use a fake HOME so global config doesn't interfere
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'lore-fake-home-'));
  fs.mkdirSync(path.join(fakeHome, '.lore'), { recursive: true });
  fs.writeFileSync(path.join(fakeHome, '.lore', 'config.json'), '{}');
  execFileSync('node', [PROJECTOR, dir], {
    env: { ...process.env, HOME: fakeHome },
    stdio: 'pipe',
  });
  fs.rmSync(fakeHome, { recursive: true, force: true });
}

test('projector: all platforms projected when config has no platforms field', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  writeConfig(dir, { version: '1.0.0' });

  runProjector(dir);

  // mandate files
  assert.ok(fs.existsSync(path.join(dir, 'CLAUDE.md')), 'CLAUDE.md exists');
  assert.ok(fs.existsSync(path.join(dir, 'GEMINI.md')), 'GEMINI.md exists');
  assert.ok(fs.existsSync(path.join(dir, '.windsurfrules')), '.windsurfrules exists');
  assert.ok(fs.existsSync(path.join(dir, '.clinerules')), '.clinerules exists');
  // cursor mdc
  assert.ok(fs.existsSync(path.join(dir, '.cursor', 'rules', 'lore-core.mdc')), 'lore-core.mdc exists');
});

test('projector: only selected platform projected when config specifies one', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  writeConfig(dir, { platforms: ['claude'] });

  runProjector(dir);

  assert.ok(fs.existsSync(path.join(dir, 'CLAUDE.md')), 'CLAUDE.md exists');
  assert.ok(!fs.existsSync(path.join(dir, 'GEMINI.md')), 'GEMINI.md should not exist');
  assert.ok(!fs.existsSync(path.join(dir, '.windsurfrules')), '.windsurfrules should not exist');
  assert.ok(!fs.existsSync(path.join(dir, '.clinerules')), '.clinerules should not exist');
  assert.ok(!fs.existsSync(path.join(dir, '.cursor', 'rules', 'lore-core.mdc')), 'lore-core.mdc should not exist');
});

test('projector: cleanup removes files for disabled platform', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  // First project with claude + gemini
  writeConfig(dir, { platforms: ['claude', 'gemini'] });
  runProjector(dir);
  assert.ok(fs.existsSync(path.join(dir, 'CLAUDE.md')), 'CLAUDE.md exists after first run');
  assert.ok(fs.existsSync(path.join(dir, 'GEMINI.md')), 'GEMINI.md exists after first run');

  // Remove gemini from config, re-project
  writeConfig(dir, { platforms: ['claude'] });
  runProjector(dir);
  assert.ok(fs.existsSync(path.join(dir, 'CLAUDE.md')), 'CLAUDE.md still exists');
  assert.ok(!fs.existsSync(path.join(dir, 'GEMINI.md')), 'GEMINI.md deleted');
});

test('projector: cursor mdc file removed when cursor disabled', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  // First project with cursor
  writeConfig(dir, { platforms: ['cursor'] });
  runProjector(dir);
  assert.ok(fs.existsSync(path.join(dir, '.cursor', 'rules', 'lore-core.mdc')), 'mdc exists');

  // Disable cursor
  writeConfig(dir, { platforms: ['claude'] });
  runProjector(dir);
  assert.ok(!fs.existsSync(path.join(dir, '.cursor', 'rules', 'lore-core.mdc')), 'mdc removed');
});

test('projector: empty parent dirs cleaned up', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  // Project cursor (creates .cursor/rules/lore-core.mdc)
  writeConfig(dir, { platforms: ['cursor'] });
  runProjector(dir);
  assert.ok(fs.existsSync(path.join(dir, '.cursor', 'rules')), '.cursor/rules exists');

  // Disable cursor
  writeConfig(dir, { platforms: ['claude'] });
  runProjector(dir);
  // .cursor/rules/ and .cursor/ should be cleaned up if empty
  assert.ok(!fs.existsSync(path.join(dir, '.cursor', 'rules')), '.cursor/rules removed');
  assert.ok(!fs.existsSync(path.join(dir, '.cursor')), '.cursor removed');
});
