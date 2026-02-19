// Tests for lib/hook-logger.js — the structured hook event logger.
//
// Each test gets an isolated temp directory with a .git/ folder to simulate
// a real workspace. LORE_HOOK_LOG is toggled per-test and cleaned up in
// t.after() to prevent cross-test pollution.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { logHookEvent, getLogPath } = require('../lib/hook-logger');

// Create an isolated temp workspace with .git/ for log file resolution
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-hooklog-'));
  fs.mkdirSync(path.join(dir, '.git'));
  return dir;
}

test('getLogPath: uses .git dir when present', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const logPath = getLogPath(dir);
  assert.ok(logPath.includes('.git'));
  assert.ok(logPath.endsWith('lore-hook-events.jsonl'));
});

test('getLogPath: falls back to tmpdir when no .git', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-hooklog-nogit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const logPath = getLogPath(dir);
  assert.ok(logPath.includes(os.tmpdir()));
});

test('logHookEvent: no-op when LORE_HOOK_LOG is unset', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  delete process.env.LORE_HOOK_LOG;
  logHookEvent({ platform: 'test', hook: 'test-hook', event: 'TestEvent', outputSize: 42, directory: dir });
  const logPath = getLogPath(dir);
  assert.ok(!fs.existsSync(logPath));
});

test('logHookEvent: writes JSONL when LORE_HOOK_LOG=1', (t) => {
  const dir = setup();
  t.after(() => {
    delete process.env.LORE_HOOK_LOG;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  process.env.LORE_HOOK_LOG = '1';
  logHookEvent({
    platform: 'cursor',
    hook: 'capture-nudge',
    event: 'beforeShellExecution',
    outputSize: 100,
    directory: dir,
  });
  const logPath = getLogPath(dir);
  assert.ok(fs.existsSync(logPath));
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.platform, 'cursor');
  assert.equal(entry.hook, 'capture-nudge');
  assert.equal(entry.event, 'beforeShellExecution');
  assert.equal(entry.output_size, 100);
  assert.ok(typeof entry.ts === 'number');
});

test('logHookEvent: appends multiple events', (t) => {
  const dir = setup();
  t.after(() => {
    delete process.env.LORE_HOOK_LOG;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  process.env.LORE_HOOK_LOG = '1';
  logHookEvent({ platform: 'claude', hook: 'session-init', event: 'SessionStart', outputSize: 500, directory: dir });
  logHookEvent({ platform: 'claude', hook: 'knowledge-tracker', event: 'PostToolUse', outputSize: 80, directory: dir });
  logHookEvent({
    platform: 'claude',
    hook: 'prompt-preamble',
    event: 'UserPromptSubmit',
    outputSize: 60,
    directory: dir,
  });
  const logPath = getLogPath(dir);
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
  assert.equal(lines.length, 3);
});

test('logHookEvent: includes state when provided', (t) => {
  const dir = setup();
  t.after(() => {
    delete process.env.LORE_HOOK_LOG;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  process.env.LORE_HOOK_LOG = '1';
  logHookEvent({
    platform: 'cursor',
    hook: 'capture-nudge',
    event: 'beforeShellExecution',
    outputSize: 50,
    state: { bash: 3, compacted: false },
    directory: dir,
  });
  const logPath = getLogPath(dir);
  const entry = JSON.parse(fs.readFileSync(logPath, 'utf8').trim());
  assert.deepEqual(entry.state, { bash: 3, compacted: false });
});

test('logHookEvent: omits state when empty', (t) => {
  const dir = setup();
  t.after(() => {
    delete process.env.LORE_HOOK_LOG;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  process.env.LORE_HOOK_LOG = '1';
  logHookEvent({ platform: 'claude', hook: 'session-init', event: 'SessionStart', outputSize: 500, directory: dir });
  const logPath = getLogPath(dir);
  const entry = JSON.parse(fs.readFileSync(logPath, 'utf8').trim());
  assert.ok(!('state' in entry));
});
