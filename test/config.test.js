const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getConfig } = require('../.lore/lib/config');

function setup() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-config-'));
}

test('getConfig: reads valid .lore-config', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, '.lore'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.lore', 'config.json'), JSON.stringify({ version: '1.2.3', treeDepth: 4 }));
  const cfg = getConfig(dir);
  assert.equal(cfg.version, '1.2.3');
  assert.equal(cfg.treeDepth, 4);
});

test('getConfig: returns empty object when file missing', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const cfg = getConfig(dir);
  assert.deepStrictEqual(cfg, {});
});

test('getConfig: returns empty object on malformed JSON', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, '.lore'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.lore', 'config.json'), '{not valid json');
  const cfg = getConfig(dir);
  assert.deepStrictEqual(cfg, {});
});

test('getConfig: preserves all fields', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, '.lore'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.lore', 'config.json'),
    JSON.stringify({ version: '0.6.0', custom: 'value', nudgeThreshold: 5 }),
  );
  const cfg = getConfig(dir);
  assert.equal(cfg.custom, 'value');
  assert.equal(cfg.nudgeThreshold, 5);
});
