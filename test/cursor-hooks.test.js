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
const libSrc = path.join(__dirname, '..', '.lore', 'lib');
const tplSrc = path.join(__dirname, '..', '.lore', 'templates');

function setup(opts = {}) {
  // realpathSync: macOS /var → /private/var symlink must match process.cwd() in children
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-cursor-')));

  // Shared lib — hooks resolve ../../.lore/lib/ from .cursor/hooks/
  const libDir = path.join(dir, '.lore', 'lib');
  fs.mkdirSync(libDir, { recursive: true });
  for (const f of fs.readdirSync(libSrc)) {
    fs.copyFileSync(path.join(libSrc, f), path.join(libDir, f));
  }

  // Templates — sticky files read from .lore/templates/
  const tplDir = path.join(dir, '.lore', 'templates');
  fs.mkdirSync(tplDir, { recursive: true });
  for (const f of fs.readdirSync(tplSrc)) {
    fs.copyFileSync(path.join(tplSrc, f), path.join(tplDir, f));
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
    fs.writeFileSync(path.join(dir, '.lore', 'config.json'), JSON.stringify(opts.config));
  }
  // Create .lore/agents/ for agent scanning
  fs.mkdirSync(path.join(dir, '.lore', 'agents'), { recursive: true });
  if (opts.agents) {
    for (const [filename, content] of Object.entries(opts.agents)) {
      fs.writeFileSync(path.join(dir, '.lore', 'agents', filename), content);
    }
  }
  return dir;
}

function runHook(dir, hookName, stdinData) {
  const hookFile = path.join(dir, '.cursor', 'hooks', hookName);
  const input = stdinData ? JSON.stringify(stdinData) : '';
  try {
    const raw = execSync(`node "${hookFile}"`, {
      cwd: dir,
      input,
      encoding: 'utf8',
      timeout: 5000,
    });
    return { code: 0, stdout: (raw || '').trim() };
  } catch (e) {
    return { code: e.status || 1, stdout: (e.stdout || '').trim() };
  }
}

// Helper to resolve the state file path for a test directory (same logic as hooks).
// Uses realpath because process.cwd() in child processes resolves symlinks
// (e.g., macOS /var/folders/ → /private/var/folders/).
function getStateFile(dir) {
  const crypto = require('crypto');
  const realDir = fs.realpathSync(dir);
  const hash = crypto.createHash('md5').update(realDir).digest('hex').slice(0, 8);
  return path.join(dir, '.git', `lore-tracker-${hash}.json`);
}

// ── Session Init ──

test('session-init: emits full banner with version and static context', (t) => {
  const dir = setup({ config: { version: '1.0.0' } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { code, stdout } = runHook(dir, 'session-init.js');
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout);
  assert.ok(parsed.additional_context.includes('=== LORE v1.0.0 ==='));
  // Full banner — .mdc rules serve as first-session fallback only
  assert.ok(parsed.additional_context.includes('DELEGATION:'), 'full banner should include delegation');
  assert.ok(parsed.additional_context.includes('CAPTURE:'), 'full banner should include capture reminder');
  assert.ok(parsed.additional_context.includes('KNOWLEDGE MAP:'), 'full banner should include knowledge map');
  assert.equal(parsed.continue, true);
});

test('session-init: creates sticky files', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  runHook(dir, 'session-init.js');
  assert.ok(fs.existsSync(path.join(dir, 'docs', 'knowledge', 'local', 'index.md')));
  assert.ok(fs.existsSync(path.join(dir, '.lore', 'memory.local.md')));
});

test('session-init: includes active roadmaps in dynamic banner', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const rmDir = path.join(dir, 'docs', 'work', 'roadmaps', 'my-roadmap');
  fs.mkdirSync(rmDir, { recursive: true });
  fs.writeFileSync(
    path.join(rmDir, 'index.md'),
    ['---', 'title: My Roadmap', 'status: active', 'summary: Phase 1', '---'].join('\n'),
  );
  const { stdout } = runHook(dir, 'session-init.js');
  const parsed = JSON.parse(stdout);
  assert.ok(parsed.additional_context.includes('ACTIVE ROADMAPS:'));
  assert.ok(parsed.additional_context.includes('My Roadmap (Phase 1)'));
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
  assert.ok(parsed.user_message.includes('.lore/memory.local.md'));
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

test('knowledge-tracker: silent on knowledge path writes', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { stdout } = runHook(dir, 'knowledge-tracker.js', {
    filePath: path.join(dir, 'docs', 'context', 'something.md'),
  });
  // Knowledge captures are silent (no reminder message)
  assert.equal(stdout, '');
});

test('knowledge-tracker: silent on all writes (output moved to capture-nudge)', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { stdout } = runHook(dir, 'knowledge-tracker.js', {
    filePath: path.join(dir, 'MEMORY.local.md'),
  });
  // knowledge-tracker no longer emits output — nudges delivered via capture-nudge.js
  assert.equal(stdout, '');
});

