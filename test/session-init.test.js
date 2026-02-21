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
  fs.mkdirSync(tplDir, { recursive: true });
  for (const f of fs.readdirSync(tplSrc)) {
    fs.copyFileSync(path.join(tplSrc, f), path.join(tplDir, f));
  }

  // Minimal structure so the hook doesn't error
  fs.mkdirSync(path.join(dir, 'docs', 'work', 'roadmaps'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs', 'work', 'plans'), { recursive: true });
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
  if (opts.conventions) {
    fs.mkdirSync(path.join(dir, 'docs', 'context'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs', 'context', 'conventions.md'), opts.conventions);
  }
  if (opts.conventionsDir) {
    const convDir = path.join(dir, 'docs', 'context', 'conventions');
    fs.mkdirSync(convDir, { recursive: true });
    for (const [name, content] of Object.entries(opts.conventionsDir)) {
      fs.writeFileSync(path.join(convDir, name), content);
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

test('shows version from .lore-config', (t) => {
  const dir = setup({ config: { version: '1.2.3' } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = runHook(dir);
  assert.ok(out.includes('=== LORE v1.2.3 ==='));
});

test('shows "(none yet)" when no agents', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = runHook(dir);
  assert.ok(out.includes('(none yet)'));
});

test('shows active roadmap title and summary', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const rmDir = path.join(dir, 'docs', 'work', 'roadmaps', 'my-roadmap');
  fs.mkdirSync(rmDir, { recursive: true });
  fs.writeFileSync(
    path.join(rmDir, 'index.md'),
    ['---', 'title: My Roadmap', 'status: active', 'summary: Phase 1 in progress', '---', '# My Roadmap'].join('\n'),
  );
  const out = runHook(dir);
  assert.ok(out.includes('ACTIVE ROADMAPS:'));
  assert.ok(out.includes('My Roadmap (Phase 1 in progress)'));
});

test('shows on-hold label', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const rmDir = path.join(dir, 'docs', 'work', 'roadmaps', 'paused');
  fs.mkdirSync(rmDir, { recursive: true });
  fs.writeFileSync(path.join(rmDir, 'index.md'), ['---', 'title: Paused Roadmap', 'status: on-hold', '---'].join('\n'));
  const out = runHook(dir);
  assert.ok(out.includes('Paused Roadmap [ON HOLD]'));
});

test('reads PROJECT from docs/context/agent-rules.md', (t) => {
  const dir = setup({
    agentRules: '---\ntitle: Agent Rules\n---\n\n# My Project\n\nCustom agent rules here.',
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = runHook(dir);
  assert.ok(out.includes('PROJECT:'));
  assert.ok(out.includes('# My Project'));
  assert.ok(out.includes('Custom agent rules here.'));
  assert.ok(!out.includes('title: Agent Rules'), 'frontmatter should be stripped');
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

test('builds knowledge map tree', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Create some skill directories
  fs.mkdirSync(path.join(dir, '.lore', 'skills', 'my-skill'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.lore', 'skills', 'my-skill', 'SKILL.md'), '# Skill');
  const out = runHook(dir);
  assert.ok(out.includes('KNOWLEDGE MAP:'));
  assert.ok(out.includes('.lore/skills/'));
  assert.ok(out.includes('my-skill/'));
});

test('dirs-only tree skips archive directories', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'docs', 'work', 'roadmaps', 'archive', 'old-item'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'work', 'roadmaps', 'archive', 'old-item', 'index.md'), '# Old');
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

test('injects conventions directory as CONVENTIONS section', (t) => {
  const dir = setup({
    conventionsDir: {
      'index.md': '# Conventions\n\nOverview here.',
      'coding.md': '# Coding\n\nSimplicity first.',
      'docs.md': '# Docs\n\nUse checkboxes.',
    },
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = runHook(dir);
  assert.ok(out.includes('CONVENTIONS:'));
  assert.ok(out.includes('Overview here.'));
  assert.ok(out.includes('Simplicity first.'));
  assert.ok(out.includes('Use checkboxes.'));
});

test('injects flat conventions.md as fallback', (t) => {
  const dir = setup({
    conventions: '# Conventions\n\nFlat file rules.',
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = runHook(dir);
  assert.ok(out.includes('CONVENTIONS:'));
  assert.ok(out.includes('Flat file rules.'));
});

test('scaffolds conventions and includes them when neither path exists', (t) => {
  // ensureStickyFiles now runs before buildBanner, so the scaffold is
  // always present on first run. CONVENTIONS section appears immediately.
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = runHook(dir);
  assert.ok(out.includes('CONVENTIONS:'));
  assert.ok(fs.existsSync(path.join(dir, 'docs', 'context', 'conventions', 'index.md')));
});

test('creates sticky conventions directory scaffold when neither path exists', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const convDir = path.join(dir, 'docs', 'context', 'conventions');
  assert.ok(!fs.existsSync(convDir), 'should not exist before hook runs');
  runHook(dir);
  assert.ok(fs.existsSync(path.join(convDir, 'index.md')), 'index.md should be created');
  assert.ok(fs.existsSync(path.join(convDir, 'docs.md')), 'docs.md should be created');
  assert.ok(fs.existsSync(path.join(convDir, 'coding.md')), 'coding.md should be created');
  const docsContent = fs.readFileSync(path.join(convDir, 'docs.md'), 'utf8');
  assert.ok(docsContent.includes('Checkboxes'));
});

test('does not overwrite existing conventions.md with scaffold', (t) => {
  const dir = setup({
    conventions: '# My Custom Conventions\n\nOperator rules here.',
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  runHook(dir);
  const content = fs.readFileSync(path.join(dir, 'docs', 'context', 'conventions.md'), 'utf8');
  assert.ok(content.includes('My Custom Conventions'), 'should preserve operator content');
  assert.ok(
    !fs.existsSync(path.join(dir, 'docs', 'context', 'conventions', 'index.md')),
    'should not create scaffold when flat file exists',
  );
});

test('does not overwrite existing conventions directory with scaffold', (t) => {
  const dir = setup({
    conventionsDir: { 'index.md': '# My Conventions\n\nCustom.' },
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  runHook(dir);
  const content = fs.readFileSync(path.join(dir, 'docs', 'context', 'conventions', 'index.md'), 'utf8');
  assert.ok(content.includes('My Conventions'), 'should preserve operator content');
  assert.ok(
    !fs.existsSync(path.join(dir, 'docs', 'context', 'conventions', 'docs.md')),
    'should not create extra scaffold files',
  );
});

test('treeDepth config limits knowledge map depth', (t) => {
  const dir = setup({ config: { treeDepth: 1 } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Create a 3-level deep structure under docs/
  fs.mkdirSync(path.join(dir, 'docs', 'level1', 'level2', 'level3'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'level1', 'a.md'), '# A');
  fs.writeFileSync(path.join(dir, 'docs', 'level1', 'level2', 'b.md'), '# B');
  fs.writeFileSync(path.join(dir, 'docs', 'level1', 'level2', 'level3', 'c.md'), '# C');
  const out = runHook(dir);
  assert.ok(out.includes('level1/'), 'depth-0 dir should appear');
  assert.ok(!out.includes('level2/'), 'depth-1 dir should not appear at treeDepth: 1');
  assert.ok(!out.includes('b.md'), 'depth-2 file should not appear');
  assert.ok(!out.includes('c.md'), 'depth-3 file should not appear');
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

test('operator profile appears after PROJECT in banner', (t) => {
  const dir = setup({
    agentRules: '# My Project\n\nProject rules here.',
    operatorProfile: '# Operator Profile\n\n- **Name:** Jane Doe\n- **Role:** Lead Dev',
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = runHook(dir);
  const projectIdx = out.indexOf('PROJECT:');
  const operatorIdx = out.indexOf('OPERATOR PROFILE:');
  const conventionsIdx = out.indexOf('CONVENTIONS:');
  assert.ok(projectIdx > -1, 'PROJECT should be present');
  assert.ok(operatorIdx > -1, 'OPERATOR PROFILE should be present');
  assert.ok(conventionsIdx > -1, 'CONVENTIONS should be present');
  assert.ok(operatorIdx > projectIdx, 'OPERATOR PROFILE should come after PROJECT');
  assert.ok(conventionsIdx > operatorIdx, 'CONVENTIONS should come after OPERATOR PROFILE');
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
