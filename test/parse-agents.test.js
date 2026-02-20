const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Set up temp structure so __dirname resolves correctly for parse-agents.js
// parse-agents.js delegates to ../../lib/banner.js, which reads agent-registry.md
// So: tmp/hooks/lib/parse-agents.js → tmp/lib/banner.js → tmp/agent-registry.md
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-parse-agents-'));
const libDir = path.join(tmpDir, 'hooks', 'lib');
fs.mkdirSync(libDir, { recursive: true });
fs.copyFileSync(path.join(__dirname, '..', 'hooks', 'lib', 'parse-agents.js'), path.join(libDir, 'parse-agents.js'));
// Shared lib — parse-agents.js requires ../../lib/banner.js
const sharedLib = path.join(tmpDir, 'lib');
fs.mkdirSync(sharedLib, { recursive: true });
for (const f of fs.readdirSync(path.join(__dirname, '..', 'lib'))) {
  fs.copyFileSync(path.join(__dirname, '..', 'lib', f), path.join(sharedLib, f));
}

const { getAgentNames } = require(path.join(libDir, 'parse-agents.js'));
const registryPath = path.join(tmpDir, 'agent-registry.md');

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

test('returns [] when no registry file exists', () => {
  if (fs.existsSync(registryPath)) fs.unlinkSync(registryPath);
  assert.deepStrictEqual(getAgentNames(), []);
});

test('returns [] for empty table (headers + separator only)', () => {
  fs.writeFileSync(registryPath, '| Agent | Skills |\n|---|---|\n');
  assert.deepStrictEqual(getAgentNames(), []);
});

test('parses single agent row', () => {
  fs.writeFileSync(registryPath, ['| Agent | Skills |', '|---|---|', '| `git-agent` | 3 |'].join('\n'));
  assert.deepStrictEqual(getAgentNames(), ['git-agent']);
});

test('returns multiple agent names', () => {
  fs.writeFileSync(
    registryPath,
    ['| Agent | Skills |', '|---|---|', '| `git-agent` | 3 |', '| `docker-agent` | 2 |', '| `gh-agent` | 1 |'].join(
      '\n',
    ),
  );
  const names = getAgentNames();
  assert.equal(names.length, 3);
  assert.ok(names.includes('git-agent'));
  assert.ok(names.includes('docker-agent'));
  assert.ok(names.includes('gh-agent'));
});

test('skips malformed rows', () => {
  fs.writeFileSync(
    registryPath,
    ['| Agent | Skills |', '|---|---|', '| `good-agent` | 2 |', '| | |', 'not a table row'].join('\n'),
  );
  assert.deepStrictEqual(getAgentNames(), ['good-agent']);
});
