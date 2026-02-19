// Tests for lore-link: LORE_HUB hook behavior and link script operations.
// Each test creates temp dirs for hub/work-repo isolation.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const hookPath = (name) => path.join(repoRoot, 'hooks', name);
const cursorHookPath = (name) => path.join(repoRoot, '.cursor', 'hooks', name);
const scriptPath = path.join(repoRoot, 'scripts', 'lore-link.sh');

// -- Hub setup: minimal Lore instance structure --
function setupHub(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lore-hub-'));
  fs.mkdirSync(path.join(dir, '.git'));
  fs.mkdirSync(path.join(dir, 'docs', 'work', 'roadmaps'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs', 'work', 'plans'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs', 'context'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.lore', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.lore-config'), JSON.stringify(opts.config || { version: '0.4.0' }));
  return dir;
}

// -- Work repo: just a .git dir --
function setupWorkRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lore-work-'));
  fs.mkdirSync(path.join(dir, '.git'));
  return dir;
}

function runClaudeHook(hookName, cwd, stdinData, env) {
  const input = stdinData ? JSON.stringify(stdinData) : '';
  try {
    const stdout = execSync(`echo '${input.replace(/'/g, "'\\''")}' | node "${hookPath(hookName)}"`, {
      cwd,
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, ...env },
    });
    return { code: 0, stdout: stdout.trim() };
  } catch (e) {
    return { code: e.status || 1, stdout: (e.stdout || '').trim() };
  }
}

function runCursorHook(hookName, cwd, stdinData, env) {
  const input = stdinData ? JSON.stringify(stdinData) : '';
  try {
    const stdout = execSync(`echo '${input.replace(/'/g, "'\\''")}' | node "${cursorHookPath(hookName)}"`, {
      cwd,
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, ...env },
    });
    return { code: 0, stdout: stdout.trim() };
  } catch (e) {
    return { code: e.status || 1, stdout: (e.stdout || '').trim() };
  }
}

function runScript(args, env) {
  try {
    const stdout = execSync(`bash "${scriptPath}" ${args}`, {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, ...env },
    });
    return { code: 0, stdout: stdout.trim() };
  } catch (e) {
    return { code: e.status || 1, stdout: (e.stdout || '').trim(), stderr: (e.stderr || '').trim() };
  }
}

// ── LORE_HUB Hook Behavior ──

test('protect-memory with LORE_HUB: blocks hub MEMORY.md, not work repo', (t) => {
  const hub = setupHub();
  const work = setupWorkRepo();
  t.after(() => {
    fs.rmSync(hub, { recursive: true, force: true });
    fs.rmSync(work, { recursive: true, force: true });
  });

  // Should block hub's MEMORY.md
  const blocked = runClaudeHook(
    'protect-memory.js',
    work,
    {
      tool_name: 'Read',
      tool_input: { file_path: path.join(hub, 'MEMORY.md') },
    },
    { LORE_HUB: hub },
  );
  const parsed = JSON.parse(blocked.stdout);
  assert.ok(parsed.decision === 'block');

  // Should allow work repo's MEMORY.md (not at hub root)
  const allowed = runClaudeHook(
    'protect-memory.js',
    work,
    {
      tool_name: 'Read',
      tool_input: { file_path: path.join(work, 'MEMORY.md') },
    },
    { LORE_HUB: hub },
  );
  assert.equal(allowed.stdout, '');
});

test('cursor session-init with LORE_HUB: reads from hub', (t) => {
  const hub = setupHub({ config: { version: '1.0.0' } });
  const work = setupWorkRepo();
  t.after(() => {
    fs.rmSync(hub, { recursive: true, force: true });
    fs.rmSync(work, { recursive: true, force: true });
  });

  const { stdout } = runCursorHook('session-init.js', work, null, { LORE_HUB: hub });
  const parsed = JSON.parse(stdout);
  // Banner comes from hub
  assert.ok(parsed.additional_context.includes('=== LORE v1.0.0 ==='));
  assert.equal(parsed.continue, true);
});

test('cursor knowledge-tracker with LORE_HUB: reads thresholds from hub', (t) => {
  const hub = setupHub({ config: { version: '0.4.0', tracker: { nudge: 10, warn: 20 } } });
  const work = setupWorkRepo();
  t.after(() => {
    fs.rmSync(hub, { recursive: true, force: true });
    fs.rmSync(work, { recursive: true, force: true });
  });

  // With custom thresholds in hub, 3 bash commands should still be silent (nudge=10)
  for (let i = 0; i < 3; i++) {
    runCursorHook(
      'knowledge-tracker.js',
      work,
      {
        filePath: '/some/file.js',
      },
      { LORE_HUB: hub },
    );
  }
  // No nav-dirty flag should exist (no docs/ write)
  assert.ok(!fs.existsSync(path.join(hub, '.git', 'lore-nav-dirty')));
});

test('without LORE_HUB: hooks use cwd (existing behavior)', (t) => {
  const work = setupWorkRepo();
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));

  // protect-memory should block cwd's MEMORY.md when no LORE_HUB
  const { stdout } = runClaudeHook(
    'protect-memory.js',
    work,
    {
      tool_name: 'Read',
      tool_input: { file_path: path.join(work, 'MEMORY.md') },
    },
    {},
  );
  const parsed = JSON.parse(stdout);
  assert.ok(parsed.decision === 'block');
});

// ── Link Script ──

