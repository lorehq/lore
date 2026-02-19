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

test('buildTree: default shows directories only', (t) => {
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
  assert.ok(!lines.some((l) => l.includes('README.md')), 'should not list files');
  assert.ok(!lines.some((l) => l.includes('index.js')), 'should not list nested files');
});

test('buildTree: dirsOnly=false shows files too', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'README.md'), '');
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', 'index.js'), '');
  const lines = buildTree(dir, '', { dirsOnly: false });
  assert.ok(
    lines.some((l) => l.includes('src/')),
    'should list src/ dir',
  );
  assert.ok(
    lines.some((l) => l.includes('README.md')),
    'should list files',
  );
  assert.ok(
    lines.some((l) => l.includes('index.js')),
    'should list nested files',
  );
});

test('buildTree: dirsOnly=false sorts directories before files', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'aaa.txt'), '');
  fs.mkdirSync(path.join(dir, 'zzz'));
  const lines = buildTree(dir, '', { dirsOnly: false });
  const dirIdx = lines.findIndex((l) => l.includes('zzz/'));
  const fileIdx = lines.findIndex((l) => l.includes('aaa.txt'));
  assert.ok(dirIdx < fileIdx, 'directory should appear before file');
});

test('buildTree: skips dotfiles and dotdirs', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, '.git'));
  fs.mkdirSync(path.join(dir, 'visible'));
  const lines = buildTree(dir);
  assert.ok(!lines.some((l) => l.includes('.git')), 'should skip dotdirs');
  assert.ok(
    lines.some((l) => l.includes('visible/')),
    'should include visible dirs',
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

test('buildTree: skips archive directories by default', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'archive', 'old-plan'), { recursive: true });
  const lines = buildTree(dir);
  assert.ok(!lines.some((l) => l.includes('archive/')), 'archive/ should be skipped');
});

test('buildTree: respects maxDepth', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'a', 'b', 'c'), { recursive: true });
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

test('buildTree: directory-only tree skips empty leaf dirs', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'has-children', 'child'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'only-files'));
  fs.writeFileSync(path.join(dir, 'only-files', 'readme.md'), '');
  const lines = buildTree(dir);
  assert.ok(
    lines.some((l) => l.includes('has-children/')),
    'dir with subdirs should appear',
  );
  // only-files/ has no subdirectories, but it IS a directory so it appears
  assert.ok(
    lines.some((l) => l.includes('only-files/')),
    'dir with only files still appears',
  );
});

test('SKIP_DIRS: contains expected entries', (_t) => {
  for (const d of ['assets', 'stylesheets', 'node_modules', '__pycache__', 'site']) {
    assert.ok(SKIP_DIRS.has(d), `SKIP_DIRS should contain ${d}`);
  }
});
