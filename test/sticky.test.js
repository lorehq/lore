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
  // Recursively copy templates (includes seeds/ subdirectory)
  fs.cpSync(tplSrc, tplDst, { recursive: true });
  return dir;
}

test('ensureStickyFiles: creates all sticky files from scratch', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  ensureStickyFiles(dir);
  assert.ok(fs.existsSync(path.join(dir, 'docs', 'knowledge', 'local', 'index.md')));
  assert.ok(fs.existsSync(path.join(dir, 'docs', 'context', 'agent-rules.md')));
  assert.ok(fs.existsSync(path.join(dir, 'docs', 'context', 'conventions', 'index.md')));
  assert.ok(fs.existsSync(path.join(dir, 'docs', 'context', 'conventions', 'documentation.md')));
  assert.ok(fs.existsSync(path.join(dir, 'docs', 'context', 'conventions', 'coding.md')));
  assert.ok(fs.existsSync(path.join(dir, 'docs', 'context', 'conventions', 'security.md')));
  assert.ok(fs.existsSync(path.join(dir, 'docs', 'work', 'notes', 'index.md')));
  assert.ok(fs.existsSync(path.join(dir, '.lore', 'memory.local.md')));
});

test('ensureStickyFiles: idempotent — does not overwrite existing files', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  ensureStickyFiles(dir);
  // Write custom content to agent-rules
  const rulesPath = path.join(dir, 'docs', 'context', 'agent-rules.md');
  fs.writeFileSync(rulesPath, '# Custom Rules');
  // Write custom coding convention
  const codingPath = path.join(dir, 'docs', 'context', 'conventions', 'coding.md');
  fs.writeFileSync(codingPath, '# My Coding Rules');
  // Run again
  ensureStickyFiles(dir);
  assert.equal(fs.readFileSync(rulesPath, 'utf8'), '# Custom Rules');
  assert.equal(fs.readFileSync(codingPath, 'utf8'), '# My Coding Rules');
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

test('ensureStickyFiles: creates seed files in existing conventions dir', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Create conventions dir with custom content but no seed files
  const convDir = path.join(dir, 'docs', 'context', 'conventions');
  fs.mkdirSync(convDir, { recursive: true });
  fs.writeFileSync(path.join(convDir, 'custom.md'), '# Custom');
  ensureStickyFiles(dir);
  // Custom file should still exist
  assert.ok(fs.existsSync(path.join(convDir, 'custom.md')));
  // Seed files should have been created
  assert.ok(fs.existsSync(path.join(convDir, 'coding.md')));
  assert.ok(fs.existsSync(path.join(convDir, 'documentation.md')));
  assert.ok(fs.existsSync(path.join(convDir, 'security.md')));
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
