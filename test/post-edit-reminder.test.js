const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const hookPath = path.join(__dirname, '..', 'hooks', 'post-edit-reminder.js');

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-reminder-'));
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

test('silent on read-only tools', () => {
  const dir = setup();
  for (const tool of ['Read', 'Grep', 'Glob']) {
    const out = runHook(dir, { tool_name: tool, hook_event_name: 'PostToolUse' });
    assert.equal(out.additionalContext, undefined, `${tool} should have no additionalContext`);
  }
});

test('resets bash counter after read-only tool', () => {
  const dir = setup();
  // Run 2 bash commands
  runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  // Read resets counter
  runHook(dir, { tool_name: 'Read', hook_event_name: 'PostToolUse' });
  // Next bash should be count=1 (gentle reminder, not "3 in a row")
  const out = runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  assert.ok(!out.additionalContext.includes('in a row'), 'counter should have reset');
});

test('first bash: gentle reminder', () => {
  const dir = setup();
  const out = runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  assert.ok(out.additionalContext.includes('Gotcha?'));
});

test('3rd consecutive bash: nudge', () => {
  const dir = setup();
  runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  const out = runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  assert.ok(out.additionalContext.includes('3 commands in a row'));
});

test('5th consecutive bash: strong warning', () => {
  const dir = setup();
  for (let i = 0; i < 4; i++) {
    runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  }
  const out = runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  assert.ok(out.additionalContext.includes('5 consecutive commands'));
});

test('bash failure: error pattern message', () => {
  const dir = setup();
  const out = runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUseFailure' });
  assert.ok(out.additionalContext.includes('Error pattern'));
});

test('knowledge capture resets counter', () => {
  const dir = setup();
  // Build up bash counter
  runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  // Write to docs/ = capture → resets counter
  runHook(dir, { tool_name: 'Write', tool_input: { file_path: '/proj/docs/env.md' }, hook_event_name: 'PostToolUse' });
  // Next bash should be count=1
  const out = runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  assert.ok(!out.additionalContext.includes('in a row'), 'counter should have reset after capture');
});

test('MEMORY.local.md write: scratch notes warning', () => {
  const dir = setup();
  const out = runHook(dir, { tool_name: 'Write', tool_input: { file_path: '/proj/MEMORY.local.md' }, hook_event_name: 'PostToolUse' });
  assert.ok(out.additionalContext.includes('scratch notes'));
});

test('nav-dirty flag set on docs/ write', () => {
  const dir = setup();
  const navFlag = path.join(dir, '.git', 'lore-nav-dirty');
  assert.ok(!fs.existsSync(navFlag), 'flag should not exist before');
  runHook(dir, { tool_name: 'Write', tool_input: { file_path: '/proj/docs/foo.md' }, hook_event_name: 'PostToolUse' });
  assert.ok(fs.existsSync(navFlag), 'flag should be set after docs/ write');
});

test('non-bash tool resets bash counter', () => {
  const dir = setup();
  // Build up bash counter
  runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  // Non-bash, non-read-only, non-capture tool resets counter
  runHook(dir, { tool_name: 'Write', tool_input: { file_path: '/proj/src/app.js' }, hook_event_name: 'PostToolUse' });
  // Next bash should be count=1
  const out = runHook(dir, { tool_name: 'Bash', hook_event_name: 'PostToolUse' });
  assert.ok(!out.additionalContext.includes('in a row'), 'counter should have reset after non-bash tool');
});
