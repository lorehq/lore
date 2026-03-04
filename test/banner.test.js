const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  getFieldnotes,
  buildStaticBanner,
  buildDynamicBanner,
  getBannerLoadedSkills,
} = require('../.lore/harness/lib/banner');

// ---------------------------------------------------------------------------
// Setup helper — creates a minimal temp directory for testing banner functions
// directly (no subprocess, so c8 can instrument).
//
// Note: getAgentEntries/getFieldnotes scan both the project dir AND the
// global directory (~/.lore/). Tests that check counts must account for global directory content.
// ---------------------------------------------------------------------------

function setup(opts = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-banner-')));

  // Minimal required directories
  fs.mkdirSync(path.join(dir, 'docs', 'workflow', 'in-flight', 'initiatives'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs', 'workflow', 'in-flight', 'epics'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.lore', 'skills'), { recursive: true });

  if (opts.config) {
    fs.writeFileSync(path.join(dir, '.lore', 'config.json'), JSON.stringify(opts.config));
  }
  if (opts.harnessSkills) {
    for (const [name, content] of Object.entries(opts.harnessSkills)) {
      const skillDir = path.join(dir, '.lore', 'harness', 'skills', name);
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);
    }
  }
  if (opts.skills) {
    for (const [name, content] of Object.entries(opts.skills)) {
      const skillDir = path.join(dir, '.lore', 'skills', name);
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);
    }
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

  return dir;
}

// ---------------------------------------------------------------------------
// getFieldnotes
// ---------------------------------------------------------------------------

test('getFieldnotes: returns array from global knowledge base', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const notes = getFieldnotes(dir);
  assert.ok(Array.isArray(notes));
  // Global fieldnotes exist in ~/.lore/knowledge-base/fieldnotes/
  if (notes.length > 0) {
    assert.ok(notes[0].name, 'each entry should have a name');
  }
});

// ---------------------------------------------------------------------------
// getBannerLoadedSkills
// ---------------------------------------------------------------------------

