const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const hookPath = path.join(__dirname, '..', '.lore', 'hooks', 'knowledge-tracker.js');

function setup() {
  // realpathSync: macOS /var → /private/var symlink must match process.cwd() in children
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-reminder-')));
  fs.mkdirSync(path.join(dir, '.git'));
  return dir;
}

function runHook(cwd, input) {
  const raw = execSync(`node "${hookPath}"`, {
    cwd,
    input: JSON.stringify(input),
    encoding: 'utf8',
  });
  return JSON.parse(raw).hookSpecificOutput;
}

test('silent on read-only tools', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const tool of ['Read', 'Grep', 'Glob']) {
    const out = runHook(dir, { tool_name: tool, hook_event_name: 'PostToolUse' });
    assert.equal(out.additionalContext, undefined, `${tool} should have no additionalContext`);
  }
});

test('resets bash counter after read-only tool', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Run 2 bash commands
  runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  // Read resets counter
  runHook(dir, { tool_name: 'Read', hook_event_name: 'PostToolUse' });
  // Next bash should be count=1 (gentle reminder, not "3 in a row")
  const out = runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  assert.ok(!out.additionalContext.includes('in a row'), 'counter should have reset');
});

test('first bash: gentle reminder', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  assert.ok(out.additionalContext.includes('Use Exploration -> Execution'));
  assert.ok(out.additionalContext.includes('Capture reusable Execution fixes -> skills'));
});

test('3rd consecutive bash: nudge', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  const out = runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  assert.ok(out.additionalContext.includes('Capture checkpoint (3 commands in a row)'));
  assert.ok(out.additionalContext.includes('Confirm Exploration vs Execution'));
  assert.ok(out.additionalContext.includes('If this is Execution phase: REQUIRED'));
});

test('5th consecutive bash: strong warning', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (let i = 0; i < 4; i++) {
    runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  }
  const out = runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  assert.ok(out.additionalContext.includes('REQUIRED capture review (5 consecutive commands)'));
  assert.ok(out.additionalContext.includes('Confirm Exploration vs Execution'));
});

test('bash failure: error pattern message', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUseFailure' });
  assert.ok(out.additionalContext.includes('Execution-phase failure is high-signal'));
  assert.ok(out.additionalContext.includes('If this is Execution phase: REQUIRED'));
});

test('knowledge capture resets counter', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Build up bash counter
  runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  // Write to docs/ = capture → resets counter
  runHook(dir, {
    tool_name: 'Write',
    tool_input: { file_path: path.join(dir, 'docs', 'env.md') },
    hook_event_name: 'PostToolUse',
  });
  // Next bash should be count=1
  const out = runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  assert.ok(!out.additionalContext.includes('in a row'), 'counter should have reset after capture');
});

test('MEMORY.local.md write: scratch notes warning', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = runHook(dir, {
    tool_name: 'Write',
    tool_input: { file_path: path.join(dir, '.lore', 'memory.local.md') },
    hook_event_name: 'PostToolUse',
  });
  assert.ok(out.additionalContext.includes('scratch notes'));
});

test('non-bash tool resets bash counter', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Build up bash counter
  runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  // Non-bash, non-read-only, non-capture tool resets counter
  runHook(dir, {
    tool_name: 'Write',
    tool_input: { file_path: path.join(dir, 'src', 'app.js') },
    hook_event_name: 'PostToolUse',
  });
  // Next bash should be count=1
  const out = runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  assert.ok(!out.additionalContext.includes('in a row'), 'counter should have reset after non-bash tool');
});
