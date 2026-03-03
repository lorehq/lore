const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getConfig, getProfile } = require('../.lore/harness/lib/config');

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

test('getConfig: returns object when local file missing (falls back to global directory)', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const cfg = getConfig(dir);
  assert.equal(typeof cfg, 'object');
  assert.ok(cfg !== null);
});

test('getConfig: returns global directory config on malformed local JSON', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, '.lore'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.lore', 'config.json'), '{not valid json');
  const cfg = getConfig(dir);
  assert.equal(typeof cfg, 'object');
  assert.ok(cfg !== null);
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

test('getProfile: returns standard when profile not set', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, '.lore'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.lore', 'config.json'), JSON.stringify({ version: '1.0.0' }));
  assert.equal(getProfile(dir), 'standard');
});

test('getProfile: returns minimal when set', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, '.lore'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.lore', 'config.json'), JSON.stringify({ profile: 'minimal' }));
  assert.equal(getProfile(dir), 'minimal');
});

test('getProfile: returns discovery when set', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, '.lore'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.lore', 'config.json'), JSON.stringify({ profile: 'discovery' }));
  assert.equal(getProfile(dir), 'discovery');
});

test('getProfile: returns standard for invalid profile', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, '.lore'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.lore', 'config.json'), JSON.stringify({ profile: 'turbo' }));
  assert.equal(getProfile(dir), 'standard');
});

test('getProfile: returns standard when config file missing', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.equal(getProfile(dir), 'standard');
});
