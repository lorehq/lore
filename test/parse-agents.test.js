const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Set up temp structure so __dirname resolves correctly for parse-agents.js
// parse-agents.js delegates to ../../lib/banner.js, which scans .lore/agents/
// So: tmp/.lore/hooks/lib/parse-agents.js → tmp/.lore/lib/banner.js → tmp/.lore/agents/
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-parse-agents-'));
const libDir = path.join(tmpDir, '.lore', 'hooks', 'lib');
fs.mkdirSync(libDir, { recursive: true });
fs.copyFileSync(
  path.join(__dirname, '..', '.lore', 'hooks', 'lib', 'parse-agents.js'),
  path.join(libDir, 'parse-agents.js'),
);
// Shared lib — parse-agents.js requires ../../lib/banner.js
const sharedLib = path.join(tmpDir, '.lore', 'lib');
fs.mkdirSync(sharedLib, { recursive: true });
for (const f of fs.readdirSync(path.join(__dirname, '..', '.lore', 'lib'))) {
  fs.copyFileSync(path.join(__dirname, '..', '.lore', 'lib', f), path.join(sharedLib, f));
}

// Create .lore/agents/ directory
const agentsDir = path.join(tmpDir, '.lore', 'agents');
fs.mkdirSync(agentsDir, { recursive: true });

const { getAgentNames } = require(path.join(libDir, 'parse-agents.js'));

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

test('returns [] when no agent files exist', () => {
  // Clear agents dir
  for (const f of fs.readdirSync(agentsDir)) fs.unlinkSync(path.join(agentsDir, f));
  assert.deepStrictEqual(getAgentNames(), []);
});

test('returns single agent name', () => {
  for (const f of fs.readdirSync(agentsDir)) fs.unlinkSync(path.join(agentsDir, f));
  fs.writeFileSync(path.join(agentsDir, 'git-agent.md'), '---\nname: git-agent\n---\n');
  assert.deepStrictEqual(getAgentNames(), ['git-agent']);
});

test('returns multiple agent names', () => {
  for (const f of fs.readdirSync(agentsDir)) fs.unlinkSync(path.join(agentsDir, f));
  fs.writeFileSync(path.join(agentsDir, 'git-agent.md'), '---\nname: git-agent\n---\n');
  fs.writeFileSync(path.join(agentsDir, 'docker-agent.md'), '---\nname: docker-agent\n---\n');
  fs.writeFileSync(path.join(agentsDir, 'gh-agent.md'), '---\nname: gh-agent\n---\n');
  const names = getAgentNames();
  assert.equal(names.length, 3);
  assert.ok(names.includes('git-agent'));
  assert.ok(names.includes('docker-agent'));
  assert.ok(names.includes('gh-agent'));
});
