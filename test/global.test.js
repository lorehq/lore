const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const LIB = path.join(__dirname, '..', '.lore', 'harness', 'lib');

function tmpHome() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-global-')));
}

function loadGlobal(home) {
  const origHome = process.env.HOME;
  process.env.HOME = home;
  for (const key of Object.keys(require.cache)) {
    if (key.includes('.lore/harness/lib/')) {
      delete require.cache[key];
    }
  }
  const mod = require(path.join(LIB, 'global'));
  return { mod, restore: () => { process.env.HOME = origHome; } };
}

// --- ensureGlobalDir ---

test('ensureGlobalDir creates ~/.lore/ with full skeleton', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  mod.ensureGlobalDir();
  const expected = [
    'AGENTIC/skills', 'AGENTIC/rules', 'AGENTIC/agents',
    'knowledge-base/fieldnotes', 'knowledge-base/runbooks',
    'knowledge-base/environment', 'knowledge-base/work-items',
    'knowledge-base/drafts', 'redis-data',
  ];
  for (const dir of expected) {
    assert.ok(fs.existsSync(path.join(home, '.lore', dir)), `${dir} should exist`);
  }
});

test('ensureGlobalDir seeds operator-profile.md', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  mod.ensureGlobalDir();
  const profilePath = path.join(home, '.lore', 'knowledge-base', 'operator-profile.md');
  assert.ok(fs.existsSync(profilePath), 'operator-profile.md seeded');
  const content = fs.readFileSync(profilePath, 'utf8');
  assert.ok(content.includes('# Operator Profile'), 'has expected content');
});

test('ensureGlobalDir preserves existing operator-profile.md', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  const kbDir = path.join(home, '.lore', 'knowledge-base');
  fs.mkdirSync(kbDir, { recursive: true });
  fs.writeFileSync(path.join(kbDir, 'operator-profile.md'), '# Custom Profile\n\nMy custom content.');
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  mod.ensureGlobalDir();
  const content = fs.readFileSync(path.join(kbDir, 'operator-profile.md'), 'utf8');
  assert.ok(content.includes('My custom content'), 'existing content preserved');
});

test('ensureGlobalDir creates docker-compose.yml with Redis port', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  mod.ensureGlobalDir();
  const loreDir = path.join(home, '.lore');
  assert.ok(fs.existsSync(path.join(loreDir, 'docker-compose.yml')), 'docker-compose.yml created');
  assert.ok(fs.existsSync(path.join(loreDir, '.env')), '.env created');
  const compose = fs.readFileSync(path.join(loreDir, 'docker-compose.yml'), 'utf8');
  assert.ok(compose.includes('lore-runtime'), 'compose has runtime service');
  assert.ok(compose.includes('lore-memory'), 'compose has memory service');
  assert.ok(compose.includes("'6379:6379'"), 'compose has Redis port exposed');
  const env = fs.readFileSync(path.join(loreDir, '.env'), 'utf8');
  assert.ok(env.includes('LORE_TOKEN='), 'env has token');
});

test('ensureGlobalDir preserves existing docker-compose.yml', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  const loreDir = path.join(home, '.lore');
  fs.mkdirSync(loreDir, { recursive: true });
  fs.writeFileSync(path.join(loreDir, 'docker-compose.yml'), '# custom compose\n');
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  mod.ensureGlobalDir();
  const compose = fs.readFileSync(path.join(loreDir, 'docker-compose.yml'), 'utf8');
  assert.ok(compose.includes('# custom compose'), 'custom compose preserved');
});

test('ensureGlobalDir patches Redis port into existing compose without it', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  const loreDir = path.join(home, '.lore');
  fs.mkdirSync(loreDir, { recursive: true });
  // Compose with lore-memory but no Redis port
  fs.writeFileSync(path.join(loreDir, 'docker-compose.yml'), [
    'services:',
    '  lore-memory:',
    '    image: redis/redis-stack-server:latest',
    '    volumes:',
    '      - ./redis-data:/data',
    '',
  ].join('\n'));
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  mod.ensureGlobalDir();
  const compose = fs.readFileSync(path.join(loreDir, 'docker-compose.yml'), 'utf8');
  assert.ok(compose.includes("'6379:6379'"), 'Redis port patched in');
});

test('ensureGlobalDir is idempotent', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  mod.ensureGlobalDir();
  // Run again — should not throw or duplicate content
  const { mod: mod2, restore: restore2 } = loadGlobal(home);
  t.after(restore2);
  mod2.ensureGlobalDir();
  const env = fs.readFileSync(path.join(home, '.lore', '.env'), 'utf8');
  assert.equal(env.match(/LORE_TOKEN=/g).length, 1, 'no duplicate token');
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

// --- getRedisPort ---

test('getRedisPort returns 6379 when no config exists', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  assert.equal(mod.getRedisPort(), 6379);
});

test('getRedisPort reads custom port from config', (t) => {
  const home = tmpHome();
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); });
  const loreDir = path.join(home, '.lore');
  fs.mkdirSync(loreDir, { recursive: true });
  fs.writeFileSync(path.join(loreDir, 'config.json'), JSON.stringify({ redisPort: 7777 }));
  const { mod, restore } = loadGlobal(home);
  t.after(restore);
  assert.equal(mod.getRedisPort(), 7777);
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
