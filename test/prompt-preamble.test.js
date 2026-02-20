const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// prompt-preamble.js requires ./lib/parse-agents which requires ../../lib/banner.
// Temp structure: tmp/hooks/prompt-preamble.js, tmp/hooks/lib/parse-agents.js,
// tmp/lib/banner.js (+ other lib files).

function setup(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-preamble-'));
  // Copy hooks
  const hooksDir = path.join(dir, 'hooks', 'lib');
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, '..', 'hooks', 'prompt-preamble.js'),
    path.join(dir, 'hooks', 'prompt-preamble.js'),
  );
  fs.copyFileSync(
    path.join(__dirname, '..', 'hooks', 'lib', 'parse-agents.js'),
    path.join(dir, 'hooks', 'lib', 'parse-agents.js'),
  );
  // Shared lib
  const libDir = path.join(dir, 'lib');
  fs.mkdirSync(libDir, { recursive: true });
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'lib'))) {
    fs.copyFileSync(path.join(__dirname, '..', 'lib', f), path.join(libDir, f));
  }
  if (opts.registry) {
    fs.writeFileSync(path.join(dir, 'agent-registry.md'), opts.registry);
  }
  return dir;
}

function run(dir) {
  return execSync(`node hooks/prompt-preamble.js`, { cwd: dir, encoding: 'utf8' }).trim();
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

test('prompt-preamble: outputs bracketed line', () => {
  const dir = setup();
  try {
    const out = run(dir);
    assert.ok(out.startsWith('['), 'should start with [');
    assert.ok(out.endsWith(']'), 'should end with ]');
  } finally {
    cleanup(dir);
  }
});

test('prompt-preamble: always includes task list reminder', () => {
  const dir = setup();
  try {
    const out = run(dir);
    assert.ok(out.includes('Vague question lookup order'), 'should include lookup-order reminder');
    assert.ok(out.includes('Knowledge -> Work items -> Context'), 'should include lookup order sequence');
    assert.ok(out.includes('Use Exploration -> Execution'), 'should include phase workflow reminder');
    assert.ok(out.includes('Capture reusable Execution fixes -> skills'), 'should include capture reminder');
    assert.ok(out.includes('docs/knowledge/environment/'), 'should include environment capture route');
  } finally {
    cleanup(dir);
  }
});

test('prompt-preamble: no agents — no delegation line', () => {
  const dir = setup();
  try {
    const out = run(dir);
    assert.ok(!out.includes('Delegate'), 'should not include delegation without agents');
  } finally {
    cleanup(dir);
  }
});

test('prompt-preamble: with agents — includes delegation nudge', () => {
  const dir = setup({
    registry: ['| Agent | Skills |', '|-------|--------|', '| `docs-agent` | 2 |', '| `infra-agent` | 3 |'].join('\n'),
  });
  try {
    const out = run(dir);
    assert.ok(out.includes('Orchestrate wisely'), 'should include delegation nudge');
    assert.ok(out.includes('delegate heavy or parallel work to worker agents'), 'should mention selective delegation');
    assert.ok(out.includes('capture writes in the primary agent'), 'should discourage delegating capture writes');
    assert.ok(out.includes('Use Exploration -> Execution'), 'should still include phase workflow reminder');
  } finally {
    cleanup(dir);
  }
});

test('prompt-preamble: with conventions — lists names', () => {
  const dir = setup();
  const convDir = path.join(dir, 'docs', 'context', 'conventions');
  fs.mkdirSync(convDir, { recursive: true });
  fs.writeFileSync(path.join(convDir, 'coding.md'), '# Coding\n');
  fs.writeFileSync(path.join(convDir, 'security.md'), '# Security\n');
  fs.writeFileSync(path.join(convDir, 'index.md'), '# Overview\n');
  try {
    const out = run(dir);
    assert.ok(out.includes('Conventions:'), 'should include conventions label');
    assert.ok(out.includes('coding'), 'should list coding convention');
    assert.ok(out.includes('security'), 'should list security convention');
    assert.ok(!/Conventions:[^|\]]*\bindex\b/.test(out), 'should exclude index.md from conventions list');
  } finally {
    cleanup(dir);
  }
});
