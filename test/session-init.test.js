const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// session-init.js uses __dirname:
//   require('../lib/banner') → .lore/harness/lib/banner.js
//   root = path.join(__dirname, '../../..') → parent of .lore/
// So temp structure needs: tmp/.lore/harness/hooks/session-init.js + tmp/.lore/harness/lib/banner.js
// and all data files under tmp/

function setup(opts = {}) {
  // realpathSync: macOS /var → /private/var symlink must match process.cwd() in children
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-session-')));
  fs.mkdirSync(path.join(dir, '.lore', 'harness', 'hooks'), { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, '..', '.lore', 'harness', 'hooks', 'session-init.js'),
    path.join(dir, '.lore', 'harness', 'hooks', 'session-init.js'),
  );
  // Shared lib — hook resolves ../lib/ relative to .lore/harness/hooks/
  const libDir = path.join(dir, '.lore', 'harness', 'lib');
  fs.mkdirSync(libDir, { recursive: true });
  for (const f of fs.readdirSync(path.join(__dirname, '..', '.lore', 'harness', 'lib'))) {
    fs.copyFileSync(path.join(__dirname, '..', '.lore', 'harness', 'lib', f), path.join(libDir, f));
  }

  // Templates — sticky files read from .lore/harness/templates/
  const tplSrc = path.join(__dirname, '..', '.lore', 'harness', 'templates');
  const tplDir = path.join(dir, '.lore', 'harness', 'templates');
  fs.cpSync(tplSrc, tplDir, { recursive: true });

  // Minimal structure so the hook doesn't error
  fs.mkdirSync(path.join(dir, '.lore', 'skills'), { recursive: true });

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
  if (opts.rules) {
    fs.mkdirSync(path.join(dir, '.lore'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.lore', 'rules.md'), opts.rules);
  }
  if (opts.rulesDir) {
    const rulesDir = path.join(dir, '.lore', 'rules');
    fs.mkdirSync(rulesDir, { recursive: true });
    for (const [name, content] of Object.entries(opts.rulesDir)) {
      fs.writeFileSync(path.join(rulesDir, name), content);
    }
  }
  if (opts.memory) {
    fs.writeFileSync(path.join(dir, '.lore', 'memory.local.md'), opts.memory);
  }
  if (opts.operatorProfile) {
    fs.mkdirSync(path.join(dir, 'docs', 'knowledge', 'local'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs', 'knowledge', 'local', 'operator-profile.md'), opts.operatorProfile);
  }

  return dir;
}

function runHook(dir) {
  return execSync(`node "${path.join(dir, '.lore', 'harness', 'hooks', 'session-init.js')}"`, {
    cwd: dir,
    encoding: 'utf8',
  });
}

test('hook output excludes static version header', (t) => {
  const dir = setup({ config: { version: '1.2.3' } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = runHook(dir);
  // Version is static content — baked into CLAUDE.md at generation time
  assert.ok(!out.includes('=== LORE'), 'version header belongs in CLAUDE.md, not hook output');
});

test('hook output excludes static worker list', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = runHook(dir);
  // Worker list is static content — baked into CLAUDE.md
  assert.ok(!out.includes('(none yet)'), 'worker list belongs in CLAUDE.md, not hook output');
});

test('hook output excludes static initiatives', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const rmDir = path.join(dir, 'docs', 'workflow', 'in-flight', 'initiatives', 'my-initiative');
  fs.mkdirSync(rmDir, { recursive: true });
  fs.writeFileSync(
    path.join(rmDir, 'index.md'),
    ['---', 'title: My Initiative', 'status: active', 'summary: Phase 1 in progress', '---', '# My Initiative'].join('\n'),
  );
  const out = runHook(dir);
  // Initiatives are static content — baked into CLAUDE.md
  assert.ok(!out.includes('ACTIVE INITIATIVES:'), 'initiatives belong in CLAUDE.md, not hook output');
});

test('hook output excludes static on-hold labels', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const rmDir = path.join(dir, 'docs', 'workflow', 'in-flight', 'initiatives', 'paused');
  fs.mkdirSync(rmDir, { recursive: true });
  fs.writeFileSync(path.join(rmDir, 'index.md'), ['---', 'title: Paused Initiative', 'status: on-hold', '---'].join('\n'));
  const out = runHook(dir);
  // On-hold labels are static content — baked into CLAUDE.md
  assert.ok(!out.includes('[ON HOLD]'), 'on-hold labels belong in CLAUDE.md, not hook output');
});

test('hook output excludes static PROJECT context', (t) => {
  const dir = setup({
    agentRules: '---\ntitle: Agent Rules\n---\n\n# My Project\n\nCustom agent rules here.',
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = runHook(dir);
  // PROJECT is static content — baked into CLAUDE.md
  assert.ok(!out.includes('PROJECT:'), 'project context belongs in CLAUDE.md, not hook output');
});

test('creates MEMORY.local.md if missing', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const memPath = path.join(dir, '.lore', 'memory.local.md');
  assert.ok(!fs.existsSync(memPath), 'should not exist before hook runs');
  runHook(dir);
  assert.ok(fs.existsSync(memPath), 'should be created by hook');
  assert.equal(fs.readFileSync(memPath, 'utf8'), '# Local Memory\n');
});

test('hook output excludes static knowledge map', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, '.lore', 'skills', 'my-skill'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.lore', 'skills', 'my-skill', 'SKILL.md'), '# Skill');
  const out = runHook(dir);
  // Knowledge map is static content — baked into CLAUDE.md
  assert.ok(!out.includes('KNOWLEDGE MAP:'), 'knowledge map belongs in CLAUDE.md, not hook output');
});

test('hook output excludes static rules directory', (t) => {
  const dir = setup({
    rulesDir: {
      'index.md': '# Rules\n\nOverview here.',
      'coding.md': '# Coding\n\nSimplicity first.',
      'docs.md': '# Docs\n\nUse checkboxes.',
    },
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = runHook(dir);
  // Rules are static content — baked into CLAUDE.md
  assert.ok(!out.includes('RULES:'), 'rules belong in CLAUDE.md, not hook output');
});

test('hook output excludes static rules.md fallback', (t) => {
  const dir = setup({
    rules: '# Rules\n\nFlat file rules.',
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = runHook(dir);
  // Rules are static content — baked into CLAUDE.md
  assert.ok(!out.includes('RULES:'), 'rules belong in CLAUDE.md, not hook output');
});

test('hook output excludes static knowledge map regardless of treeDepth', (t) => {
  const dir = setup({ config: { treeDepth: 1 } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'docs', 'level1', 'level2', 'level3'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'level1', 'a.md'), '# A');
  fs.writeFileSync(path.join(dir, 'docs', 'level1', 'level2', 'b.md'), '# B');
  fs.writeFileSync(path.join(dir, 'docs', 'level1', 'level2', 'level3', 'c.md'), '# C');
  const out = runHook(dir);
  // Knowledge map is static content — baked into CLAUDE.md (treeDepth tested in banner.test.js)
  assert.ok(!out.includes('KNOWLEDGE MAP:'), 'knowledge map belongs in CLAUDE.md, not hook output');
});

test('does not inject default operator profile template', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = runHook(dir);
  assert.ok(!out.includes('OPERATOR PROFILE:'), 'default template should not be injected');
});

test('does not inject project-local operator profile (global directory-only now)', (t) => {
  const dir = setup({
    operatorProfile: '# Operator Profile\n\n## Identity\n\n- **Name:** Jane Doe\n- **Role:** Staff Engineer',
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = runHook(dir);
  // Operator profile is now read from the global directory (~/.lore/knowledge-base/operator/), not the project
  assert.ok(!out.includes('Jane Doe'), 'project-local operator profile should not be injected');
});

test('hook output excludes both project-local operator profile and static PROJECT', (t) => {
  const dir = setup({
    agentRules: '# My Project\n\nProject rules here.',
    operatorProfile: '# Operator Profile\n\n- **Name:** Jane Doe\n- **Role:** Lead Dev',
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = runHook(dir);
  // Operator profile is now global directory-only; project-local path is not read by buildDynamicBanner
  assert.ok(!out.includes('Jane Doe'), 'project-local operator profile should not be injected');
  assert.ok(!out.includes('PROJECT:'), 'project context belongs in CLAUDE.md');
});

// --- Global directory version mismatch warning ---

test('emits version mismatch warning when global dir is behind', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Create a migrations dir with a migration requiring version 1
  const migrationsDir = path.join(dir, '.lore', 'harness', 'migrations');
  fs.mkdirSync(migrationsDir, { recursive: true });
  fs.writeFileSync(
    path.join(migrationsDir, '001-initial.js'),
    'exports.version = 1; exports.up = function() {};',
  );
  // HOME override so getGlobalStructureVersion() returns 0 (no config)
  const fakeHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-home-')));
  t.after(() => fs.rmSync(fakeHome, { recursive: true, force: true }));
  const out = execSync(`node "${path.join(dir, '.lore', 'harness', 'hooks', 'session-init.js')}"`, {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, HOME: fakeHome },
  });
  assert.ok(out.includes('LORE-GLOBAL-VERSION-MISMATCH'), 'should show mismatch warning');
  assert.ok(out.includes('v0'), 'should show current version 0');
  assert.ok(out.includes('v1'), 'should show required version 1');
  assert.ok(out.includes('/lore update'), 'should suggest /lore update');
});

test('no version mismatch warning when versions match', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Create a migrations dir
  const migrationsDir = path.join(dir, '.lore', 'harness', 'migrations');
  fs.mkdirSync(migrationsDir, { recursive: true });
  fs.writeFileSync(
    path.join(migrationsDir, '001-initial.js'),
    'exports.version = 1; exports.up = function() {};',
  );
  // Set global version to 1 (matches required)
  const fakeHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-home-')));
  t.after(() => fs.rmSync(fakeHome, { recursive: true, force: true }));
  fs.mkdirSync(path.join(fakeHome, '.lore'), { recursive: true });
  fs.writeFileSync(
    path.join(fakeHome, '.lore', 'config.json'),
    JSON.stringify({ globalStructureVersion: 1 }),
  );
  const out = execSync(`node "${path.join(dir, '.lore', 'harness', 'hooks', 'session-init.js')}"`, {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, HOME: fakeHome },
  });
  assert.ok(!out.includes('LORE-GLOBAL-VERSION-MISMATCH'), 'should not show mismatch warning');
});

test('no version mismatch warning when no migrations dir exists', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // No migrations dir — older harness. requiredVersion = 0, so no warning
  const fakeHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-home-')));
  t.after(() => fs.rmSync(fakeHome, { recursive: true, force: true }));
  const out = execSync(`node "${path.join(dir, '.lore', 'harness', 'hooks', 'session-init.js')}"`, {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, HOME: fakeHome },
  });
  assert.ok(!out.includes('LORE-GLOBAL-VERSION-MISMATCH'), 'should not show warning without migrations');
});

