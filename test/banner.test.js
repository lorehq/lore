const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  getAgentNames,
  getAgentEntries,
  getOperatorSkills,
  scanWork,
  buildBanner,
  buildCursorBanner,
} = require('../lib/banner');

// ---------------------------------------------------------------------------
// Setup helper — creates a minimal temp directory for testing banner functions
// directly (no subprocess, so c8 can instrument).
// ---------------------------------------------------------------------------

const AGENT_REGISTRY = `| Agent | Type | Description |
|-------|------|-------------|
| \`lore-worker-agent\` | framework | General worker |
| \`deploy-agent\` | operator | Deployment tasks |
`;

const SKILLS_REGISTRY = `| Skill | Type | Description |
|-------|------|-------------|
| \`lore-capture\` | framework | Session capture |
| \`bash-macos-compat\` | operator | macOS Bash compat |
| \`docker-build-image\` | operator | Build Docker images |
`;

function setup(opts = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-banner-')));

  // Minimal required directories
  fs.mkdirSync(path.join(dir, 'docs', 'work', 'roadmaps'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs', 'work', 'plans'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.lore', 'skills'), { recursive: true });

  if (opts.config) {
    fs.writeFileSync(path.join(dir, '.lore-config'), JSON.stringify(opts.config));
  }
  if (opts.registry) {
    fs.writeFileSync(path.join(dir, 'agent-registry.md'), opts.registry);
  }
  if (opts.skillsRegistry) {
    fs.writeFileSync(path.join(dir, 'skills-registry.md'), opts.skillsRegistry);
  }
  if (opts.agentRules) {
    fs.mkdirSync(path.join(dir, 'docs', 'context'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs', 'context', 'agent-rules.md'), opts.agentRules);
  }
  if (opts.conventions) {
    fs.mkdirSync(path.join(dir, 'docs', 'context'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs', 'context', 'conventions.md'), opts.conventions);
  }
  if (opts.conventionsDir) {
    const convDir = path.join(dir, 'docs', 'context', 'conventions');
    fs.mkdirSync(convDir, { recursive: true });
    for (const [name, content] of Object.entries(opts.conventionsDir)) {
      fs.writeFileSync(path.join(convDir, name), content);
    }
  }
  if (opts.memory) {
    fs.writeFileSync(path.join(dir, 'MEMORY.local.md'), opts.memory);
  }
  if (opts.operatorProfile) {
    fs.mkdirSync(path.join(dir, 'docs', 'knowledge', 'local'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs', 'knowledge', 'local', 'operator-profile.md'), opts.operatorProfile);
  }

  return dir;
}

// ---------------------------------------------------------------------------
// getAgentNames
// ---------------------------------------------------------------------------

test('getAgentNames: parses agent-registry.md table correctly', (t) => {
  const dir = setup({ registry: AGENT_REGISTRY });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const names = getAgentNames(dir);
  assert.deepEqual(names, ['lore-worker-agent', 'deploy-agent']);
});

test('getAgentNames: skips header row and separator lines', (t) => {
  const dir = setup({ registry: AGENT_REGISTRY });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const names = getAgentNames(dir);
  assert.ok(!names.includes('Agent'), 'should skip header "Agent"');
  assert.ok(!names.some((n) => n.includes('---')), 'should skip separator lines');
});

test('getAgentNames: returns empty array when file does not exist', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const names = getAgentNames(dir);
  assert.deepEqual(names, []);
});

// ---------------------------------------------------------------------------
// getAgentEntries
// ---------------------------------------------------------------------------

test('getAgentEntries: returns array of {name} objects', (t) => {
  const dir = setup({ registry: AGENT_REGISTRY });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const entries = getAgentEntries(dir);
  assert.deepEqual(entries, [{ name: 'lore-worker-agent' }, { name: 'deploy-agent' }]);
});

test('getAgentEntries: skips header row and separator lines', (t) => {
  const dir = setup({ registry: AGENT_REGISTRY });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const entries = getAgentEntries(dir);
  assert.ok(
    !entries.some((e) => e.name.toLowerCase() === 'agent'),
    'should skip header row',
  );
  assert.ok(
    !entries.some((e) => e.name.includes('---')),
    'should skip separator lines',
  );
});

test('getAgentEntries: returns empty array when file does not exist', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const entries = getAgentEntries(dir);
  assert.deepEqual(entries, []);
});

// ---------------------------------------------------------------------------
// getOperatorSkills
// ---------------------------------------------------------------------------

test('getOperatorSkills: parses skills-registry.md table', (t) => {
  const dir = setup({ skillsRegistry: SKILLS_REGISTRY });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const skills = getOperatorSkills(dir);
  assert.equal(skills.length, 2);
  assert.deepEqual(skills[0], { name: 'bash-macos-compat', description: 'macOS Bash compat' });
  assert.deepEqual(skills[1], { name: 'docker-build-image', description: 'Build Docker images' });
});

test('getOperatorSkills: filters out lore-* prefixed skills', (t) => {
  const dir = setup({ skillsRegistry: SKILLS_REGISTRY });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const skills = getOperatorSkills(dir);
  assert.ok(
    !skills.some((s) => s.name.startsWith('lore-')),
    'should exclude lore-* skills',
  );
});

test('getOperatorSkills: returns empty array when file does not exist', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const skills = getOperatorSkills(dir);
  assert.deepEqual(skills, []);
});

// ---------------------------------------------------------------------------
// scanWork
// ---------------------------------------------------------------------------

function makeWorkItem(dir, slug, frontmatter) {
  const itemDir = path.join(dir, slug);
  fs.mkdirSync(itemDir, { recursive: true });
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  fs.writeFileSync(path.join(itemDir, 'index.md'), `---\n${fm}\n---\n# ${slug}`);
}

test('scanWork: returns active items with title and summary', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const roadmapsDir = path.join(dir, 'docs', 'work', 'roadmaps');
  makeWorkItem(roadmapsDir, 'my-roadmap', { title: 'My Roadmap', status: 'active', summary: 'Phase 1' });
  const labels = scanWork(roadmapsDir);
  assert.equal(labels.length, 1);
  assert.equal(labels[0], 'My Roadmap (Phase 1)');
});

test('scanWork: includes on-hold items with [ON HOLD] label', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const roadmapsDir = path.join(dir, 'docs', 'work', 'roadmaps');
  makeWorkItem(roadmapsDir, 'paused', { title: 'Paused Roadmap', status: 'on-hold' });
  const labels = scanWork(roadmapsDir);
  assert.equal(labels.length, 1);
  assert.ok(labels[0].includes('[ON HOLD]'));
  assert.ok(labels[0].includes('Paused Roadmap'));
});

test('scanWork: skips archive directories', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const roadmapsDir = path.join(dir, 'docs', 'work', 'roadmaps');
  const archiveDir = path.join(roadmapsDir, 'archive');
  fs.mkdirSync(archiveDir, { recursive: true });
  makeWorkItem(archiveDir, 'old-roadmap', { title: 'Old Roadmap', status: 'active' });
  const labels = scanWork(roadmapsDir);
  assert.deepEqual(labels, []);
});

