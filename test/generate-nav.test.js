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

test('generates nav with Home entry for minimal repo', () => {
  const dir = setup();
  const { nav } = runScript(dir);
  assert.ok(nav.includes('nav:'));
  assert.ok(nav.includes('- Home: index.md'));
});

test('includes Work section with active roadmap', () => {
  const dir = setup();
  const roadmap = path.join(dir, 'docs', 'work', 'roadmaps', 'v1-launch');
  fs.mkdirSync(roadmap, { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'work', 'index.md'), '# Work\n');
  fs.writeFileSync(path.join(roadmap, 'index.md'), '# V1 Launch\n');

  const { nav } = runScript(dir);
  assert.ok(nav.includes('- Work:'));
  assert.ok(nav.includes('- Roadmaps:'));
  assert.ok(nav.includes('V1 Launch'));
});

test('excludes archive directories from nav output', () => {
  const dir = setup();
  const roadmap = path.join(dir, 'docs', 'work', 'roadmaps', 'active-roadmap');
  const archive = path.join(dir, 'docs', 'work', 'roadmaps', 'active-roadmap', 'archive', 'old-plan');
  fs.mkdirSync(roadmap, { recursive: true });
  fs.mkdirSync(archive, { recursive: true });
  fs.writeFileSync(path.join(roadmap, 'index.md'), '# Active\n');
  fs.writeFileSync(path.join(archive, 'index.md'), '# Old Plan\n');

  const { nav } = runScript(dir);
  assert.ok(nav.includes('Active Roadmap'));
  assert.ok(!nav.includes('Archive'), 'archive should not appear in nav');
  assert.ok(!nav.includes('Old Plan'), 'archived content should not appear in nav');
});

test('no empty sections when only archive content exists', () => {
  const dir = setup();
  // Work dir with only archive content — the bug we fixed
  const archive = path.join(dir, 'docs', 'work', 'roadmaps', 'archive', 'old-roadmap');
  fs.mkdirSync(archive, { recursive: true });
  fs.writeFileSync(path.join(archive, 'index.md'), '# Old\n');

  const { nav } = runScript(dir);
  assert.ok(!nav.includes('- Work:'), 'Work section should not appear when only archive content exists');
  assert.ok(!nav.includes('- Roadmaps:'), 'Roadmaps subsection should not appear when only archive content exists');
});

test('includes Environment section when content exists', () => {
  const dir = setup();
  const env = path.join(dir, 'docs', 'environment');
  fs.mkdirSync(env, { recursive: true });
  fs.writeFileSync(path.join(env, 'conventions.md'), '# Conventions\n');

  const { nav } = runScript(dir);
  assert.ok(nav.includes('- Environment:'));
  assert.ok(nav.includes('- Conventions: environment/conventions.md'));
});

test('preserves existing mkdocs.yml header when regenerating', () => {
  const dir = setup();
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
