const { test } = require('node:test');
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
fs.copyFileSync(
  path.join(__dirname, '..', 'hooks', 'lib', 'parse-agents.js'),
  path.join(libDir, 'parse-agents.js')
);
// Shared lib — parse-agents.js requires ../../lib/banner.js
const sharedLib = path.join(tmpDir, 'lib');
fs.mkdirSync(sharedLib, { recursive: true });
fs.copyFileSync(
  path.join(__dirname, '..', 'lib', 'banner.js'),
  path.join(sharedLib, 'banner.js')
);

const { getAgentDomains } = require(path.join(libDir, 'parse-agents.js'));
const registryPath = path.join(tmpDir, 'agent-registry.md');

test('returns [] when no registry file exists', () => {
  if (fs.existsSync(registryPath)) fs.unlinkSync(registryPath);
  assert.deepStrictEqual(getAgentDomains(), []);
});

test('returns [] for empty table (headers + separator only)', () => {
  fs.writeFileSync(registryPath, '| Agent | Domain | Description |\n|---|---|---|\n');
  assert.deepStrictEqual(getAgentDomains(), []);
});

test('parses single agent row', () => {
  fs.writeFileSync(registryPath, [
    '| Agent | Domain | Description |',
    '|---|---|---|',
    '| `git-agent` | Git | Git operations |',
  ].join('\n'));
  assert.deepStrictEqual(getAgentDomains(), ['Git']);
});

test('deduplicates domains from multiple agents', () => {
  fs.writeFileSync(registryPath, [
    '| Agent | Domain | Description |',
    '|---|---|---|',
    '| `git-agent` | Git | Git operations |',
    '| `git-pr-agent` | Git | PR workflows |',
  ].join('\n'));
  assert.deepStrictEqual(getAgentDomains(), ['Git']);
});

test('returns multiple distinct domains', () => {
  fs.writeFileSync(registryPath, [
    '| Agent | Domain | Description |',
    '|---|---|---|',
    '| `git-agent` | Git | Git operations |',
    '| `docker-agent` | Docker | Container ops |',
    '| `gh-agent` | GitHub | GitHub API |',
  ].join('\n'));
  const domains = getAgentDomains();
  assert.equal(domains.length, 3);
  assert.ok(domains.includes('Git'));
  assert.ok(domains.includes('Docker'));
  assert.ok(domains.includes('GitHub'));
});

test('skips malformed rows', () => {
  fs.writeFileSync(registryPath, [
    '| Agent | Domain | Description |',
    '|---|---|---|',
    '| `good-agent` | Git | Valid row |',
    '| | | |',
    '| `no-domain` | | Missing domain |',
    'not a table row',
  ].join('\n'));
  assert.deepStrictEqual(getAgentDomains(), ['Git']);
});
