const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  getAgentNames,
  getAgentEntries,
  getFieldnotes,
  scanWork,
  buildBanner,
  buildCursorBanner,
} = require('../.lore/lib/banner');

// ---------------------------------------------------------------------------
// Setup helper — creates a minimal temp directory for testing banner functions
// directly (no subprocess, so c8 can instrument).
// ---------------------------------------------------------------------------

function setup(opts = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-banner-')));

  // Minimal required directories
  fs.mkdirSync(path.join(dir, 'docs', 'workflow', 'in-flight', 'initiatives'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs', 'workflow', 'in-flight', 'epics'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.lore', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.lore', 'fieldnotes'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.lore', 'agents'), { recursive: true });

  if (opts.config) {
    fs.writeFileSync(path.join(dir, '.lore', 'config.json'), JSON.stringify(opts.config));
  }
  if (opts.agents) {
    for (const [filename, content] of Object.entries(opts.agents)) {
      fs.writeFileSync(path.join(dir, '.lore', 'agents', filename), content);
    }
  }
  if (opts.skills) {
    for (const [name, content] of Object.entries(opts.skills)) {
      const skillDir = path.join(dir, '.lore', 'skills', name);
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);
    }
  }
  if (opts.fieldnotes) {
    for (const [name, content] of Object.entries(opts.fieldnotes)) {
      const noteDir = path.join(dir, '.lore', 'fieldnotes', name);
      fs.mkdirSync(noteDir, { recursive: true });
      fs.writeFileSync(path.join(noteDir, 'FIELDNOTE.md'), content);
    }
  }
  if (opts.agentRules) {
    fs.mkdirSync(path.join(dir, 'docs', 'context'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs', 'context', 'agent-rules.md'), opts.agentRules);
  }
  if (opts.rules) {
    fs.mkdirSync(path.join(dir, 'docs', 'context'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.lore', 'rules.md'), opts.rules);
  }
  if (opts.rulesDir) {
    const _rulesDir = path.join(dir, '.lore', 'rules');
    fs.mkdirSync(_rulesDir, { recursive: true });
    for (const [name, content] of Object.entries(opts.rulesDir)) {
      fs.writeFileSync(path.join(_rulesDir, name), content);
    }
  }
  if (opts.memory) {
    fs.writeFileSync(path.join(dir, '.lore', 'memory.local.md'), opts.memory);
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

test('getAgentNames: returns filenames without .md extension', (t) => {
  const dir = setup({
    agents: {
      'lore-worker-agent.md': '---\nname: lore-worker-agent\n---\n',
      'deploy-agent.md': '---\nname: deploy-agent\n---\n',
    },
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const names = getAgentNames(dir);
  assert.deepEqual(names.sort(), ['deploy-agent', 'lore-worker-agent']);
});

test('getAgentNames: returns empty array when no agents exist', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const names = getAgentNames(dir);
  assert.deepEqual(names, []);
});

// ---------------------------------------------------------------------------
// getAgentEntries
// ---------------------------------------------------------------------------

test('getAgentEntries: returns array of {name} objects from frontmatter', (t) => {
  const dir = setup({
    agents: {
      'lore-worker-agent.md': '---\nname: lore-worker-agent\n---\n',
      'deploy-agent.md': '---\nname: deploy-agent\n---\n',
    },
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const entries = getAgentEntries(dir);
  const names = entries.map((e) => e.name).sort();
  assert.deepEqual(names, ['deploy-agent', 'lore-worker-agent']);
});

test('getAgentEntries: returns empty array when no agents exist', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const entries = getAgentEntries(dir);
  assert.deepEqual(entries, []);
});

// ---------------------------------------------------------------------------
// getFieldnotes
// ---------------------------------------------------------------------------

test('getFieldnotes: reads name and description from FIELDNOTE.md frontmatter', (t) => {
  const dir = setup({
    fieldnotes: {
      'bash-macos-compat': '---\nname: bash-macos-compat\ndescription: macOS Bash compat\n---\n',
      'docker-build-image': '---\nname: docker-build-image\ndescription: Build Docker images\n---\n',
    },
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const notes = getFieldnotes(dir);
  assert.equal(notes.length, 2);
  const names = notes.map((s) => s.name).sort();
  assert.deepEqual(names, ['bash-macos-compat', 'docker-build-image']);
  const bmc = notes.find((s) => s.name === 'bash-macos-compat');
  assert.equal(bmc.description, 'macOS Bash compat');
});

test('getFieldnotes: returns empty array when no fieldnotes exist', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const notes = getFieldnotes(dir);
  assert.deepEqual(notes, []);
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
  const initiativesDir = path.join(dir, 'docs', 'workflow', 'in-flight', 'initiatives');
  makeWorkItem(initiativesDir, 'my-initiative', { title: 'My Roadmap', status: 'active', summary: 'Phase 1' });
  const labels = scanWork(initiativesDir);
  assert.equal(labels.length, 1);
  assert.equal(labels[0], 'My Roadmap (Phase 1)');
});

test('scanWork: includes on-hold items with [ON HOLD] label', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const initiativesDir = path.join(dir, 'docs', 'workflow', 'in-flight', 'initiatives');
  makeWorkItem(initiativesDir, 'paused', { title: 'Paused Roadmap', status: 'on-hold' });
  const labels = scanWork(initiativesDir);
  assert.equal(labels.length, 1);
  assert.ok(labels[0].includes('[ON HOLD]'));
  assert.ok(labels[0].includes('Paused Roadmap'));
});

test('scanWork: skips archive directories', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const initiativesDir = path.join(dir, 'docs', 'workflow', 'in-flight', 'initiatives');
  const archiveDir = path.join(initiativesDir, 'archive');
  fs.mkdirSync(archiveDir, { recursive: true });
  makeWorkItem(archiveDir, 'old-initiative', { title: 'Old Initiative', status: 'active' });
  const labels = scanWork(initiativesDir);
  assert.deepEqual(labels, []);
});

test('scanWork: skips non-active statuses (completed, draft)', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const initiativesDir = path.join(dir, 'docs', 'workflow', 'in-flight', 'initiatives');
  makeWorkItem(initiativesDir, 'done', { title: 'Done Initiative', status: 'completed' });
  makeWorkItem(initiativesDir, 'draft', { title: 'Draft Initiative', status: 'draft' });
  const labels = scanWork(initiativesDir);
  assert.deepEqual(labels, []);
});

test('scanWork: returns empty array when directory does not exist', () => {
  const labels = scanWork('/tmp/nonexistent-lore-test-dir-xyz');
  assert.deepEqual(labels, []);
});

test('scanWork: uses slug as title when title frontmatter is absent', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const initiativesDir = path.join(dir, 'docs', 'workflow', 'in-flight', 'initiatives');
  // Write index.md with status only — no title
  const itemDir = path.join(initiativesDir, 'my-slug');
  fs.mkdirSync(itemDir, { recursive: true });
  fs.writeFileSync(path.join(itemDir, 'index.md'), '---\nstatus: active\n---\n# heading');
  const labels = scanWork(initiativesDir);
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

test('buildBanner: includes semantic search line when configured', (t) => {
  const dir = setup({ config: { docker: { search: { address: 'localhost', port: 8080 } } } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildBanner(dir);
  assert.ok(out.includes('SEMANTIC SEARCH: http://localhost:8080/search'));
});

test('buildBanner: shows "(none yet)" when no agents', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildBanner(dir);
  assert.ok(out.includes('(none yet)'));
});

test('buildBanner: shows agent names when agents exist', (t) => {
  const dir = setup({
    agents: {
      'lore-worker-agent.md': '---\nname: lore-worker-agent\n---\n',
      'deploy-agent.md': '---\nname: deploy-agent\n---\n',
    },
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildBanner(dir);
  assert.ok(out.includes('lore-worker-agent'));
  assert.ok(out.includes('deploy-agent'));
  assert.ok(!out.includes('(none yet)'));
});

test('buildBanner: includes FIELDNOTES section when fieldnotes exist', (t) => {
  const dir = setup({
    fieldnotes: {
      'bash-macos-compat': '---\nname: bash-macos-compat\ndescription: macOS Bash compat\n---\n',
      'docker-build-image': '---\nname: docker-build-image\ndescription: Build Docker images\n---\n',
    },
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildBanner(dir);
  assert.ok(out.includes('FIELDNOTES'));
  assert.ok(out.includes('bash-macos-compat'));
  assert.ok(out.includes('docker-build-image'));
  const fieldnotesLine = out.split('\n').find((l) => l.startsWith('FIELDNOTES'));
  assert.ok(fieldnotesLine, 'FIELDNOTES line should exist');
});

test('buildBanner: includes ACTIVE INITIATIVES when active initiatives exist', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const initiativesDir = path.join(dir, 'docs', 'workflow', 'in-flight', 'initiatives');
  makeWorkItem(initiativesDir, 'big-initiative', { title: 'Big Initiative', status: 'active', summary: 'Q1 work' });
  const out = buildBanner(dir);
  assert.ok(out.includes('ACTIVE INITIATIVES:'));
  assert.ok(out.includes('Big Initiative (Q1 work)'));
});

test('buildBanner: includes ACTIVE EPICS when active epics exist', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const epicsDir = path.join(dir, 'docs', 'workflow', 'in-flight', 'epics');
  makeWorkItem(epicsDir, 'sprint-1', { title: 'Sprint 1', status: 'active' });
  const out = buildBanner(dir);
  assert.ok(out.includes('ACTIVE EPICS:'));
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
  const defaultTemplate = '# Operator Profile\n\n## Identity\n\n- **Name:**\n- **Role:**\n\nFill this in.';
  const dir = setup({ operatorProfile: defaultTemplate });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildBanner(dir);
  assert.ok(!out.includes('OPERATOR PROFILE:'), 'default template should not be injected');
});

test('buildBanner: includes RULES from rules directory', (t) => {
  const dir = setup({
    rulesDir: {
      'index.md': '# Rules\n\nOverview here.',
      'coding.md': '# Coding\n\nSimplicity first.',
    },
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildBanner(dir);
  assert.ok(out.includes('RULES:'));
  assert.ok(out.includes('Overview here.'));
  assert.ok(out.includes('Simplicity first.'));
});

test('buildBanner: index.md appears before other files in rules dir', (t) => {
  const dir = setup({
    rulesDir: {
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

test('buildBanner: includes RULES from flat rules.md fallback', (t) => {
  const dir = setup({ rules: '# Rules\n\nFlat file rules.' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildBanner(dir);
  assert.ok(out.includes('RULES:'));
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

test('buildBanner: shows [MINIMAL] tag when profile is minimal', (t) => {
  const dir = setup({ config: { version: '1.0.0', profile: 'minimal' } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildBanner(dir);
  assert.ok(out.includes('=== LORE v1.0.0 [MINIMAL] ==='));
});

test('buildBanner: shows [DISCOVERY] tag when profile is discovery', (t) => {
  const dir = setup({ config: { version: '1.0.0', profile: 'discovery' } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildBanner(dir);
  assert.ok(out.includes('=== LORE v1.0.0 [DISCOVERY] ==='));
});

test('buildBanner: no profile tag for standard', (t) => {
  const dir = setup({ config: { version: '1.0.0', profile: 'standard' } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildBanner(dir);
  assert.ok(out.includes('=== LORE v1.0.0 ==='));
  assert.ok(!out.includes('[STANDARD]'));
  assert.ok(!out.includes('[MINIMAL]'));
  assert.ok(!out.includes('[DISCOVERY]'));
});

test('buildBanner: minimal profile shows PROFILE line', (t) => {
  const dir = setup({ config: { profile: 'minimal' } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildBanner(dir);
  assert.ok(out.includes('PROFILE: minimal'));
  assert.ok(out.includes('/lore-capture'));
});

test('buildBanner: discovery profile shows PROFILE line', (t) => {
  const dir = setup({ config: { profile: 'discovery' } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildBanner(dir);
  assert.ok(out.includes('PROFILE: discovery'));
  assert.ok(out.includes('capture aggressively'));
});

test('buildBanner: standard profile has no PROFILE line', (t) => {
  const dir = setup({ config: { profile: 'standard' } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildBanner(dir);
  assert.ok(!out.includes('PROFILE:'));
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

test('buildCursorBanner: includes active initiatives', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const initiativesDir = path.join(dir, 'docs', 'workflow', 'in-flight', 'initiatives');
  makeWorkItem(initiativesDir, 'cursor-initiative', { title: 'Cursor Initiative', status: 'active' });
  const out = buildCursorBanner(dir);
  assert.ok(out.includes('ACTIVE INITIATIVES:'));
  assert.ok(out.includes('Cursor Initiative'));
});

test('buildCursorBanner: includes active epics', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const epicsDir = path.join(dir, 'docs', 'workflow', 'in-flight', 'epics');
  makeWorkItem(epicsDir, 'cursor-epic', { title: 'Cursor Epic', status: 'active' });
  const out = buildCursorBanner(dir);
  assert.ok(out.includes('ACTIVE EPICS:'));
  assert.ok(out.includes('Cursor Epic'));
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
  const defaultTemplate = '# Operator Profile\n\n## Identity\n\n- **Name:**\n- **Role:**\n\nFill this in.';
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

test('buildCursorBanner: does not include RULES section', (t) => {
  const dir = setup({ rules: '# Rules\n\nStatic .mdc rules handle this.' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildCursorBanner(dir);
  assert.ok(!out.includes('RULES:'));
});

test('buildCursorBanner: does not include DELEGATION section', (t) => {
  const dir = setup({
    agents: {
      'lore-worker-agent.md': '---\nname: lore-worker-agent\n---\n',
    },
  });
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

// ---------------------------------------------------------------------------
// buildBanner: treeDepth
// ---------------------------------------------------------------------------

test('buildBanner: treeDepth config limits knowledge map depth', (t) => {
  const dir = setup({ config: { treeDepth: 1 } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'docs', 'level1', 'level2', 'level3'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'level1', 'a.md'), '# A');
  fs.writeFileSync(path.join(dir, 'docs', 'level1', 'level2', 'b.md'), '# B');
  fs.writeFileSync(path.join(dir, 'docs', 'level1', 'level2', 'level3', 'c.md'), '# C');
  const out = buildBanner(dir);
  assert.ok(out.includes('level1/'), 'depth-0 dir should appear');
  assert.ok(!out.includes('level2/'), 'depth-1 dir should not appear at treeDepth: 1');
  assert.ok(!out.includes('b.md'), 'depth-2 file should not appear');
  assert.ok(!out.includes('c.md'), 'depth-3 file should not appear');
});
