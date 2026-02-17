// Tests for Cursor hooks (.cursor/hooks/).
// Each test creates a temp dir with the hook files, shared lib, and a
// minimal project structure, then runs the hook as a subprocess.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const hooksSrc = path.join(__dirname, '..', '.cursor', 'hooks');
const libSrc = path.join(__dirname, '..', 'lib');

function setup(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-cursor-'));

  // Shared lib — hooks resolve ../../lib/ from .cursor/hooks/
  const libDir = path.join(dir, 'lib');
  fs.mkdirSync(libDir, { recursive: true });
  for (const f of fs.readdirSync(libSrc)) {
    fs.copyFileSync(path.join(libSrc, f), path.join(libDir, f));
  }

  // Copy hooks
  const hooksDir = path.join(dir, '.cursor', 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });
  for (const f of fs.readdirSync(hooksSrc)) {
    fs.copyFileSync(path.join(hooksSrc, f), path.join(hooksDir, f));
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
  if (opts.sessionFlag) {
    fs.writeFileSync(path.join(dir, '.git', 'lore-cursor-session'), Date.now().toString());
  }
  return dir;
}

function runHook(dir, hookName, stdinData) {
  const hookPath = path.join(dir, '.cursor', 'hooks', hookName);
  const input = stdinData ? JSON.stringify(stdinData) : '';
  try {
    const stdout = execSync(`echo '${input.replace(/'/g, "'\\''")}' | node "${hookPath}"`, {
      cwd: dir,
      encoding: 'utf8',
      timeout: 5000,
    });
    return { code: 0, stdout: stdout.trim() };
  } catch (e) {
    return { code: e.status || 1, stdout: (e.stdout || '').trim() };
  }
}

// ── Banner Inject ──

test('banner-inject: first prompt emits full banner', () => {
  const dir = setup({ config: { version: '1.0.0' } });
  const { code, stdout } = runHook(dir, 'banner-inject.js');
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout);
  assert.ok(parsed.systemMessage.includes('=== LORE v1.0.0 ==='));
  assert.ok(parsed.systemMessage.includes('DELEGATION:'));
});

test('banner-inject: subsequent prompt emits reminder only', () => {
  const dir = setup({ config: { version: '1.0.0' }, sessionFlag: true });
  const { code, stdout } = runHook(dir, 'banner-inject.js');
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout);
  assert.ok(!parsed.systemMessage.includes('=== LORE'));
  assert.ok(parsed.systemMessage.includes('Multi-step?'));
});

test('banner-inject: first prompt creates session flag', () => {
  const dir = setup();
  const flagPath = path.join(dir, '.git', 'lore-cursor-session');
  assert.ok(!fs.existsSync(flagPath));
  runHook(dir, 'banner-inject.js');
  assert.ok(fs.existsSync(flagPath));
});

test('banner-inject: first prompt creates sticky files', () => {
  const dir = setup();
  runHook(dir, 'banner-inject.js');
  assert.ok(fs.existsSync(path.join(dir, 'docs', 'context', 'local', 'index.md')));
  assert.ok(fs.existsSync(path.join(dir, 'MEMORY.local.md')));
});

test('banner-inject: shows agent domains in reminder', () => {
  const dir = setup({
    sessionFlag: true,
    registry: [
      '| Agent | Domain | Skills |',
      '|---|---|---|',
      '| `doc-agent` | Documentation | 2 |',
    ].join('\n'),
  });
  const { stdout } = runHook(dir, 'banner-inject.js');
  const parsed = JSON.parse(stdout);
  assert.ok(parsed.systemMessage.includes('Delegate: Documentation'));
});

// ── Protect Memory ──

test('protect-memory: blocks MEMORY.md reads', () => {
  const dir = setup();
  const { stdout } = runHook(dir, 'protect-memory.js', {
    filePath: path.join(dir, 'MEMORY.md'),
  });
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.continue, false);
  assert.ok(parsed.message.includes('MEMORY.local.md'));
});

test('protect-memory: allows MEMORY.local.md', () => {
  const dir = setup();
  const { code, stdout } = runHook(dir, 'protect-memory.js', {
    filePath: path.join(dir, 'MEMORY.local.md'),
  });
  // Should exit cleanly with no output (allowed)
  assert.equal(stdout, '');
});

test('protect-memory: allows nested MEMORY.md', () => {
  const dir = setup();
  const { stdout } = runHook(dir, 'protect-memory.js', {
    filePath: path.join(dir, 'subdir', 'MEMORY.md'),
  });
  assert.equal(stdout, '');
});

test('protect-memory: allows non-MEMORY files', () => {
  const dir = setup();
  const { stdout } = runHook(dir, 'protect-memory.js', {
    filePath: path.join(dir, 'docs', 'context', 'foo.md'),
  });
  assert.equal(stdout, '');
});

// ── Knowledge Tracker ──

test('knowledge-tracker: detects docs/ write and sets nav-dirty', () => {
  const dir = setup();
  const navFlag = path.join(dir, '.git', 'lore-nav-dirty');
  assert.ok(!fs.existsSync(navFlag));
  runHook(dir, 'knowledge-tracker.js', {
    filePath: path.join(dir, 'docs', 'context', 'new-page.md'),
  });
  assert.ok(fs.existsSync(navFlag));
});

test('knowledge-tracker: silent on knowledge path writes', () => {
  const dir = setup();
  const { stdout } = runHook(dir, 'knowledge-tracker.js', {
    filePath: path.join(dir, 'docs', 'context', 'something.md'),
  });
  // Knowledge captures are silent (no reminder message)
  assert.equal(stdout, '');
});

test('knowledge-tracker: emits reminder on non-knowledge writes', () => {
  const dir = setup();
  const { stdout } = runHook(dir, 'knowledge-tracker.js', {
    filePath: path.join(dir, 'MEMORY.local.md'),
  });
  assert.ok(stdout.length > 0);
  const parsed = JSON.parse(stdout);
  assert.ok(parsed.message.includes('scratch notes'));
});

test('knowledge-tracker: no nav-dirty on non-docs writes', () => {
  const dir = setup();
  const navFlag = path.join(dir, '.git', 'lore-nav-dirty');
  runHook(dir, 'knowledge-tracker.js', {
    filePath: path.join(dir, 'README.md'),
  });
  assert.ok(!fs.existsSync(navFlag));
});