test('knowledge-tracker: file edit resets bash counter', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const stateFile = getStateFile(dir);

  // Pre-seed state with bash count (as if capture-nudge.js incremented it)
  fs.writeFileSync(stateFile, JSON.stringify({ bash: 3, lastFailure: true }));

  // File edit resets counter and failure flag
  runHook(dir, 'knowledge-tracker.js', {
    filePath: path.join(dir, 'README.md'),
  });
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(state.bash, 0);
  assert.equal(state.lastFailure, false);
});

// ── Protect Memory (preToolUse Write) ──

test('protect-memory: blocks MEMORY.md writes via preToolUse', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { stdout } = runHook(dir, 'protect-memory.js', {
    tool_name: 'Write',
    tool_input: { file_path: path.join(dir, 'MEMORY.md') },
  });
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.decision, 'deny');
  assert.ok(parsed.reason.includes('.lore/memory.local.md'));
});

test('protect-memory: allows non-MEMORY writes via preToolUse', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { stdout } = runHook(dir, 'protect-memory.js', {
    tool_name: 'Write',
    tool_input: { file_path: path.join(dir, 'docs', 'foo.md') },
  });
  assert.equal(stdout, '');
});

// ── Capture Nudge ──

test('capture-nudge: increments bash counter and emits allow', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { stdout } = runHook(dir, 'capture-nudge.js');
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.permission, 'allow');
  assert.ok(parsed.agent_message.length > 0);
  // State file should show bash: 1
  const state = JSON.parse(fs.readFileSync(getStateFile(dir), 'utf8'));
  assert.equal(state.bash, 1);
});

test('capture-nudge: emits nudge at threshold', (t) => {
  const dir = setup({ config: { nudgeThreshold: 3, warnThreshold: 5 } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Pre-seed at 2 so next run hits nudge threshold (3)
  fs.writeFileSync(getStateFile(dir), JSON.stringify({ bash: 2, lastFailure: false }));
  const { stdout } = runHook(dir, 'capture-nudge.js');
  const parsed = JSON.parse(stdout);
  assert.ok(parsed.agent_message.includes('Capture checkpoint (3 commands in a row)'));
  assert.ok(parsed.agent_message.includes('Confirm Exploration vs Execution'));
  assert.ok(parsed.agent_message.includes('If this is Execution phase: REQUIRED'));
});

test('capture-nudge: emits warn at warn threshold', (t) => {
  const dir = setup({ config: { nudgeThreshold: 3, warnThreshold: 5 } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Pre-seed at 4 so next run hits warn threshold (5)
  fs.writeFileSync(getStateFile(dir), JSON.stringify({ bash: 4, lastFailure: false }));
  const { stdout } = runHook(dir, 'capture-nudge.js');
  const parsed = JSON.parse(stdout);
  assert.ok(parsed.agent_message.includes('REQUIRED capture review (5 consecutive commands)'));
  assert.ok(parsed.agent_message.includes('Confirm Exploration vs Execution'));
});

test('capture-nudge: emits compaction re-orientation and clears flag', (t) => {
  const dir = setup({ config: { version: '0.8.1' } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const flagPath = path.join(dir, '.git', 'lore-compacted');
  fs.writeFileSync(flagPath, Date.now().toString());
  const { stdout } = runHook(dir, 'capture-nudge.js');
  const parsed = JSON.parse(stdout);
  assert.ok(parsed.agent_message.includes('[COMPACTED]'));
  assert.ok(parsed.agent_message.includes('Lore v0.8.1'));
  // Flag should be cleared after reading
  assert.ok(!fs.existsSync(flagPath));
});

test('capture-nudge: includes failure note and clears flag', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(getStateFile(dir), JSON.stringify({ bash: 0, lastFailure: true }));
  const { stdout } = runHook(dir, 'capture-nudge.js');
  const parsed = JSON.parse(stdout);
  assert.ok(parsed.agent_message.includes('Execution-phase failure is high-signal'));
  assert.ok(parsed.agent_message.includes('If this is Execution phase: REQUIRED'));
  // Failure flag should be cleared in state
  const state = JSON.parse(fs.readFileSync(getStateFile(dir), 'utf8'));
  assert.equal(state.lastFailure, false);
});

// ── Compaction Flag ──

test('compaction-flag: creates lore-compacted flag file', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const flagPath = path.join(dir, '.git', 'lore-compacted');
  assert.ok(!fs.existsSync(flagPath));
  runHook(dir, 'compaction-flag.js');
  assert.ok(fs.existsSync(flagPath));
});

// ── Failure Tracker ──

test('failure-tracker: sets lastFailure in state', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  runHook(dir, 'failure-tracker.js', { tool_name: 'bash' });
  const state = JSON.parse(fs.readFileSync(getStateFile(dir), 'utf8'));
  assert.equal(state.lastFailure, true);
});

test('failure-tracker: preserves existing bash count', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(getStateFile(dir), JSON.stringify({ bash: 3, lastFailure: false }));
  runHook(dir, 'failure-tracker.js', { tool_name: 'bash' });
  const state = JSON.parse(fs.readFileSync(getStateFile(dir), 'utf8'));
  assert.equal(state.bash, 3);
  assert.equal(state.lastFailure, true);
});
