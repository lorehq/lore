const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { ensureStickyFiles } = require('../.lore/harness/lib/sticky');

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-sticky-'));
  const tplSrc = path.join(__dirname, '..', '.lore', 'harness', 'templates');
  const tplDst = path.join(dir, '.lore', 'harness', 'templates');
  // Recursively copy templates (includes seeds/ subdirectory)
  fs.cpSync(tplSrc, tplDst, { recursive: true });
  return dir;
}

test('ensureStickyFiles: creates MEMORY.local.md from scratch', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  ensureStickyFiles(dir);
  assert.ok(fs.existsSync(path.join(dir, '.lore', 'memory.local.md')));
  const content = fs.readFileSync(path.join(dir, '.lore', 'memory.local.md'), 'utf8');
  assert.ok(content.startsWith('# Local Memory'));
});

test('ensureStickyFiles: does not overwrite existing MEMORY.local.md', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, '.lore'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.lore', 'memory.local.md'), '# My Notes');
  ensureStickyFiles(dir);
  assert.equal(fs.readFileSync(path.join(dir, '.lore', 'memory.local.md'), 'utf8'), '# My Notes');
});

test('ensureStickyFiles: seeds runbooks when directory exists', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, '.lore', 'runbooks'), { recursive: true });
  ensureStickyFiles(dir);
  assert.ok(fs.existsSync(path.join(dir, '.lore', 'runbooks', 'docs-code-alignment-sweep.md')));
  assert.ok(fs.existsSync(path.join(dir, '.lore', 'runbooks', 'first-session', 'knowledge-worker.md')));
});

test('ensureStickyFiles: does not create rules directory', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  ensureStickyFiles(dir);
  assert.ok(!fs.existsSync(path.join(dir, '.lore', 'rules')), 'rules dir should not be created by sticky files');
});
