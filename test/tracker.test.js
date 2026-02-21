const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  processToolUse,
  getThresholds,
  isKnowledgePath,
  isWriteTool,
  isBashTool,
  isReadOnly,
} = require('../.lore/lib/tracker');

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-tracker-'));
  fs.mkdirSync(path.join(dir, '.git'));
  return dir;
}

const defaultThresholds = { nudge: 3, warn: 5 };

// ── Tool classification ──

test('isWriteTool: recognizes write and edit', () => {
  assert.ok(isWriteTool('Write'));
  assert.ok(isWriteTool('edit'));
  assert.ok(isWriteTool('EDIT'));
  assert.ok(!isWriteTool('Bash'));
  assert.ok(!isWriteTool('Read'));
  assert.ok(!isWriteTool(''));
  assert.ok(!isWriteTool(null));
});

test('isBashTool: recognizes bash, shell, terminal', () => {
  assert.ok(isBashTool('Bash'));
  assert.ok(isBashTool('shell'));
  assert.ok(isBashTool('Terminal'));
  assert.ok(!isBashTool('Write'));
  assert.ok(!isBashTool(''));
  assert.ok(!isBashTool(null));
});

test('isReadOnly: recognizes read, grep, glob', () => {
  assert.ok(isReadOnly('Read'));
  assert.ok(isReadOnly('grep'));
  assert.ok(isReadOnly('GLOB'));
  assert.ok(!isReadOnly('Write'));
  assert.ok(!isReadOnly('Bash'));
});

// ── Path matching ──

test('isKnowledgePath: matches docs/ under rootDir', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.ok(isKnowledgePath(path.join(dir, 'docs', 'env.md'), dir));
  assert.ok(isKnowledgePath(path.join(dir, '.lore', 'skills', 'foo', 'SKILL.md'), dir));
  assert.ok(isKnowledgePath(path.join(dir, '.claude', 'skills', 'bar', 'SKILL.md'), dir));
});

test('isKnowledgePath: rejects paths outside rootDir', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.ok(!isKnowledgePath('/other/docs/env.md', dir));
  assert.ok(!isKnowledgePath(path.join(dir, 'src', 'app.js'), dir));
});

// ── Thresholds ──

test('getThresholds: reads from .lore-config', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, '.lore'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.lore', 'config.json'), JSON.stringify({ nudgeThreshold: 2, warnThreshold: 4 }));
  const t2 = getThresholds(dir);
  assert.equal(t2.nudge, 2);
  assert.equal(t2.warn, 4);
});

test('getThresholds: returns defaults when file missing', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const t2 = getThresholds(dir);
  assert.equal(t2.nudge, 15);
  assert.equal(t2.warn, 30);
});

test('getThresholds: uses discovery defaults when profile is discovery', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, '.lore'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.lore', 'config.json'), JSON.stringify({ profile: 'discovery' }));
  const t2 = getThresholds(dir);
  assert.equal(t2.nudge, 5);
  assert.equal(t2.warn, 10);
});

test('getThresholds: uses standard defaults when profile is standard', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, '.lore'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.lore', 'config.json'), JSON.stringify({ profile: 'standard' }));
  const t2 = getThresholds(dir);
  assert.equal(t2.nudge, 15);
  assert.equal(t2.warn, 30);
});

test('getThresholds: explicit values override discovery defaults', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, '.lore'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.lore', 'config.json'), JSON.stringify({ profile: 'discovery', nudgeThreshold: 10, warnThreshold: 20 }));
  const t2 = getThresholds(dir);
  assert.equal(t2.nudge, 10);
  assert.equal(t2.warn, 20);
});

// ── processToolUse ──

test('processToolUse: read-only tools are silent and reset counter', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const result = processToolUse({
    tool: 'Read',
    filePath: '',
    isFailure: false,
    bashCount: 5,
    thresholds: defaultThresholds,
    rootDir: dir,
  });
  assert.ok(result.silent);
  assert.equal(result.bashCount, 0);
});

test('processToolUse: knowledge write is silent and resets counter', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const result = processToolUse({
    tool: 'Write',
    filePath: path.join(dir, 'docs', 'env.md'),
    isFailure: false,
    bashCount: 3,
    thresholds: defaultThresholds,
    rootDir: dir,
  });
  assert.ok(result.silent);
  assert.equal(result.bashCount, 0);
});

test('processToolUse: bash increments counter', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const result = processToolUse({
    tool: 'Bash',
    filePath: '',
    isFailure: false,
    bashCount: 0,
    thresholds: defaultThresholds,
    rootDir: dir,
  });
  assert.equal(result.bashCount, 1);
  assert.ok(result.silent); // below threshold — no message emitted
});

test('processToolUse: nudge at threshold', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const result = processToolUse({
    tool: 'Bash',
    filePath: '',
    isFailure: false,
    bashCount: 2,
    thresholds: defaultThresholds,
    rootDir: dir,
  });
  assert.equal(result.bashCount, 3);
  assert.ok(result.message.includes('Capture checkpoint'));
  assert.ok(result.message.includes('Confirm Exploration vs Execution'));
  assert.ok(result.message.includes('If this is Execution phase: REQUIRED'));
});

test('processToolUse: warn at threshold', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const result = processToolUse({
    tool: 'Bash',
    filePath: '',
    isFailure: false,
    bashCount: 4,
    thresholds: defaultThresholds,
    rootDir: dir,
  });
  assert.equal(result.bashCount, 5);
  assert.ok(result.message.includes('REQUIRED capture review (5 consecutive commands)'));
  assert.ok(result.message.includes('Confirm Exploration vs Execution'));
  assert.equal(result.level, 'warn');
});

test('processToolUse: failure on first bash shows required capture review', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const result = processToolUse({
    tool: 'Bash',
    filePath: '',
    isFailure: true,
    bashCount: 0,
    thresholds: defaultThresholds,
    rootDir: dir,
  });
  assert.ok(result.message.includes('Execution-phase failure is high-signal'));
  assert.ok(result.message.includes('If this is Execution phase: REQUIRED'));
});

test('processToolUse: failure takes priority over threshold', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const result = processToolUse({
    tool: 'Bash',
    filePath: '',
    isFailure: true,
    bashCount: 4,
    thresholds: defaultThresholds,
    rootDir: dir,
  });
  assert.ok(result.message.includes('Execution-phase failure is high-signal'));
  assert.ok(result.message.includes('If this is Execution phase: REQUIRED'));
});

test('processToolUse: non-bash write resets counter', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const result = processToolUse({
    tool: 'Write',
    filePath: path.join(dir, 'src', 'app.js'),
    isFailure: false,
    bashCount: 3,
    thresholds: defaultThresholds,
    rootDir: dir,
  });
  assert.equal(result.bashCount, 0);
  assert.ok(result.silent); // non-knowledge write outside knowledge paths — silent
});

test('processToolUse: MEMORY.local.md write shows scratch warning', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const result = processToolUse({
    tool: 'Write',
    filePath: path.join(dir, '.lore', 'memory.local.md'),
    isFailure: false,
    bashCount: 0,
    thresholds: defaultThresholds,
    rootDir: dir,
  });
  assert.ok(result.message.includes('scratch notes'));
});

