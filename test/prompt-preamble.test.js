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
    assert.ok(out.includes('Multi-step?'), 'should include multi-step reminder');
  } finally {
    cleanup(dir);
  }
});

test('prompt-preamble: no agents — no Delegate prefix', () => {
  const dir = setup();
  try {
    const out = run(dir);
    assert.ok(!out.includes('Delegate:'), 'should not include Delegate without agents');
    assert.equal(out, '[Multi-step? → use task list]');
  } finally {
    cleanup(dir);
  }
});

test('prompt-preamble: with agents — includes Delegate', () => {
  const dir = setup({
    registry: [
      '| Agent | Domain | Model |',
      '|-------|--------|-------|',
      '| `docs-agent` | Documentation | sonnet |',
      '| `infra-agent` | Infrastructure | sonnet |',
    ].join('\n'),
  });
  try {
    const out = run(dir);
    assert.ok(out.includes('Delegate: Documentation, Infrastructure'), 'should list agent domains');
    assert.ok(out.includes('Multi-step?'), 'should still include task reminder');
  } finally {
    cleanup(dir);
  }
});
