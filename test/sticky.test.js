const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { ensureStickyFiles } = require('../.lore/lib/sticky');

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-sticky-'));
  const tplSrc = path.join(__dirname, '..', '.lore', 'templates');
  const tplDst = path.join(dir, '.lore', 'templates');
  fs.mkdirSync(tplDst, { recursive: true });
  for (const f of fs.readdirSync(tplSrc)) {
    fs.copyFileSync(path.join(tplSrc, f), path.join(tplDst, f));
  }
  return dir;
}

test('ensureStickyFiles: creates all sticky files from scratch', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  ensureStickyFiles(dir);
  assert.ok(fs.existsSync(path.join(dir, 'docs', 'knowledge', 'local', 'index.md')));
  assert.ok(fs.existsSync(path.join(dir, 'docs', 'context', 'agent-rules.md')));
  assert.ok(fs.existsSync(path.join(dir, 'docs', 'context', 'conventions', 'index.md')));
  assert.ok(fs.existsSync(path.join(dir, 'docs', 'context', 'conventions', 'docs.md')));
  assert.ok(fs.existsSync(path.join(dir, 'docs', 'context', 'conventions', 'coding.md')));
  assert.ok(fs.existsSync(path.join(dir, '.lore', 'memory.local.md')));
});

test('ensureStickyFiles: idempotent — does not overwrite existing files', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  ensureStickyFiles(dir);
  // Write custom content to agent-rules
  const rulesPath = path.join(dir, 'docs', 'context', 'agent-rules.md');
  fs.writeFileSync(rulesPath, '# Custom Rules');
  // Run again
  ensureStickyFiles(dir);
  assert.equal(fs.readFileSync(rulesPath, 'utf8'), '# Custom Rules');
});

test('ensureStickyFiles: skips conventions dir when conventions.md flat file exists', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Create flat conventions.md before sticky runs
  fs.mkdirSync(path.join(dir, 'docs', 'context'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'context', 'conventions.md'), '# My Conventions');
  ensureStickyFiles(dir);
  // Should not create conventions/ dir
  assert.ok(!fs.existsSync(path.join(dir, 'docs', 'context', 'conventions')));
  // Flat file should be untouched
  assert.equal(fs.readFileSync(path.join(dir, 'docs', 'context', 'conventions.md'), 'utf8'), '# My Conventions');
});

test('ensureStickyFiles: skips conventions when dir already exists', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Create conventions dir with custom content
  const convDir = path.join(dir, 'docs', 'context', 'conventions');
  fs.mkdirSync(convDir, { recursive: true });
  fs.writeFileSync(path.join(convDir, 'custom.md'), '# Custom');
  ensureStickyFiles(dir);
  // Custom file should still exist
  assert.ok(fs.existsSync(path.join(convDir, 'custom.md')));
});

test('ensureStickyFiles: local index content mentions gitignored', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  ensureStickyFiles(dir);
  const content = fs.readFileSync(path.join(dir, 'docs', 'knowledge', 'local', 'index.md'), 'utf8');
  assert.ok(content.includes('gitignored'));
});

test('ensureStickyFiles: MEMORY.local.md has header', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  ensureStickyFiles(dir);
  const content = fs.readFileSync(path.join(dir, '.lore', 'memory.local.md'), 'utf8');
  assert.ok(content.startsWith('# Local Memory'));
});
