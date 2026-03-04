const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const LIB = path.join(__dirname, '..', '.lore', 'harness', 'lib');
const MIGRATIONS = path.join(__dirname, '..', '.lore', 'harness', 'migrations');

function tmpHome() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-global-')));
}

function loadGlobal(home) {
  // Isolate each test from the real HOME by requiring a fresh copy with HOME override
  const origHome = process.env.HOME;
  process.env.HOME = home;
  // Clear require cache so getGlobalPath() picks up the new HOME
  for (const key of Object.keys(require.cache)) {
    if (key.includes('.lore/harness/lib/') || key.includes('.lore/harness/migrations/')) {
      delete require.cache[key];
    }
  }
  const mod = require(path.join(LIB, 'global'));
  return { mod, restore: () => { process.env.HOME = origHome; } };
}

// --- getGlobalStructureVersion ---

test('getGlobalStructureVersion returns 0 when no config exists', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  assert.equal(mod.getGlobalStructureVersion(), 0);
});

test('getGlobalStructureVersion reads version from config', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  const loreDir = path.join(home, '.lore');
  fs.mkdirSync(loreDir, { recursive: true });
  fs.writeFileSync(path.join(loreDir, 'config.json'), JSON.stringify({ globalStructureVersion: 3 }));
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  assert.equal(mod.getGlobalStructureVersion(), 3);
});

test('getGlobalStructureVersion returns 0 when field is missing', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  const loreDir = path.join(home, '.lore');
  fs.mkdirSync(loreDir, { recursive: true });
  fs.writeFileSync(path.join(loreDir, 'config.json'), JSON.stringify({ name: 'test' }));
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  assert.equal(mod.getGlobalStructureVersion(), 0);
});

// --- getRequiredStructureVersion ---

test('getRequiredStructureVersion returns 0 for missing dir', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  assert.equal(mod.getRequiredStructureVersion(path.join(home, 'nonexistent')), 0);
});

test('getRequiredStructureVersion returns highest version', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  // Use real migrations dir
  const version = mod.getRequiredStructureVersion(MIGRATIONS);
  assert.ok(version >= 1, 'should find at least migration 001');
});

test('getRequiredStructureVersion returns 0 for empty dir', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  const emptyDir = path.join(home, 'empty-migrations');
  fs.mkdirSync(emptyDir, { recursive: true });
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  assert.equal(mod.getRequiredStructureVersion(emptyDir), 0);
});

// --- runMigrations ---

test('runMigrations runs pending migrations in order', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  fs.mkdirSync(path.join(home, '.lore'), { recursive: true });
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  const result = mod.runMigrations(MIGRATIONS);
  assert.ok(result.ran >= 1, 'should run at least one migration');
  assert.ok(result.version >= 1, 'version should be bumped');
  // Verify skeleton was created
  assert.ok(fs.existsSync(path.join(home, '.lore', 'knowledge-base', 'fieldnotes')), 'fieldnotes dir created');
  assert.ok(fs.existsSync(path.join(home, '.lore', 'knowledge-base', 'runbooks')), 'runbooks dir created');
  assert.ok(fs.existsSync(path.join(home, '.lore', 'knowledge-base', 'environment')), 'environment dir created');
  assert.ok(fs.existsSync(path.join(home, '.lore', 'skills')), 'skills dir created');
  assert.ok(fs.existsSync(path.join(home, '.lore', 'rules')), 'rules dir created');
  assert.ok(fs.existsSync(path.join(home, '.lore', 'agents')), 'agents dir created');
});

test('runMigrations skips already-applied migrations', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  fs.mkdirSync(path.join(home, '.lore'), { recursive: true });
  // Pre-set version to current required
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  const required = mod.getRequiredStructureVersion(MIGRATIONS);
  fs.writeFileSync(
    path.join(home, '.lore', 'config.json'),
    JSON.stringify({ globalStructureVersion: required }),
  );
  // Clear cache and reload to pick up the config
  const { mod: mod2, restore: restore2 } = loadGlobal(home);
  t.after(restore2);
  const result = mod2.runMigrations(MIGRATIONS);
  assert.equal(result.ran, 0, 'should skip all migrations');
  assert.equal(result.version, required);
});

test('runMigrations is idempotent', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  fs.mkdirSync(path.join(home, '.lore'), { recursive: true });
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  const result1 = mod.runMigrations(MIGRATIONS);
  // Run again — should be a no-op
  const { mod: mod2, restore: restore2 } = loadGlobal(home);
  t.after(restore2);
  const result2 = mod2.runMigrations(MIGRATIONS);
  assert.equal(result2.ran, 0, 'second run should be a no-op');
  assert.equal(result2.version, result1.version);
});

// --- ensureGlobalDir ---

test('ensureGlobalDir creates dir and runs migrations', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  // Don't pre-create .lore — ensureGlobalDir should do it
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  const result = mod.ensureGlobalDir(MIGRATIONS);
  assert.ok(result.ran >= 1, 'should run migrations');
  assert.ok(fs.existsSync(path.join(home, '.lore')), '~/.lore/ created');
  assert.ok(fs.existsSync(path.join(home, '.lore', 'config.json')), 'config.json created');
});

// --- Migration 001 specifics ---

