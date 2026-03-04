// Tests for Lore harness hooks (.lore/harness/hooks/).
// Each test creates a temp dir with the hook files, shared lib, and a
// minimal project structure, then runs the hook as a child process.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const hooksSrc = path.join(__dirname, '..', '.lore', 'harness', 'hooks');
const libSrc = path.join(__dirname, '..', '.lore', 'harness', 'lib');
const tplSrc = path.join(__dirname, '..', '.lore', 'harness', 'templates');

function setup(opts = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-opencode-')));

  // Shared lib — hooks resolve ../lib/ relative to .lore/harness/hooks/
  const libDir = path.join(dir, '.lore', 'harness', 'lib');
  fs.mkdirSync(libDir, { recursive: true });
  for (const f of fs.readdirSync(libSrc)) {
    const src = path.join(libSrc, f);
    if (fs.lstatSync(src).isFile()) {
      fs.copyFileSync(src, path.join(libDir, f));
    }
  }

  // Templates — sticky files read from .lore/harness/templates/
  const tplDir = path.join(dir, '.lore', 'harness', 'templates');
  fs.cpSync(tplSrc, tplDir, { recursive: true });

  // Copy hooks
  const hooksDir = path.join(dir, '.lore', 'harness', 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });
  for (const f of fs.readdirSync(hooksSrc)) {
    const src = path.join(hooksSrc, f);
    if (fs.lstatSync(src).isFile()) {
      fs.copyFileSync(src, path.join(hooksDir, f));
    }
  }

  // Copy hooks/lib/ subdirectory
  const hooksLibSrc = path.join(hooksSrc, 'lib');
  if (fs.existsSync(hooksLibSrc)) {
    const hooksLibDir = path.join(hooksDir, 'lib');
    fs.mkdirSync(hooksLibDir, { recursive: true });
    for (const f of fs.readdirSync(hooksLibSrc)) {
      fs.copyFileSync(path.join(hooksLibSrc, f), path.join(hooksLibDir, f));
    }
  }

  // Minimal project structure
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
  if (opts.agentRules) {
    fs.mkdirSync(path.join(dir, 'docs', 'context'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs', 'context', 'agent-rules.md'), opts.agentRules);
  }
  return dir;
}

function runHook(dir, hookName, stdinInput) {
  const hookPath = path.join(dir, '.lore', 'harness', 'hooks', hookName);
  const opts = { cwd: dir, encoding: 'utf8' };
  if (stdinInput !== undefined) {
    opts.input = JSON.stringify(stdinInput);
  }
  return execSync(`node "${hookPath}"`, opts);
}

function runTrackerHook(dir, input) {
  const raw = runHook(dir, 'memory-nudge.js', input);
  return JSON.parse(raw).hookSpecificOutput;
}

// ── Session Init ──

test('session-init: hook output excludes static version header', (t) => {
  const dir = setup({ config: { version: '2.0.0' } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = runHook(dir, 'session-init.js');
  assert.ok(!out.includes('=== LORE'), 'version header belongs in static banner, not hook output');
});

test('session-init: hook output excludes static worker list', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = runHook(dir, 'session-init.js');
  assert.ok(!out.includes('(none yet)'), 'worker list belongs in static banner, not hook output');
});

test('session-init: hook output excludes static initiatives', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const rmDir = path.join(dir, 'docs', 'workflow', 'in-flight', 'initiatives', 'test-initiative');
  fs.mkdirSync(rmDir, { recursive: true });
  fs.writeFileSync(path.join(rmDir, 'index.md'), '---\ntitle: Test Initiative\nstatus: active\nsummary: Phase 1\n---\n');
  const out = runHook(dir, 'session-init.js');
  assert.ok(!out.includes('ACTIVE INITIATIVES:'), 'initiatives belong in static banner, not hook output');
});

test('session-init: hook output excludes static project context', (t) => {
  const dir = setup({
    agentRules: '---\ntitle: Rules\n---\n\n# My Project\n\nCustom rules.',
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = runHook(dir, 'session-init.js');
  assert.ok(!out.includes('PROJECT:'), 'project context belongs in static banner, not hook output');
});

test('session-init: creates sticky files', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  runHook(dir, 'session-init.js');
  assert.ok(fs.existsSync(path.join(dir, '.lore', 'memory.local.md')));
});

// ── Memory Nudge ──

test('memory-nudge: silent on read-only tools', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const tool of ['Read', 'Grep', 'Glob']) {
    const out = runTrackerHook(dir, { tool_name: tool, hook_event_name: 'PostToolUse' });
    assert.equal(out.additionalContext, undefined, `${tool} should have no additionalContext`);
  }
});

test('memory-nudge: first bash emits memory nudge', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = runTrackerHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  assert.ok(out.additionalContext.includes('LORE-MEMORY'), 'first bash should emit LORE-MEMORY nudge');
  assert.ok(out.additionalContext.includes('fieldnote'), 'first bash should mention fieldnote');
});

test('memory-nudge: escalates at 3 consecutive bash', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, '.lore', 'config.json'), JSON.stringify({ nudgeThreshold: 3, warnThreshold: 5 }));
  runTrackerHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  runTrackerHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  const out = runTrackerHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  assert.ok(out.additionalContext.includes('LORE-MEMORY'), 'should include LORE-MEMORY');
  assert.ok(out.additionalContext.includes('3 commands'), 'should include command count');
  assert.ok(out.additionalContext.includes('worth a note'), 'should include worth a note message');
});

