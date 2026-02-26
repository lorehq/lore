const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// prompt-preamble.js requires ./lib/parse-agents which requires ../../lib/banner.
// Temp structure: tmp/.lore/hooks/prompt-preamble.js, tmp/.lore/hooks/lib/parse-agents.js,
// tmp/.lore/lib/banner.js (+ other lib files).

function setup(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-preamble-'));
  // Copy hooks
  const hooksDir = path.join(dir, '.lore', 'hooks', 'lib');
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, '..', '.lore', 'hooks', 'prompt-preamble.js'),
    path.join(dir, '.lore', 'hooks', 'prompt-preamble.js'),
  );
  fs.copyFileSync(
    path.join(__dirname, '..', '.lore', 'hooks', 'lib', 'parse-agents.js'),
    path.join(dir, '.lore', 'hooks', 'lib', 'parse-agents.js'),
  );
  // Shared lib
  const libDir = path.join(dir, '.lore', 'lib');
  fs.mkdirSync(libDir, { recursive: true });
  for (const f of fs.readdirSync(path.join(__dirname, '..', '.lore', 'lib'))) {
    fs.copyFileSync(path.join(__dirname, '..', '.lore', 'lib', f), path.join(libDir, f));
  }
  // Create .lore/agents/ for agent scanning
  fs.mkdirSync(path.join(dir, '.lore', 'agents'), { recursive: true });
  if (opts.agents) {
    for (const [filename, content] of Object.entries(opts.agents)) {
      fs.writeFileSync(path.join(dir, '.lore', 'agents', filename), content);
    }
  }
  if (opts.config) {
    fs.writeFileSync(path.join(dir, '.lore', 'config.json'), JSON.stringify(opts.config));
  }
  return dir;
}

function run(dir) {
  return execSync(`node .lore/hooks/prompt-preamble.js`, { cwd: dir, encoding: 'utf8' }).trim();
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

test('prompt-preamble: always includes role directives', () => {
  const dir = setup();
  try {
    const out = run(dir);
    assert.ok(out.includes('Curator'), 'should include Curator role');
    assert.ok(out.includes('Orchestrator'), 'should include Orchestrator role');
    assert.ok(out.includes('Capturer'), 'should include Capturer role');
    assert.ok(out.includes('delegate'), 'should include delegation directive');
    assert.ok(out.includes('docs/knowledge/'), 'should include knowledge capture route');
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
    agents: {
      'docs-agent.md': '---\nname: docs-agent\n---\n',
      'infra-agent.md': '---\nname: infra-agent\n---\n',
    },
  });
  try {
    const out = run(dir);
    assert.ok(out.includes('Orchestrator'), 'should include Orchestrator role');
    assert.ok(out.includes('delegate'), 'should mention delegation');
    assert.ok(out.includes('Capturer'), 'should include Capturer role');
  } finally {
    cleanup(dir);
  }
});

test('prompt-preamble: with rules — still includes role directives', () => {
  const dir = setup();
  const rulesDir = path.join(dir, 'docs', 'context', 'rules');
  fs.mkdirSync(rulesDir, { recursive: true });
  fs.writeFileSync(path.join(rulesDir, 'coding.md'), '# Coding\n');
  fs.writeFileSync(path.join(rulesDir, 'security.md'), '# Security\n');
  fs.writeFileSync(path.join(rulesDir, 'index.md'), '# Overview\n');
  try {
    const out = run(dir);
    // Preamble no longer lists rule names (they're in the static banner)
    assert.ok(out.includes('Curator'), 'should include Curator role');
    assert.ok(out.includes('Capturer'), 'should include Capturer role');
  } finally {
    cleanup(dir);
  }
});

test('prompt-preamble: uses KB shorthand when semantic search configured', () => {
  const dir = setup({ config: { docker: { search: { address: 'localhost', port: 8080 } } } });
  try {
    const out = run(dir);
    // With semantic search, Curator directive says "search KB first" instead of listing paths
    assert.ok(out.includes('search KB first'), 'should use KB search shorthand when semantic search configured');
    assert.ok(out.includes('delegate'), 'should include delegation directive');
  } finally {
    cleanup(dir);
  }
});
