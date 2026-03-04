const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// validate-consistency.sh uses: REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
// So: tmp/.lore/harness/scripts/validate-consistency.sh → REPO_ROOT=tmp/

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-validate-'));
  fs.mkdirSync(path.join(dir, '.lore', 'harness', 'scripts', 'lib'), { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, '..', '.lore', 'harness', 'scripts', 'validate-consistency.sh'),
    path.join(dir, '.lore', 'harness', 'scripts', 'validate-consistency.sh'),
  );
  fs.copyFileSync(
    path.join(__dirname, '..', '.lore', 'harness', 'scripts', 'lib', 'common.sh'),
    path.join(dir, '.lore', 'harness', 'scripts', 'lib', 'common.sh'),
  );
  fs.mkdirSync(path.join(dir, '.lore', 'AGENTIC', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.claude', 'skills'), { recursive: true });
  // Canonical instructions + generated copies
  const instructions = '# Lore\n\nTest instructions.\n';
  fs.writeFileSync(path.join(dir, '.lore', 'instructions.md'), instructions);
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), instructions);
  // lore-core.mdc = frontmatter + instructions body (replaces .cursorrules)
  fs.mkdirSync(path.join(dir, '.cursor', 'rules'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.cursor', 'rules', 'lore-core.mdc'),
    '---\nalwaysApply: true\n---\n\n' + instructions,
  );
  // Required rules
  fs.mkdirSync(path.join(dir, '.lore', 'AGENTIC', 'rules'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.lore', 'AGENTIC', 'rules', 'security.md'), '# Security\n');
  return dir;
}

function runScript(dir) {
  try {
    const out = execSync(`bash "${path.join(dir, '.lore', 'harness', 'scripts', 'validate-consistency.sh')}"`, {
      cwd: dir,
      encoding: 'utf8',
    });
    return { code: 0, stdout: out };
  } catch (e) {
    return { code: e.status, stdout: e.stdout || '' };
  }
}

test('passes with empty repo', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { code, stdout } = runScript(dir);
  assert.equal(code, 0);
  assert.ok(stdout.includes('PASSED'));
});

test('passes: fully consistent setup', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  // Create type: command skill in canonical location and mirror to platform copy
  const skillDir = path.join(dir, '.lore', 'AGENTIC', 'skills', 'test-skill');
  fs.mkdirSync(skillDir);
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    [
      '---',
      'name: test-skill',
      'description: A complete test skill',
      'type: command',
      'user-invocable: false',
      '---',
      '# Test Skill',
    ].join('\n'),
  );
  const copyDir = path.join(dir, '.claude', 'skills', 'test-skill');
  fs.mkdirSync(copyDir, { recursive: true });
  fs.copyFileSync(path.join(skillDir, 'SKILL.md'), path.join(copyDir, 'SKILL.md'));

  const { code, stdout } = runScript(dir);
  assert.equal(code, 0);
  assert.ok(stdout.includes('PASSED'));
});

test('fails: CLAUDE.md out of sync with .lore/instructions.md', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Make CLAUDE.md differ from canonical
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Stale copy\n');
  const { code, stdout } = runScript(dir);
  assert.equal(code, 1);
  assert.ok(stdout.includes('CLAUDE.md out of sync'));
});

test('fails: lore-core.mdc body out of sync with .lore/instructions.md', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Make lore-core.mdc body differ from canonical instructions
  fs.writeFileSync(
    path.join(dir, '.cursor', 'rules', 'lore-core.mdc'),
    '---\nalwaysApply: true\n---\n\n# Stale copy\n',
  );
  const { code, stdout } = runScript(dir);
  assert.equal(code, 1);
  assert.ok(stdout.includes('lore-core.mdc body out of sync'));
});

test('fails: Cursor hooks.json references missing script', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, '.cursor'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.cursor', 'hooks.json'),
    JSON.stringify({
      hooks: {
        beforeSubmitPrompt: [{ command: 'node .cursor/hooks/banner-inject.js' }],
      },
    }),
  );
  // Don't create the actual hook script
  const { code, stdout } = runScript(dir);
  assert.equal(code, 1);
  assert.ok(stdout.includes('missing script'));
});

test('passes: Cursor hooks.json with existing scripts', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, '.cursor', 'hooks'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.cursor', 'hooks.json'),
    JSON.stringify({
      hooks: {
        beforeSubmitPrompt: [{ command: 'node .cursor/hooks/banner-inject.js' }],
      },
    }),
  );
  fs.writeFileSync(path.join(dir, '.cursor', 'hooks', 'banner-inject.js'), '// stub');
  const { code, stdout } = runScript(dir);
  assert.equal(code, 0);
  assert.ok(stdout.includes('PASSED'));
});

test('fails: platform copy out of sync with canonical source', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  // Create type: command skill in .lore/ only (no platform copy)
  const skillDir = path.join(dir, '.lore', 'AGENTIC', 'skills', 'sync-test');
  fs.mkdirSync(skillDir);
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    ['---', 'name: sync-test', 'description: Tests sync detection', 'type: command', '---'].join('\n'),
  );

  const { code, stdout } = runScript(dir);
  assert.equal(code, 1);
  assert.ok(stdout.includes('out of sync') || stdout.includes('sync-platform-skills.sh'));
});
