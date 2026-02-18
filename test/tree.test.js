const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { buildTree, SKIP_DIRS } = require('../lib/tree');

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-tree-'));
  return dir;
}

test('buildTree: empty directory returns empty array', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.deepStrictEqual(buildTree(dir), []);
});

test('buildTree: lists files and directories', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'README.md'), '');
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', 'index.js'), '');
  const lines = buildTree(dir);
  assert.ok(
    lines.some((l) => l.includes('src/')),
    'should list src/ dir',
  );
  assert.ok(
    lines.some((l) => l.includes('README.md')),
    'should list README.md',
  );
  assert.ok(
    lines.some((l) => l.includes('index.js')),
    'should list nested file',
  );
});

test('buildTree: directories sort before files', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'aaa.txt'), '');
  fs.mkdirSync(path.join(dir, 'zzz'));
  const lines = buildTree(dir);
  const dirIdx = lines.findIndex((l) => l.includes('zzz/'));
  const fileIdx = lines.findIndex((l) => l.includes('aaa.txt'));
  assert.ok(dirIdx < fileIdx, 'directory should appear before file');
});

test('buildTree: skips dotfiles', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, '.hidden'), '');
  fs.mkdirSync(path.join(dir, '.git'));
  fs.writeFileSync(path.join(dir, 'visible.md'), '');
  const lines = buildTree(dir);
  assert.ok(!lines.some((l) => l.includes('.hidden')), 'should skip dotfiles');
  assert.ok(!lines.some((l) => l.includes('.git')), 'should skip dotdirs');
  assert.ok(
    lines.some((l) => l.includes('visible.md')),
    'should include visible files',
  );
});

test('buildTree: skips SKIP_DIRS entries', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'node_modules'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.mkdirSync(path.join(dir, 'real'));
  const lines = buildTree(dir);
  assert.ok(!lines.some((l) => l.includes('node_modules')), 'should skip node_modules');
  assert.ok(!lines.some((l) => l.includes('assets')), 'should skip assets');
  assert.ok(
    lines.some((l) => l.includes('real/')),
    'should include non-skipped dirs',
  );
});

test('buildTree: archive/ appears but is not expanded', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'archive'));
  fs.writeFileSync(path.join(dir, 'archive', 'old.md'), '');
  const lines = buildTree(dir);
  assert.ok(
    lines.some((l) => l.includes('archive/')),
    'archive/ should appear',
  );
  assert.ok(!lines.some((l) => l.includes('old.md')), 'archive contents should not appear');
});

test('buildTree: archive/ expanded when skipArchive=false', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'archive'));
  fs.writeFileSync(path.join(dir, 'archive', 'old.md'), '');
  const lines = buildTree(dir, '', { skipArchive: false });
  assert.ok(
    lines.some((l) => l.includes('old.md')),
    'archive contents should appear',
  );
});

test('buildTree: respects maxDepth', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'a', 'b', 'c'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'a', 'b', 'c', 'deep.md'), '');
  const lines = buildTree(dir, '', { maxDepth: 2 });
  assert.ok(
    lines.some((l) => l.includes('b/')),
    'depth 2 dir should appear',
  );
  assert.ok(!lines.some((l) => l.includes('c/')), 'depth 3 dir should not appear');
});

test('buildTree: nonexistent directory returns empty array', (_t) => {
  const lines = buildTree('/tmp/lore-nonexistent-' + Date.now());
  assert.deepStrictEqual(lines, []);
});

test('SKIP_DIRS: contains expected entries', (_t) => {
  for (const d of ['assets', 'stylesheets', 'node_modules', '__pycache__', 'site']) {
    assert.ok(SKIP_DIRS.has(d), `SKIP_DIRS should contain ${d}`);
  }
});