test('migration 001 creates full skeleton', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  fs.mkdirSync(path.join(home, '.lore'), { recursive: true });
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  mod.runMigrations(MIGRATIONS);

  const expected = [
    'skills', 'rules', 'agents',
    'knowledge-base/fieldnotes', 'knowledge-base/runbooks',
    'knowledge-base/environment', 'knowledge-base/work-items',
    'knowledge-base/drafts',
  ];
  for (const dir of expected) {
    assert.ok(fs.existsSync(path.join(home, '.lore', dir)), `${dir} should exist`);
  }
  // operator-profile.md seeded
  const profilePath = path.join(home, '.lore', 'knowledge-base', 'operator-profile.md');
  assert.ok(fs.existsSync(profilePath), 'operator-profile.md seeded');
  const content = fs.readFileSync(profilePath, 'utf8');
  assert.ok(content.includes('# Operator Profile'), 'has expected content');
});

test('migration 001 preserves existing operator-profile.md', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  const kbDir = path.join(home, '.lore', 'knowledge-base');
  fs.mkdirSync(kbDir, { recursive: true });
  const profilePath = path.join(kbDir, 'operator-profile.md');
  fs.writeFileSync(profilePath, '# Custom Profile\n\nMy custom content.');
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  mod.runMigrations(MIGRATIONS);
  const content = fs.readFileSync(profilePath, 'utf8');
  assert.ok(content.includes('My custom content'), 'existing content preserved');
});

test('migration 001 preserves existing config fields', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  const loreDir = path.join(home, '.lore');
  fs.mkdirSync(loreDir, { recursive: true });
  fs.writeFileSync(path.join(loreDir, 'config.json'), JSON.stringify({ name: 'my-project', custom: true }));
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  mod.runMigrations(MIGRATIONS);
  const config = JSON.parse(fs.readFileSync(path.join(loreDir, 'config.json'), 'utf8'));
  assert.equal(config.name, 'my-project', 'name preserved');
  assert.equal(config.custom, true, 'custom field preserved');
  assert.ok(config.globalStructureVersion >= 1, 'version bumped');
});

// --- getSidecarPort ---

test('getSidecarPort returns 9185 when no config exists', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  assert.equal(mod.getSidecarPort(), 9185);
});

test('getSidecarPort reads custom port from config', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  const loreDir = path.join(home, '.lore');
  fs.mkdirSync(loreDir, { recursive: true });
  fs.writeFileSync(path.join(loreDir, 'config.json'), JSON.stringify({ sidecarPort: 9999 }));
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  assert.equal(mod.getSidecarPort(), 9999);
});

// --- getGlobalToken ---

test('getGlobalToken returns null when no .env exists', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  assert.equal(mod.getGlobalToken(), null);
});

test('getGlobalToken reads token from .env', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  const loreDir = path.join(home, '.lore');
  fs.mkdirSync(loreDir, { recursive: true });
  fs.writeFileSync(path.join(loreDir, '.env'), 'LORE_TOKEN=abc123\n');
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  assert.equal(mod.getGlobalToken(), 'abc123');
});

// --- ensureGlobalToken ---

test('ensureGlobalToken creates token when missing', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  const loreDir = path.join(home, '.lore');
  fs.mkdirSync(loreDir, { recursive: true });
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  mod.ensureGlobalToken();
  const content = fs.readFileSync(path.join(loreDir, '.env'), 'utf8');
  assert.ok(content.includes('LORE_TOKEN='), 'token written');
  assert.ok(content.match(/LORE_TOKEN=([a-f0-9]{64})/), 'token is 64-char hex');
});

test('ensureGlobalToken does not overwrite existing token', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  const loreDir = path.join(home, '.lore');
  fs.mkdirSync(loreDir, { recursive: true });
  fs.writeFileSync(path.join(loreDir, '.env'), 'LORE_TOKEN=mytoken\n');
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  mod.ensureGlobalToken();
  const content = fs.readFileSync(path.join(loreDir, '.env'), 'utf8');
  assert.ok(content.includes('LORE_TOKEN=mytoken'), 'original token preserved');
  assert.equal(content.match(/LORE_TOKEN=/g).length, 1, 'no duplicate token');
});

// --- Migration 002: docker sidecar ---

test('migration 002 creates docker-compose.yml and .env', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  fs.mkdirSync(path.join(home, '.lore'), { recursive: true });
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  mod.runMigrations(MIGRATIONS);
  const loreDir = path.join(home, '.lore');
  assert.ok(fs.existsSync(path.join(loreDir, 'docker-compose.yml')), 'docker-compose.yml created');
  assert.ok(fs.existsSync(path.join(loreDir, '.env')), '.env created');
  assert.ok(fs.existsSync(path.join(loreDir, 'redis-data')), 'redis-data dir created');
  const compose = fs.readFileSync(path.join(loreDir, 'docker-compose.yml'), 'utf8');
  assert.ok(compose.includes('lore-runtime'), 'compose has runtime service');
  assert.ok(compose.includes('lore-memory'), 'compose has memory service');
  const env = fs.readFileSync(path.join(loreDir, '.env'), 'utf8');
  assert.ok(env.includes('LORE_TOKEN='), 'env has token');
});

test('migration 002 preserves existing docker-compose.yml', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  const loreDir = path.join(home, '.lore');
  fs.mkdirSync(loreDir, { recursive: true });
  fs.writeFileSync(path.join(loreDir, 'docker-compose.yml'), '# custom compose\n');
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  mod.runMigrations(MIGRATIONS);
  const compose = fs.readFileSync(path.join(loreDir, 'docker-compose.yml'), 'utf8');
  assert.ok(compose.includes('# custom compose'), 'custom compose preserved');
});
