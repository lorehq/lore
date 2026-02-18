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

// ── Session Init ──

test('session-init: emits full banner with additional_context', (t) => {
  const dir = setup({ config: { version: '1.0.0' } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { code, stdout } = runHook(dir, 'session-init.js');
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout);
  assert.ok(parsed.additional_context.includes('=== LORE v1.0.0 ==='));
  assert.ok(parsed.additional_context.includes('DELEGATION:'));
  assert.equal(parsed.continue, true);
});

test('session-init: creates sticky files', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  runHook(dir, 'session-init.js');
  assert.ok(fs.existsSync(path.join(dir, 'docs', 'knowledge', 'local', 'index.md')));
  assert.ok(fs.existsSync(path.join(dir, 'MEMORY.local.md')));
});

test('session-init: includes agent domains in banner', (t) => {
  const dir = setup({
    registry: ['| Agent | Domain | Skills |', '|---|---|---|', '| `doc-agent` | Documentation | 2 |'].join('\n'),
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { stdout } = runHook(dir, 'session-init.js');
  const parsed = JSON.parse(stdout);
  assert.ok(parsed.additional_context.includes('Documentation'));
});

// ── Protect Memory ──

test('protect-memory: blocks MEMORY.md reads with deny permission', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { stdout } = runHook(dir, 'protect-memory.js', {
    filePath: path.join(dir, 'MEMORY.md'),
  });
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.permission, 'deny');
  assert.ok(parsed.user_message.includes('MEMORY.local.md'));
});

test('protect-memory: allows MEMORY.local.md', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { stdout } = runHook(dir, 'protect-memory.js', {
    filePath: path.join(dir, 'MEMORY.local.md'),
  });
  // Should exit cleanly with no output (allowed)
  assert.equal(stdout, '');
});

test('protect-memory: allows nested MEMORY.md', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { stdout } = runHook(dir, 'protect-memory.js', {
    filePath: path.join(dir, 'subdir', 'MEMORY.md'),
  });
  assert.equal(stdout, '');
});

test('protect-memory: allows non-MEMORY files', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { stdout } = runHook(dir, 'protect-memory.js', {
    filePath: path.join(dir, 'docs', 'context', 'foo.md'),
  });
  assert.equal(stdout, '');
});

// ── Knowledge Tracker ──

test('knowledge-tracker: detects docs/ write and sets nav-dirty', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const navFlag = path.join(dir, '.git', 'lore-nav-dirty');
  assert.ok(!fs.existsSync(navFlag));
  runHook(dir, 'knowledge-tracker.js', {
    filePath: path.join(dir, 'docs', 'context', 'new-page.md'),
  });
  assert.ok(fs.existsSync(navFlag));
});

test('knowledge-tracker: silent on knowledge path writes', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { stdout } = runHook(dir, 'knowledge-tracker.js', {
    filePath: path.join(dir, 'docs', 'context', 'something.md'),
  });
  // Knowledge captures are silent (no reminder message)
  assert.equal(stdout, '');
});

test('knowledge-tracker: emits reminder on non-knowledge writes', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { stdout } = runHook(dir, 'knowledge-tracker.js', {
    filePath: path.join(dir, 'MEMORY.local.md'),
  });
  assert.ok(stdout.length > 0);
  const parsed = JSON.parse(stdout);
  assert.ok(parsed.message.includes('scratch notes'));
});

test('knowledge-tracker: no nav-dirty on non-docs writes', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const navFlag = path.join(dir, '.git', 'lore-nav-dirty');
  runHook(dir, 'knowledge-tracker.js', {
    filePath: path.join(dir, 'README.md'),
  });
  assert.ok(!fs.existsSync(navFlag));
});

test('knowledge-tracker: tracks consecutive bash commands via afterShellExecution', (t) => {
  const dir = setup({ config: { nudgeThreshold: 2, warnThreshold: 4 } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // First shell execution — count goes to 1, below nudge threshold
  runHook(dir, 'knowledge-tracker.js', { hook_event_name: 'afterShellExecution' });
  // Second shell execution — count goes to 2, hits nudge threshold
  runHook(dir, 'knowledge-tracker.js', { hook_event_name: 'afterShellExecution' });
  // Verify state file was created and bash count persisted
  const crypto = require('crypto');
  const hash = crypto.createHash('md5').update(dir).digest('hex').slice(0, 8);
  const stateFile = path.join(dir, '.git', `lore-tracker-${hash}.json`);
  assert.ok(fs.existsSync(stateFile));
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(state.bash, 2);
});

test('knowledge-tracker: file edit resets bash counter', (t) => {
  const dir = setup({ config: { nudgeThreshold: 2, warnThreshold: 4 } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const crypto = require('crypto');
  const hash = crypto.createHash('md5').update(dir).digest('hex').slice(0, 8);
  const stateFile = path.join(dir, '.git', `lore-tracker-${hash}.json`);

  // Two shell executions
  runHook(dir, 'knowledge-tracker.js', { hook_event_name: 'afterShellExecution' });
  runHook(dir, 'knowledge-tracker.js', { hook_event_name: 'afterShellExecution' });
  assert.equal(JSON.parse(fs.readFileSync(stateFile, 'utf8')).bash, 2);

  // File edit resets counter
  runHook(dir, 'knowledge-tracker.js', {
    hook_event_name: 'afterFileEdit',
    filePath: path.join(dir, 'README.md'),
  });
  assert.equal(JSON.parse(fs.readFileSync(stateFile, 'utf8')).bash, 0);
});
