const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const scriptPath = path.join(__dirname, '..', '.lore', 'scripts', 'ensure-structure.sh');
const tplSrc = path.join(__dirname, '..', '.lore', 'templates', 'orphan-index.md');

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-structure-'));
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  // Copy orphan template
  const tplDir = path.join(dir, '.lore', 'templates');
  fs.mkdirSync(tplDir, { recursive: true });
  fs.copyFileSync(tplSrc, path.join(tplDir, 'orphan-index.md'));
  // Copy script
  const scriptDir = path.join(dir, '.lore', 'scripts');
  fs.mkdirSync(scriptDir, { recursive: true });
  fs.copyFileSync(scriptPath, path.join(scriptDir, 'ensure-structure.sh'));
  return dir;
}

function runScript(dir) {
  return execSync(`bash "${path.join(dir, '.lore', 'scripts', 'ensure-structure.sh')}"`, {
    cwd: dir,
    encoding: 'utf8',
  });
}

test('creates index.md from orphan template when dir has no index', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const sub = path.join(dir, 'docs', 'knowledge');
  fs.mkdirSync(sub, { recursive: true });

  runScript(dir);
  const index = path.join(sub, 'index.md');
  assert.ok(fs.existsSync(index));
  const content = fs.readFileSync(index, 'utf8');
  assert.ok(content.includes('Knowledge'));
  assert.ok(content.includes('## Purpose'), 'should use orphan template');
});

test('does not overwrite existing index.md (idempotent)', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const sub = path.join(dir, 'docs', 'context');
  fs.mkdirSync(sub, { recursive: true });
  fs.writeFileSync(path.join(sub, 'index.md'), '# My Custom Index\n');

  runScript(dir);
  const content = fs.readFileSync(path.join(sub, 'index.md'), 'utf8');
  assert.equal(content, '# My Custom Index\n');
});

test('falls back to heading when template missing', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Remove the template
  fs.unlinkSync(path.join(dir, '.lore', 'templates', 'orphan-index.md'));
  const sub = path.join(dir, 'docs', 'guides');
  fs.mkdirSync(sub, { recursive: true });

  runScript(dir);
  const content = fs.readFileSync(path.join(sub, 'index.md'), 'utf8');
  assert.equal(content, '# Guides\n');
});

test('skips hidden directories', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const hidden = path.join(dir, 'docs', '.hidden');
  fs.mkdirSync(hidden, { recursive: true });

  runScript(dir);
  assert.ok(!fs.existsSync(path.join(hidden, 'index.md')));
});

test('handles nested directories', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const nested = path.join(dir, 'docs', 'knowledge', 'environment');
  fs.mkdirSync(nested, { recursive: true });

  runScript(dir);
  assert.ok(fs.existsSync(path.join(dir, 'docs', 'knowledge', 'index.md')));
  assert.ok(fs.existsSync(path.join(nested, 'index.md')));
});

test('no-op when docs/ does not exist', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-structure-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Copy script but no docs/
  const scriptDir = path.join(dir, '.lore', 'scripts');
  fs.mkdirSync(scriptDir, { recursive: true });
  fs.copyFileSync(scriptPath, path.join(scriptDir, 'ensure-structure.sh'));

  // Should exit 0 without error
  const result = execSync(`bash "${path.join(scriptDir, 'ensure-structure.sh')}"`, {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.equal(typeof result, 'string');
});