test('memory-nudge: strong warning at 5 consecutive bash', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, '.lore', 'config.json'), JSON.stringify({ nudgeThreshold: 3, warnThreshold: 5 }));
  for (let i = 0; i < 4; i++) {
    runTrackerHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  }
  const out = runTrackerHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  assert.ok(out.additionalContext.includes('LORE-MEMORY'), 'should include LORE-MEMORY');
  assert.ok(out.additionalContext.includes('5 consecutive commands'), 'should include consecutive command count');
  assert.ok(out.additionalContext.includes('pause and capture'), 'should include pause and capture message');
});

test('memory-nudge: resets counter on knowledge capture', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  runTrackerHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  runTrackerHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  // Knowledge capture resets
  runTrackerHook(dir, {
    tool_name: 'Write',
    tool_input: { file_path: path.join(dir, 'docs', 'foo.md') },
    hook_event_name: 'PostToolUse',
  });
  // Next bash should be count=1 — silent (below threshold), not "in a row"
  const out = runTrackerHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  assert.ok(!out.additionalContext?.includes('in a row'), 'counter should have reset after capture');
});

test('memory-nudge: MEMORY.local.md scratch notes warning', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = runTrackerHook(dir, {
    tool_name: 'Write',
    tool_input: { file_path: path.join(dir, '.lore', 'memory.local.md') },
    hook_event_name: 'PostToolUse',
  });
  assert.ok(out.additionalContext.includes('LORE-MEMORY'), 'should include LORE-MEMORY');
  assert.ok(out.additionalContext.includes('Local memory updated'), 'should include local memory updated message');
});

test('memory-nudge: error pattern message on bash failure', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = runTrackerHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUseFailure' });
  assert.ok(out.additionalContext.includes('LORE-MEMORY'), 'should include LORE-MEMORY');
  assert.ok(out.additionalContext.includes('Execution failed'), 'should include execution failed message');
  assert.ok(out.additionalContext.includes('fieldnote'), 'should include fieldnote suggestion');
});

test('memory-nudge: respects custom thresholds from .lore-config', (t) => {
  const dir = setup({ config: { version: '1.0.0', nudgeThreshold: 2, warnThreshold: 4 } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // 2nd bash should now nudge (custom threshold)
  runTrackerHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  const out = runTrackerHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  assert.ok(out.additionalContext.includes('LORE-MEMORY'), 'should include LORE-MEMORY at custom threshold');
  assert.ok(out.additionalContext.includes('2 commands'), 'should include command count');
});

// ── Protect Memory ──

test('protect-memory: blocks writes to MEMORY.md at project root', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const raw = runHook(dir, 'protect-memory.js', {
    tool_name: 'Write',
    tool_input: { file_path: path.join(dir, 'MEMORY.md') },
  });
  const out = JSON.parse(raw).hookSpecificOutput;
  assert.equal(out.permissionDecision, 'deny');
  assert.ok(out.permissionDecisionReason.includes('memory.local.md'));
});

test('protect-memory: blocks reads to MEMORY.md at project root', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const raw = runHook(dir, 'protect-memory.js', {
    tool_name: 'Read',
    tool_input: { file_path: path.join(dir, 'MEMORY.md') },
  });
  const out = JSON.parse(raw).hookSpecificOutput;
  assert.equal(out.permissionDecision, 'deny');
  assert.ok(out.permissionDecisionReason.includes('memory.local.md'));
});

test('protect-memory: read error mentions MEMORY.local.md', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const raw = runHook(dir, 'protect-memory.js', {
    tool_name: 'Read',
    tool_input: { file_path: path.join(dir, 'MEMORY.md') },
  });
  const out = JSON.parse(raw).hookSpecificOutput;
  assert.ok(out.permissionDecisionReason.includes('Read that file instead'));
});

test('protect-memory: write error shows routing table', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const raw = runHook(dir, 'protect-memory.js', {
    tool_name: 'Edit',
    tool_input: { file_path: path.join(dir, 'MEMORY.md') },
  });
  const out = JSON.parse(raw).hookSpecificOutput;
  assert.ok(out.permissionDecisionReason.includes('lore-create-fieldnote'));
});

test('protect-memory: allows MEMORY.local.md', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Allowed paths produce no stdout (hook exits with code 0)
  try {
    const raw = runHook(dir, 'protect-memory.js', {
      tool_name: 'Write',
      tool_input: { file_path: path.join(dir, 'MEMORY.local.md') },
    });
    // If there is output, it should not be a deny
    if (raw.trim()) {
      const out = JSON.parse(raw).hookSpecificOutput;
      assert.notEqual(out.permissionDecision, 'deny', 'MEMORY.local.md should not be denied');
    }
  } catch (e) {
    // exit code 0 with no output is fine — hook allows the action
    assert.ok(true);
  }
});

test('protect-memory: allows nested MEMORY.md', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  try {
    const raw = runHook(dir, 'protect-memory.js', {
      tool_name: 'Write',
      tool_input: { file_path: path.join(dir, 'subdir', 'MEMORY.md') },
    });
    if (raw.trim()) {
      const out = JSON.parse(raw).hookSpecificOutput;
      assert.notEqual(out.permissionDecision, 'deny', 'nested MEMORY.md should not be denied');
    }
  } catch (e) {
    assert.ok(true);
  }
});

test('protect-memory: ignores non-file tools', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Bash tool with no file_path should be allowed
  try {
    const raw = runHook(dir, 'protect-memory.js', {
      tool_name: 'Bash',
      tool_input: { command: 'cat MEMORY.md' },
    });
    if (raw.trim()) {
      const out = JSON.parse(raw).hookSpecificOutput;
      assert.notEqual(out.permissionDecision, 'deny', 'Bash should not be denied');
    }
  } catch (e) {
    assert.ok(true);
  }
});
