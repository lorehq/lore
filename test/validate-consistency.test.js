const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// validate-consistency.sh uses: REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
// So: tmp/scripts/validate-consistency.sh → REPO_ROOT=tmp/

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-validate-'));
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, '..', 'scripts', 'validate-consistency.sh'),
    path.join(dir, 'scripts', 'validate-consistency.sh')
  );
  fs.mkdirSync(path.join(dir, '.claude', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.claude', 'agents'), { recursive: true });
  // Empty registry files
  fs.writeFileSync(path.join(dir, 'skills-registry.md'), '| Skill | Domain | Description |\n|---|---|---|\n');
  fs.writeFileSync(path.join(dir, 'agent-registry.md'), '| Agent | Domain | Description |\n|---|---|---|\n');
  return dir;
}

function runScript(dir) {
  try {
    const out = execSync(`bash "${path.join(dir, 'scripts', 'validate-consistency.sh')}"`, {
      cwd: dir,
      encoding: 'utf8',
    });
    return { code: 0, stdout: out };
  } catch (e) {
    return { code: e.status, stdout: e.stdout || '' };
  }
}

test('passes with empty repo', () => {
  const dir = setup();
  const { code, stdout } = runScript(dir);
  assert.equal(code, 0);
  assert.ok(stdout.includes('PASSED'));
});

test('fails: skill directory missing from registry', () => {
  const dir = setup();
  const skillDir = path.join(dir, '.claude', 'skills', 'my-skill');
  fs.mkdirSync(skillDir);
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), [
    '---',
    'name: my-skill',
    'domain: Testing',
    'description: A test skill',
    '---',
  ].join('\n'));
  const { code, stdout } = runScript(dir);
  assert.equal(code, 1);
  assert.ok(stdout.includes("Skill 'my-skill' not in skills-registry.md"));
});

test('fails: registry skill has no directory on disk', () => {
  const dir = setup();
  fs.writeFileSync(path.join(dir, 'skills-registry.md'), [
    '| Skill | Domain | Description |',
    '|---|---|---|',
    '| ghost-skill | Testing | Does not exist |',
  ].join('\n'));
  const { code, stdout } = runScript(dir);
  assert.equal(code, 1);
  assert.ok(stdout.includes("Registry skill 'ghost-skill' has no directory"));
});

test('fails: skill missing required frontmatter field', () => {
  const dir = setup();
  const skillDir = path.join(dir, '.claude', 'skills', 'bad-skill');
  fs.mkdirSync(skillDir);
  // Missing 'domain' field
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), [
    '---',
    'name: bad-skill',
    'description: Missing domain',
    '---',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'skills-registry.md'), [
    '| Skill | Domain | Description |',
    '|---|---|---|',
    '| bad-skill | Testing | Bad skill |',
  ].join('\n'));
  const { code, stdout } = runScript(dir);
  assert.equal(code, 1);
  assert.ok(stdout.includes("Skill 'bad-skill' missing 'domain'"));
});

test('fails: agent references non-existent skill', () => {
  const dir = setup();
  fs.writeFileSync(path.join(dir, '.claude', 'agents', 'test-agent.md'), [
    '---',
    'name: test-agent',
    'domain: Testing',
    'description: A test agent',
    'model: sonnet',
    'skills:',
    '  - nonexistent-skill',
    '---',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'agent-registry.md'), [
    '| Agent | Domain | Description |',
    '|---|---|---|',
    '| test-agent | Testing | Test agent |',
  ].join('\n'));
  const { code, stdout } = runScript(dir);
  assert.equal(code, 1);
  assert.ok(stdout.includes("references missing skill 'nonexistent-skill'"));
});

test('passes: fully consistent setup', () => {
  const dir = setup();

  // Create skill
  const skillDir = path.join(dir, '.claude', 'skills', 'test-skill');
  fs.mkdirSync(skillDir);
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), [
    '---',
    'name: test-skill',
    'domain: Testing',
    'description: A complete test skill',
    '---',
    '# Test Skill',
  ].join('\n'));

  // Create agent that references the skill
  fs.writeFileSync(path.join(dir, '.claude', 'agents', 'test-agent.md'), [
    '---',
    'name: test-agent',
    'domain: Testing',
    'description: A complete test agent',
    'model: sonnet',
    'skills:',
    '  - test-skill',
    '---',
    '# Test Agent',
  ].join('\n'));

  // Registries reference both
  fs.writeFileSync(path.join(dir, 'skills-registry.md'), [
    '| Skill | Domain | Description |',
    '|---|---|---|',
    '| test-skill | Testing | A complete test skill |',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'agent-registry.md'), [
    '| Agent | Domain | Description |',
    '|---|---|---|',
    '| test-agent | Testing | A complete test agent |',
  ].join('\n'));

  const { code, stdout } = runScript(dir);
  assert.equal(code, 0);
  assert.ok(stdout.includes('PASSED'));
});
