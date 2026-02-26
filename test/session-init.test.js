const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// session-init.js uses __dirname:
//   require('../lib/banner') → .lore/lib/banner.js
//   root = path.join(__dirname, '../..') → parent of .lore/
// So temp structure needs: tmp/.lore/hooks/session-init.js + tmp/.lore/lib/banner.js
// and all data files under tmp/

function setup(opts = {}) {
  // realpathSync: macOS /var → /private/var symlink must match process.cwd() in children
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-session-')));
  fs.mkdirSync(path.join(dir, '.lore', 'hooks'), { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, '..', '.lore', 'hooks', 'session-init.js'),
    path.join(dir, '.lore', 'hooks', 'session-init.js'),
  );
  // Shared lib — hook resolves ../lib/ relative to .lore/hooks/
  const libDir = path.join(dir, '.lore', 'lib');
  fs.mkdirSync(libDir, { recursive: true });
  for (const f of fs.readdirSync(path.join(__dirname, '..', '.lore', 'lib'))) {
    fs.copyFileSync(path.join(__dirname, '..', '.lore', 'lib', f), path.join(libDir, f));
  }

  // Templates — sticky files read from .lore/templates/
  const tplSrc = path.join(__dirname, '..', '.lore', 'templates');
  const tplDir = path.join(dir, '.lore', 'templates');
  fs.cpSync(tplSrc, tplDir, { recursive: true });

  // Minimal structure so the hook doesn't error
  fs.mkdirSync(path.join(dir, 'docs', 'workflow', 'in-flight', 'initiatives'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs', 'workflow', 'in-flight', 'epics'), { recursive: true });
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
    fs.mkdirSync(path.join(dir, 'docs', 'context'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs', 'context', 'rules.md'), opts.rules);
  }
  if (opts.rulesDir) {
    const rulesDir = path.join(dir, 'docs', 'context', 'rules');
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
  return execSync(`node "${path.join(dir, '.lore', 'hooks', 'session-init.js')}"`, {
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

test('dirs-only tree skips archive directories', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'docs', 'workflow', 'in-flight', 'initiatives', 'archive', 'old-item'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'workflow', 'in-flight', 'initiatives', 'archive', 'old-item', 'index.md'), '# Old');
  const out = runHook(dir);
  assert.ok(!out.includes('archive/'), 'archive/ should be skipped from tree');
});

test('creates sticky docs/knowledge/local/ when missing', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const localIndex = path.join(dir, 'docs', 'knowledge', 'local', 'index.md');
  assert.ok(!fs.existsSync(localIndex), 'should not exist before hook runs');
  runHook(dir);
  assert.ok(fs.existsSync(localIndex), 'local/index.md should be created');
  const content = fs.readFileSync(localIndex, 'utf8');
  assert.ok(content.includes('Local Notes'));
  assert.ok(content.includes('gitignored'));
});

test('creates sticky docs/context/agent-rules.md when missing', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const rulesPath = path.join(dir, 'docs', 'context', 'agent-rules.md');
  assert.ok(!fs.existsSync(rulesPath), 'should not exist before hook runs');
  runHook(dir);
  assert.ok(fs.existsSync(rulesPath), 'agent-rules.md should be created');
  const content = fs.readFileSync(rulesPath, 'utf8');
  assert.ok(content.includes('# Agent Rules'));
  assert.ok(content.includes('PROJECT context'));
  assert.ok(!content.includes('Coding Rules'), 'template should not contain coding rules');
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

test('scaffolds rules even though hook output is dynamic-only', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = runHook(dir);
  // Rules are static content — not in hook output but scaffolding still runs
  assert.ok(!out.includes('RULES:'), 'rules belong in CLAUDE.md, not hook output');
  assert.ok(fs.existsSync(path.join(dir, 'docs', 'context', 'rules', 'index.md')));
});

test('creates sticky rules directory scaffold when neither path exists', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const rulesDir = path.join(dir, 'docs', 'context', 'rules');
  assert.ok(!fs.existsSync(rulesDir), 'should not exist before hook runs');
  runHook(dir);
  assert.ok(fs.existsSync(path.join(rulesDir, 'index.md')), 'index.md should be created');
  assert.ok(fs.existsSync(path.join(rulesDir, 'documentation.md')), 'documentation.md should be created');
  assert.ok(fs.existsSync(path.join(rulesDir, 'coding.md')), 'coding.md should be created');
  assert.ok(fs.existsSync(path.join(rulesDir, 'security.md')), 'security.md should be created');
  const docsContent = fs.readFileSync(path.join(rulesDir, 'documentation.md'), 'utf8');
  assert.ok(docsContent.includes('Duplicate') || docsContent.includes('Documentation'));
});

test('does not overwrite existing rules.md with scaffold', (t) => {
  const dir = setup({
    rules: '# My Custom Rules\n\nOperator rules here.',
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  runHook(dir);
  const content = fs.readFileSync(path.join(dir, 'docs', 'context', 'rules.md'), 'utf8');
  assert.ok(content.includes('My Custom Rules'), 'should preserve operator content');
  assert.ok(
    !fs.existsSync(path.join(dir, 'docs', 'context', 'rules', 'index.md')),
    'should not create scaffold when flat file exists',
  );
});

test('does not overwrite existing rules directory with scaffold', (t) => {
  const dir = setup({
    rulesDir: { 'index.md': '# My Rules\n\nCustom.' },
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  runHook(dir);
  const content = fs.readFileSync(path.join(dir, 'docs', 'context', 'rules', 'index.md'), 'utf8');
  assert.ok(content.includes('My Rules'), 'should preserve operator content');
  // Seed files are created individually even when dir exists
  assert.ok(fs.existsSync(path.join(dir, 'docs', 'context', 'rules', 'coding.md')), 'should create seed rule files');
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

test('creates sticky operator-profile.md when missing', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const profilePath = path.join(dir, 'docs', 'knowledge', 'local', 'operator-profile.md');
  assert.ok(!fs.existsSync(profilePath), 'should not exist before hook runs');
  runHook(dir);
  assert.ok(fs.existsSync(profilePath), 'operator-profile.md should be created');
  const content = fs.readFileSync(profilePath, 'utf8');
  assert.ok(content.includes('# Operator Profile'));
  assert.ok(content.includes('OPERATOR PROFILE context'));
});

test('does not inject default operator profile template', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = runHook(dir);
  assert.ok(!out.includes('OPERATOR PROFILE:'), 'default template should not be injected');
});

test('injects customized operator profile', (t) => {
  const dir = setup({
    operatorProfile: '# Operator Profile\n\n## Identity\n\n- **Name:** Jane Doe\n- **Role:** Staff Engineer',
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = runHook(dir);
  assert.ok(out.includes('OPERATOR PROFILE:'), 'should inject customized profile');
  assert.ok(out.includes('Jane Doe'));
  assert.ok(out.includes('Staff Engineer'));
});

test('hook outputs operator profile without static content', (t) => {
  const dir = setup({
    agentRules: '# My Project\n\nProject rules here.',
    operatorProfile: '# Operator Profile\n\n- **Name:** Jane Doe\n- **Role:** Lead Dev',
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = runHook(dir);
  // Hook output is dynamic-only — operator profile appears but PROJECT is in CLAUDE.md
  assert.ok(out.includes('OPERATOR PROFILE:'), 'operator profile is dynamic content');
  assert.ok(out.includes('Jane Doe'));
  assert.ok(!out.includes('PROJECT:'), 'project context belongs in CLAUDE.md');
});

test('does not overwrite existing operator-profile.md with scaffold', (t) => {
  const dir = setup({
    operatorProfile: '# Operator Profile\n\nCustom operator content here.',
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  runHook(dir);
  const content = fs.readFileSync(path.join(dir, 'docs', 'knowledge', 'local', 'operator-profile.md'), 'utf8');
  assert.ok(content.includes('Custom operator content here.'), 'should preserve operator content');
});
