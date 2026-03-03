const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function setup(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-preamble-'));
  // Copy hooks
  const hooksDir = path.join(dir, '.lore', 'harness', 'hooks', 'lib');
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, '..', '.lore', 'harness', 'hooks', 'prompt-preamble.js'),
    path.join(dir, '.lore', 'harness', 'hooks', 'prompt-preamble.js'),
  );
  // Shared lib
  const libDir = path.join(dir, '.lore', 'harness', 'lib');
  fs.mkdirSync(libDir, { recursive: true });
  for (const f of fs.readdirSync(path.join(__dirname, '..', '.lore', 'harness', 'lib'))) {
    const src = path.join(__dirname, '..', '.lore', 'harness', 'lib', f);
    if (fs.statSync(src).isFile()) fs.copyFileSync(src, path.join(libDir, f));
  }
  if (opts.config) {
    fs.writeFileSync(path.join(dir, '.lore', 'config.json'), JSON.stringify(opts.config));
  }
  return dir;
}

function run(dir) {
  return execSync(`node .lore/harness/hooks/prompt-preamble.js`, { cwd: dir, encoding: 'utf8' }).trim();
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

test('prompt-preamble: outputs LORE-PROTOCOL prefixed line', () => {
  const dir = setup();
  try {
    const out = run(dir);
    assert.ok(out.includes('LORE-PROTOCOL'), 'should include LORE-PROTOCOL');
  } finally {
    cleanup(dir);
  }
});

test('prompt-preamble: always includes protocol directives', () => {
  const dir = setup();
  try {
    const out = run(dir);
    assert.ok(out.includes('SEARCH:'), 'should include SEARCH directive');
    assert.ok(out.includes('CAPTURE:'), 'should include CAPTURE directive');
    assert.ok(out.includes('SECURITY:'), 'should include SECURITY directive');
    assert.ok(out.includes('fieldnotes'), 'should mention fieldnotes');
  } finally {
    cleanup(dir);
  }
});

test('prompt-preamble: with rules — still includes protocol directives', () => {
  const dir = setup();
  const rulesDir = path.join(dir, '.lore', 'rules');
  fs.mkdirSync(rulesDir, { recursive: true });
  fs.writeFileSync(path.join(rulesDir, 'coding.md'), '# Coding\n');
  fs.writeFileSync(path.join(rulesDir, 'security.md'), '# Security\n');
  fs.writeFileSync(path.join(rulesDir, 'index.md'), '# Overview\n');
  try {
    const out = run(dir);
    assert.ok(out.includes('SEARCH:'), 'should include SEARCH directive');
    assert.ok(out.includes('CAPTURE:'), 'should include CAPTURE directive');
  } finally {
    cleanup(dir);
  }
});

test('prompt-preamble: uses Semantic search when semantic search configured', () => {
  const dir = setup({ config: { docker: { search: { address: 'localhost', port: 8080 } } } });
  try {
    const out = run(dir);
    assert.ok(out.includes('Semantic search'), 'should include Semantic search when configured');
    assert.ok(out.includes('CAPTURE:'), 'should include CAPTURE directive');
  } finally {
    cleanup(dir);
  }
});
