const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// generate-nav.sh uses: REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
// So: tmp/scripts/generate-nav.sh → REPO_ROOT=tmp/

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-nav-'));
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, '..', 'scripts', 'generate-nav.sh'),
    path.join(dir, 'scripts', 'generate-nav.sh')
  );
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'index.md'), '# Home\n');
  return dir;
}

function runScript(dir) {
  const out = execSync(`bash "${path.join(dir, 'scripts', 'generate-nav.sh')}"`, {
    cwd: dir,
    encoding: 'utf8',
  });
  return { stdout: out, nav: fs.readFileSync(path.join(dir, 'mkdocs.yml'), 'utf8') };
}

test('generates nav with Work section and index page for minimal repo', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { nav } = runScript(dir);
  assert.ok(nav.includes('nav:'));
  assert.ok(nav.includes('- Work:'));
  assert.ok(nav.includes('- index.md'));
  assert.ok(!nav.includes('- Overview:'), 'should not have separate Overview entries');
});

test('includes work subsections under Work with active roadmap', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const roadmap = path.join(dir, 'docs', 'work', 'roadmaps', 'v1-launch');
  fs.mkdirSync(roadmap, { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'work', 'index.md'), '# Work\n');
  fs.writeFileSync(path.join(roadmap, 'index.md'), '# V1 Launch\n');

  const { nav } = runScript(dir);
  assert.ok(nav.includes('- Work:'));
  assert.ok(nav.includes('- Roadmaps:'));
  assert.ok(nav.includes('V1 Launch'));
});

test('includes archive directories in nav sorted last', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const roadmap = path.join(dir, 'docs', 'work', 'roadmaps', 'active-roadmap');
  const archive = path.join(dir, 'docs', 'work', 'roadmaps', 'active-roadmap', 'archive', 'old-plan');
  fs.mkdirSync(roadmap, { recursive: true });
  fs.mkdirSync(archive, { recursive: true });
  fs.writeFileSync(path.join(roadmap, 'index.md'), '# Active\n');
  fs.writeFileSync(path.join(archive, 'index.md'), '# Old Plan\n');

  const { nav } = runScript(dir);
  assert.ok(nav.includes('Active Roadmap'));
  assert.ok(nav.includes('Archive'), 'archive should appear in nav');
  assert.ok(nav.includes('Old Plan'), 'archived content should appear in nav');
  // Archive should come after the active roadmap entry
  const activePos = nav.indexOf('Active Roadmap');
  const archivePos = nav.indexOf('Archive');
  assert.ok(archivePos > activePos, 'archive should sort after active content');
});

test('work subsections always appear even with only archive content', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const archive = path.join(dir, 'docs', 'work', 'roadmaps', 'archive', 'old-roadmap');
  fs.mkdirSync(archive, { recursive: true });
  fs.writeFileSync(path.join(archive, 'index.md'), '# Old\n');

  const { nav } = runScript(dir);
  assert.ok(nav.includes('- Roadmaps:'), 'Roadmaps subsection should always appear');
  assert.ok(nav.includes('Old Roadmap'), 'archived content should appear in nav');
});

test('includes Context section when content exists', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ctx = path.join(dir, 'docs', 'context');
  fs.mkdirSync(ctx, { recursive: true });
  fs.writeFileSync(path.join(ctx, 'conventions.md'), '# Conventions\n');

  const { nav } = runScript(dir);
  assert.ok(nav.includes('- Context:'));
  assert.ok(nav.includes('- Conventions: context/conventions.md'));
});

test('preserves existing mkdocs.yml header when regenerating', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Write a custom mkdocs.yml before running the script
  const customHeader = [
    'site_name: My Custom Site',
    'theme:',
    '  name: material',
    '  palette:',
    '    primary: deep purple',
    'plugins:',
    '  - search',
    '  - tags',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'mkdocs.yml'), customHeader + 'nav:\n  - Home: index.md\n');

  const { nav } = runScript(dir);
  assert.ok(nav.includes('site_name: My Custom Site'), 'should preserve site_name');
  assert.ok(nav.includes('primary: deep purple'), 'should preserve theme config');
  assert.ok(nav.includes('- tags'), 'should preserve plugins');
  assert.ok(nav.includes('nav:'), 'should still have nav section');
});

test('auto-scaffold creates index.md when dir has .md files but no index.md', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ctx = path.join(dir, 'docs', 'context');
  const sub = path.join(ctx, 'inventory');
  fs.mkdirSync(sub, { recursive: true });
  fs.writeFileSync(path.join(sub, 'repos.md'), '# Repos\n');
  // No index.md in inventory/

  const { nav } = runScript(dir);
  // Should have auto-created index.md
  assert.ok(fs.existsSync(path.join(sub, 'index.md')), 'index.md should be auto-scaffolded');
  assert.ok(nav.includes('- context/inventory/index.md'));
  assert.ok(nav.includes('- Inventory:'));
});

test('agent-rules.md appears after Context overview before other content', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ctx = path.join(dir, 'docs', 'context');
  fs.mkdirSync(ctx, { recursive: true });
  fs.writeFileSync(path.join(ctx, 'index.md'), '# Context\n');
  fs.writeFileSync(path.join(ctx, 'agent-rules.md'), '# Agent Rules\n');
  fs.writeFileSync(path.join(ctx, 'conventions.md'), '# Conventions\n');

  const { nav } = runScript(dir);
  assert.ok(nav.includes('- Agent Rules: context/agent-rules.md'));
  // Agent rules should come before conventions
  const agentPos = nav.indexOf('Agent Rules: context/agent-rules.md');
  const convPos = nav.indexOf('Conventions: context/conventions.md');
  assert.ok(agentPos < convPos, 'agent-rules should appear before conventions');
  // Agent rules should not appear twice (scan_dir skips it)
  const firstIdx = nav.indexOf('Agent Rules');
  const lastIdx = nav.lastIndexOf('Agent Rules');
  assert.equal(firstIdx, lastIdx, 'agent-rules should appear exactly once');
});