test('scanWork: skips non-active statuses (completed, draft)', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const roadmapsDir = path.join(dir, 'docs', 'work', 'roadmaps');
  makeWorkItem(roadmapsDir, 'done', { title: 'Done Roadmap', status: 'completed' });
  makeWorkItem(roadmapsDir, 'draft', { title: 'Draft Roadmap', status: 'draft' });
  const labels = scanWork(roadmapsDir);
  assert.deepEqual(labels, []);
});

test('scanWork: returns empty array when directory does not exist', (t) => {
  const labels = scanWork('/tmp/nonexistent-lore-test-dir-xyz');
  assert.deepEqual(labels, []);
});

test('scanWork: uses slug as title when title frontmatter is absent', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const roadmapsDir = path.join(dir, 'docs', 'work', 'roadmaps');
  // Write index.md with status only — no title
  const itemDir = path.join(roadmapsDir, 'my-slug');
  fs.mkdirSync(itemDir, { recursive: true });
  fs.writeFileSync(path.join(itemDir, 'index.md'), '---\nstatus: active\n---\n# heading');
  const labels = scanWork(roadmapsDir);
  assert.equal(labels.length, 1);
  assert.equal(labels[0], 'my-slug');
});

// ---------------------------------------------------------------------------
// buildBanner
// ---------------------------------------------------------------------------