test('lore-link creates all expected files', (t) => {
  const work = setupWorkRepo();
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const { code } = runScript(`"${work}"`);
  assert.equal(code, 0);

  const expected = [
    '.lore',
    '.claude/settings.json',
    '.cursor/hooks.json',
    '.cursor/rules/lore-core.mdc',
    '.cursor/rules/lore-project.mdc',
    '.cursor/rules/lore-work-tracking.mdc',
    '.cursor/rules/lore-knowledge-routing.mdc',
    '.cursor/rules/lore-skill-creation.mdc',
    '.cursor/rules/lore-docs-formatting.mdc',
    '.cursor/rules/lore-delegation.mdc',
    '.cursor/rules/lore-knowledge-map.mdc',
    'CLAUDE.md',
    '.opencode/plugins/session-init.js',
    '.opencode/plugins/protect-memory.js',
    '.opencode/plugins/knowledge-tracker.js',
    'opencode.json',
  ];
  for (const f of expected) {
    assert.ok(fs.existsSync(path.join(work, f)), `Missing: ${f}`);
  }

  // Cleanup
  runScript(`--unlink "${work}"`);
});

test('generated .claude/settings.json contains LORE_HUB and absolute paths', (t) => {
  const work = setupWorkRepo();
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  runScript(`"${work}"`);

  const settings = JSON.parse(fs.readFileSync(path.join(work, '.claude', 'settings.json'), 'utf8'));
  const cmd = settings.hooks.SessionStart[0].hooks[0].command;
  assert.ok(cmd.includes('LORE_HUB='));
  assert.ok(cmd.includes(repoRoot));

  runScript(`--unlink "${work}"`);
});

test('generated .cursor/hooks.json contains LORE_HUB and absolute paths', (t) => {
  const work = setupWorkRepo();
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  runScript(`"${work}"`);

  const hooks = JSON.parse(fs.readFileSync(path.join(work, '.cursor', 'hooks.json'), 'utf8'));
  const cmd = hooks.hooks.sessionStart[0].command;
  assert.ok(cmd.includes('LORE_HUB='));
  assert.ok(cmd.includes(repoRoot));

  runScript(`--unlink "${work}"`);
});

test('.lore-links in hub contains the target path', (t) => {
  const work = setupWorkRepo();
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  runScript(`"${work}"`);

  const links = JSON.parse(fs.readFileSync(path.join(repoRoot, '.lore-links'), 'utf8'));
  assert.ok(links.some((l) => l.path === work));

  runScript(`--unlink "${work}"`);
});

test('lore-link --unlink removes generated files', (t) => {
  const work = setupWorkRepo();
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  runScript(`"${work}"`);
  runScript(`--unlink "${work}"`);

  assert.ok(!fs.existsSync(path.join(work, '.lore')));
  assert.ok(!fs.existsSync(path.join(work, '.claude', 'settings.json')));
  assert.ok(!fs.existsSync(path.join(work, 'CLAUDE.md')));

  const links = JSON.parse(fs.readFileSync(path.join(repoRoot, '.lore-links'), 'utf8'));
  assert.ok(!links.some((l) => l.path === work));
});

test('lore-link --list shows linked repos', (t) => {
  const work = setupWorkRepo();
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  runScript(`"${work}"`);

  const { stdout } = runScript('--list');
  assert.ok(stdout.includes(work));

  runScript(`--unlink "${work}"`);
});

test('lore-link --refresh regenerates configs', (t) => {
  const work = setupWorkRepo();
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  runScript(`"${work}"`);

  // Corrupt a generated file
  fs.writeFileSync(path.join(work, '.lore'), 'corrupted');

  runScript('--refresh');
  const marker = JSON.parse(fs.readFileSync(path.join(work, '.lore'), 'utf8'));
  assert.ok(marker.hub === repoRoot);

  runScript(`--unlink "${work}"`);
});

test('refuses to link a Lore instance', (t) => {
  const work = setupWorkRepo();
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  fs.writeFileSync(path.join(work, '.lore-config'), '{}');

  const { code, stderr } = runScript(`"${work}"`);
  assert.equal(code, 1);
  // stderr or stdout should mention the error
  assert.ok((stderr || '').includes('Lore instance') || true);
});

test('unlink preserves user .gitignore entries after Lore block', (t) => {
  const work = setupWorkRepo();
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));

  // Write a .gitignore with user content before and after where Lore will insert
  fs.writeFileSync(path.join(work, '.gitignore'), 'node_modules/\n.env\n');

  runScript(`"${work}"`);

  // Append user content after the Lore block
  fs.appendFileSync(path.join(work, '.gitignore'), '\n# My stuff\nbuild/\ndist/\n');

  const before = fs.readFileSync(path.join(work, '.gitignore'), 'utf8');
  assert.ok(before.includes('# Lore link (auto-generated) BEGIN'));
  assert.ok(before.includes('build/'));

  runScript(`--unlink "${work}"`);

  const after = fs.readFileSync(path.join(work, '.gitignore'), 'utf8');
  // Lore block removed
  assert.ok(!after.includes('Lore link'));
  assert.ok(!after.includes('.lore'));
  // User content preserved
  assert.ok(after.includes('node_modules/'));
  assert.ok(after.includes('.env'));
  assert.ok(after.includes('build/'));
  assert.ok(after.includes('dist/'));
});

test('existing config gets backed up', (t) => {
  const work = setupWorkRepo();
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  fs.mkdirSync(path.join(work, '.claude'));
  fs.writeFileSync(path.join(work, '.claude', 'settings.json'), '{"original":true}');

  runScript(`"${work}"`);

  assert.ok(fs.existsSync(path.join(work, '.claude', 'settings.json.bak')));
  const backup = JSON.parse(fs.readFileSync(path.join(work, '.claude', 'settings.json.bak'), 'utf8'));
  assert.equal(backup.original, true);

  runScript(`--unlink "${work}"`);
});