test('getBannerLoadedSkills: returns skills with banner-loaded: true', (t) => {
  const dir = setup({
    skills: {
      'loaded-skill': '---\nname: loaded-skill\nbanner-loaded: "true"\n---\nSkill body here.',
      'unloaded-skill': '---\nname: unloaded-skill\n---\nNot loaded.',
    },
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const loaded = getBannerLoadedSkills(dir);
  const names = loaded.map(s => s.name);
  assert.ok(names.includes('loaded-skill'), 'should include banner-loaded skill');
  assert.ok(!names.includes('unloaded-skill'), 'should exclude non-banner-loaded skill');
  const skill = loaded.find(s => s.name === 'loaded-skill');
  assert.ok(skill.body.includes('Skill body here.'));
});

test('getBannerLoadedSkills: discovers harness skills from .lore/harness/skills/', (t) => {
  const dir = setup({
    harnessSkills: {
      'lore-test': '---\nname: lore-test\nbanner-loaded: "true"\n---\nHarness skill body.',
    },
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const loaded = getBannerLoadedSkills(dir);
  const names = loaded.map(s => s.name);
  assert.ok(names.includes('lore-test'), 'should discover harness skills');
  const skill = loaded.find(s => s.name === 'lore-test');
  assert.ok(skill.body.includes('Harness skill body.'));
});

test('getBannerLoadedSkills: project skills override harness skills with same name', (t) => {
  const dir = setup({
    harnessSkills: {
      'my-skill': '---\nname: my-skill\nbanner-loaded: "true"\n---\nHarness version.',
    },
    skills: {
      'my-skill': '---\nname: my-skill\nbanner-loaded: "true"\n---\nProject version.',
    },
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const loaded = getBannerLoadedSkills(dir);
  const matches = loaded.filter(s => s.name === 'my-skill');
  assert.equal(matches.length, 1, 'should deduplicate by name');
  assert.ok(matches[0].body.includes('Project version.'), 'project skill should win');
});

// ---------------------------------------------------------------------------
// buildStaticBanner (async)
// ---------------------------------------------------------------------------

test('buildStaticBanner: includes version from config', async (t) => {
  const dir = setup({ config: { version: '2.0.0' } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = await buildStaticBanner(dir);
  assert.ok(out.includes('v2.0.0'));
});

test('buildStaticBanner: includes HOT MEMORY status line', async (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = await buildStaticBanner(dir);
  // Sidecar is not running in tests — should show offline status
  assert.ok(out.includes('HOT MEMORY:'), 'should include hot memory status');
  assert.ok(out.includes('offline') || out.includes('active'), 'should show online or offline');
});

test('buildStaticBanner: includes FIELDNOTES section when global fieldnotes exist', async (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = await buildStaticBanner(dir);
  // Global fieldnotes at ~/.lore/knowledge-base/fieldnotes/ — banner includes them if they exist
  const notes = getFieldnotes(dir);
  if (notes.length > 0) {
    assert.ok(out.includes('FIELDNOTES'));
  }
});

test('buildStaticBanner: includes RULES when rules directory has content', async (t) => {
  const dir = setup({
    rulesDir: {
      'coding.md': '# Coding\n\nSimplicity first.',
    },
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = await buildStaticBanner(dir);
  assert.ok(out.includes('RULES:'));
  assert.ok(out.includes('Simplicity first.'));
});

test('buildStaticBanner: shows [MINIMAL] tag when profile is minimal', async (t) => {
  const dir = setup({ config: { version: '1.0.0', profile: 'minimal' } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = await buildStaticBanner(dir);
  assert.ok(out.includes('[MINIMAL]'));
});

test('buildStaticBanner: shows [DISCOVERY] tag when profile is discovery', async (t) => {
  const dir = setup({ config: { version: '1.0.0', profile: 'discovery' } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = await buildStaticBanner(dir);
  assert.ok(out.includes('[DISCOVERY]'));
});

test('buildStaticBanner: no profile tag for standard', async (t) => {
  const dir = setup({ config: { version: '1.0.0', profile: 'standard' } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = await buildStaticBanner(dir);
  assert.ok(!out.includes('[STANDARD]'));
  assert.ok(!out.includes('[MINIMAL]'));
  assert.ok(!out.includes('[DISCOVERY]'));
});

test('buildStaticBanner: minimal profile shows PROFILE line', async (t) => {
  const dir = setup({ config: { profile: 'minimal' } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = await buildStaticBanner(dir);
  assert.ok(out.includes('PROFILE: minimal'));
  assert.ok(out.includes('Capture fieldnotes manually'));
});

test('buildStaticBanner: discovery profile shows PROFILE line', async (t) => {
  const dir = setup({ config: { profile: 'discovery' } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = await buildStaticBanner(dir);
  assert.ok(out.includes('PROFILE: discovery'));
  assert.ok(out.includes('capture aggressively'));
});

test('buildStaticBanner: standard profile has no PROFILE line', async (t) => {
  const dir = setup({ config: { profile: 'standard' } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = await buildStaticBanner(dir);
  assert.ok(!out.includes('PROFILE:'));
});

test('buildStaticBanner: includes banner-loaded skills in output', async (t) => {
  const dir = setup({
    skills: {
      'auto-skill': '---\nname: auto-skill\nbanner-loaded: "true"\n---\nAuto-loaded content.',
    },
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = await buildStaticBanner(dir);
  assert.ok(out.includes('Auto-loaded content.'));
});

// ---------------------------------------------------------------------------
// buildDynamicBanner
// ---------------------------------------------------------------------------

test('buildDynamicBanner: includes SESSION MEMORY when sidecar not configured', (t) => {
  const dir = setup({
    config: { docker: { search: null } },
    memory: '# Local Memory\n\nRemember this important thing.',
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildDynamicBanner(dir);
  assert.ok(out.includes('SESSION MEMORY:'));
  assert.ok(out.includes('Remember this important thing.'));
});

test('buildDynamicBanner: skips SESSION MEMORY when content is default', (t) => {
  const dir = setup({ memory: 'Transient memory for this session.' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildDynamicBanner(dir);
  assert.ok(!out.includes('SESSION MEMORY:'));
});

test('buildDynamicBanner: skips SESSION MEMORY when file does not exist', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildDynamicBanner(dir);
  assert.ok(!out.includes('SESSION MEMORY:'));
});

test('buildDynamicBanner: returns string', (t) => {
  const dir = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildDynamicBanner(dir);
  assert.equal(typeof out, 'string');
});

test('buildDynamicBanner: includes SESSION MEMORY regardless of config', (t) => {
  const dir = setup({
    memory: '# Local Memory\n\nRemember this important thing.',
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = buildDynamicBanner(dir);
  assert.ok(out.includes('SESSION MEMORY:'), 'session memory always shown when present');
  assert.ok(out.includes('Remember this important thing'), 'memory content included');
});