test('buildBanner: includes version from .lore-config', (t) => {
  const dir = setup({ config: { version: '2.0.0' } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildBanner(dir);
  assert.ok(out.includes('=== LORE v2.0.0 ==='));
});

test('buildBanner: shows "(none yet)" when no agents', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildBanner(dir);
  assert.ok(out.includes('(none yet)'));
});

test('buildBanner: shows agent names when registry exists', (t) => {
  const dir = setup({ registry: AGENT_REGISTRY });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildBanner(dir);
  assert.ok(out.includes('lore-worker-agent'));
  assert.ok(out.includes('deploy-agent'));
  assert.ok(!out.includes('(none yet)'));
});

test('buildBanner: includes SKILLS section when operator skills exist', (t) => {
  const dir = setup({ skillsRegistry: SKILLS_REGISTRY });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildBanner(dir);
  assert.ok(out.includes('SKILLS'));
  assert.ok(out.includes('bash-macos-compat'));
  assert.ok(out.includes('docker-build-image'));
  assert.ok(!out.includes('lore-capture'), 'should not include lore-* skills');
});

test('buildBanner: includes ACTIVE ROADMAPS when active roadmaps exist', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const roadmapsDir = path.join(dir, 'docs', 'work', 'roadmaps');
  makeWorkItem(roadmapsDir, 'big-initiative', { title: 'Big Initiative', status: 'active', summary: 'Q1 work' });
  const out = buildBanner(dir);
  assert.ok(out.includes('ACTIVE ROADMAPS:'));
  assert.ok(out.includes('Big Initiative (Q1 work)'));
});

test('buildBanner: includes ACTIVE PLANS when active plans exist', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const plansDir = path.join(dir, 'docs', 'work', 'plans');
  makeWorkItem(plansDir, 'sprint-1', { title: 'Sprint 1', status: 'active' });
  const out = buildBanner(dir);
  assert.ok(out.includes('ACTIVE PLANS:'));
  assert.ok(out.includes('Sprint 1'));
});

test('buildBanner: includes PROJECT from agent-rules.md', (t) => {
  const dir = setup({
    agentRules: '---\ntitle: Rules\n---\n\n# My Project\n\nProject description here.',
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildBanner(dir);
  assert.ok(out.includes('PROJECT:'));
  assert.ok(out.includes('# My Project'));
  assert.ok(out.includes('Project description here.'));
  assert.ok(!out.includes('title: Rules'), 'frontmatter should be stripped');
});

test('buildBanner: includes OPERATOR PROFILE when customized', (t) => {
  const dir = setup({
    operatorProfile: '# Operator Profile\n\n## Identity\n\n- **Name:** Jane Doe\n- **Role:** Staff Engineer',
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildBanner(dir);
  assert.ok(out.includes('OPERATOR PROFILE:'));
  assert.ok(out.includes('Jane Doe'));
  assert.ok(out.includes('Staff Engineer'));
});

test('buildBanner: skips default operator profile template', (t) => {
  // The default template contains the marker line the code checks for
  const defaultTemplate =
    '# Operator Profile\n\n## Identity\n\n- **Name:**\n- **Role:**\n\nFill this in.';
  const dir = setup({ operatorProfile: defaultTemplate });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildBanner(dir);
  assert.ok(!out.includes('OPERATOR PROFILE:'), 'default template should not be injected');
});

test('buildBanner: includes CONVENTIONS from conventions directory', (t) => {
  const dir = setup({
    conventionsDir: {
      'index.md': '# Conventions\n\nOverview here.',
      'coding.md': '# Coding\n\nSimplicity first.',
    },
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildBanner(dir);
  assert.ok(out.includes('CONVENTIONS:'));
  assert.ok(out.includes('Overview here.'));
  assert.ok(out.includes('Simplicity first.'));
});

test('buildBanner: index.md appears before other files in conventions dir', (t) => {
  const dir = setup({
    conventionsDir: {
      'zzz-last.md': '# ZZZ\n\nLast alphabetically.',
      'index.md': '# Index\n\nFirst always.',
    },
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildBanner(dir);
  const indexPos = out.indexOf('First always.');
  const lastPos = out.indexOf('Last alphabetically.');
  assert.ok(indexPos < lastPos, 'index.md content should appear before zzz-last.md');
});

test('buildBanner: includes CONVENTIONS from flat conventions.md fallback', (t) => {
  const dir = setup({ conventions: '# Conventions\n\nFlat file rules.' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildBanner(dir);
  assert.ok(out.includes('CONVENTIONS:'));
  assert.ok(out.includes('Flat file rules.'));
});

test('buildBanner: includes LOCAL MEMORY when content is beyond default', (t) => {
  const dir = setup({ memory: '# Local Memory\n\nRemember this important thing.' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildBanner(dir);
  assert.ok(out.includes('LOCAL MEMORY:'));
  assert.ok(out.includes('Remember this important thing.'));
});

test('buildBanner: skips LOCAL MEMORY when content is only default header', (t) => {
  const dir = setup({ memory: '# Local Memory' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildBanner(dir);
  assert.ok(!out.includes('LOCAL MEMORY:'));
});

test('buildBanner: skips LOCAL MEMORY when file does not exist', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildBanner(dir);
  assert.ok(!out.includes('LOCAL MEMORY:'));
});

test('buildBanner: includes KNOWLEDGE MAP', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Add a skill so the tree has content
  fs.mkdirSync(path.join(dir, '.lore', 'skills', 'test-skill'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.lore', 'skills', 'test-skill', 'SKILL.md'), '# Test Skill');
  const out = buildBanner(dir);
  assert.ok(out.includes('KNOWLEDGE MAP:'));
  assert.ok(out.includes('.lore/skills/'));
  assert.ok(out.includes('test-skill/'));
});

// ---------------------------------------------------------------------------
// buildCursorBanner
// ---------------------------------------------------------------------------

test('buildCursorBanner: includes version header', (t) => {
  const dir = setup({ config: { version: '1.5.0' } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildCursorBanner(dir);
  assert.ok(out.includes('=== LORE v1.5.0 ==='));
});

test('buildCursorBanner: includes active roadmaps', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const roadmapsDir = path.join(dir, 'docs', 'work', 'roadmaps');
  makeWorkItem(roadmapsDir, 'cursor-roadmap', { title: 'Cursor Roadmap', status: 'active' });
  const out = buildCursorBanner(dir);
  assert.ok(out.includes('ACTIVE ROADMAPS:'));
  assert.ok(out.includes('Cursor Roadmap'));
});

test('buildCursorBanner: includes active plans', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const plansDir = path.join(dir, 'docs', 'work', 'plans');
  makeWorkItem(plansDir, 'cursor-plan', { title: 'Cursor Plan', status: 'active' });
  const out = buildCursorBanner(dir);
  assert.ok(out.includes('ACTIVE PLANS:'));
  assert.ok(out.includes('Cursor Plan'));
});

test('buildCursorBanner: includes operator profile when customized', (t) => {
  const dir = setup({
    operatorProfile: '# Operator Profile\n\n## Identity\n\n- **Name:** Bob Smith\n- **Role:** SRE',
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildCursorBanner(dir);
  assert.ok(out.includes('OPERATOR PROFILE:'));
  assert.ok(out.includes('Bob Smith'));
  assert.ok(out.includes('SRE'));
});

test('buildCursorBanner: skips default operator profile template', (t) => {
  const defaultTemplate =
    '# Operator Profile\n\n## Identity\n\n- **Name:**\n- **Role:**\n\nFill this in.';
  const dir = setup({ operatorProfile: defaultTemplate });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildCursorBanner(dir);
  assert.ok(!out.includes('OPERATOR PROFILE:'));
});

test('buildCursorBanner: includes local memory when content exists', (t) => {
  const dir = setup({ memory: '# Local Memory\n\nCursor session note.' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildCursorBanner(dir);
  assert.ok(out.includes('LOCAL MEMORY:'));
  assert.ok(out.includes('Cursor session note.'));
});

test('buildCursorBanner: does not include PROJECT section', (t) => {
  const dir = setup({
    agentRules: '# My Project\n\nStatic content handled by .mdc rules.',
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildCursorBanner(dir);
  assert.ok(!out.includes('PROJECT:'));
});

test('buildCursorBanner: does not include CONVENTIONS section', (t) => {
  const dir = setup({ conventions: '# Conventions\n\nStatic .mdc rules handle this.' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildCursorBanner(dir);
  assert.ok(!out.includes('CONVENTIONS:'));
});

test('buildCursorBanner: does not include DELEGATION section', (t) => {
  const dir = setup({ registry: AGENT_REGISTRY });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildCursorBanner(dir);
  assert.ok(!out.includes('DELEGATION:'));
});

test('buildCursorBanner: does not include KNOWLEDGE MAP section', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, '.lore', 'skills', 'test-skill'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.lore', 'skills', 'test-skill', 'SKILL.md'), '# Test');
  const out = buildCursorBanner(dir);
  assert.ok(!out.includes('KNOWLEDGE MAP:'));
});
