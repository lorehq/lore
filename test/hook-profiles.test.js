const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Integration tests for profile: 'minimal' vs 'standard'.
// Each test copies relevant hook files and lib files to a temp dir,
// writes a .lore/config.json, and runs the hook as a subprocess.

function setup(opts = {}) {
  // realpathSync: macOS /var -> /private/var symlink must match process.cwd() in children
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lore-test-profiles-')));

  const hooksDir = path.join(dir, '.lore', 'hooks', 'lib');
  fs.mkdirSync(hooksDir, { recursive: true });

  // Copy all hooks used across these tests
  const hooks = [
    'prompt-preamble.js',
    'knowledge-tracker.js',
    'protect-memory.js',
    'framework-guard.js',
    'convention-guard.js',
    'context-path-guide.js',
  ];
  for (const hook of hooks) {
    fs.copyFileSync(
      path.join(__dirname, '..', '.lore', 'hooks', hook),
      path.join(dir, '.lore', 'hooks', hook),
    );
  }

  // Copy hooks/lib/
  const srcHooksLib = path.join(__dirname, '..', '.lore', 'hooks', 'lib');
  for (const f of fs.readdirSync(srcHooksLib)) {
    fs.copyFileSync(path.join(srcHooksLib, f), path.join(dir, '.lore', 'hooks', 'lib', f));
  }

  // Copy .lore/lib/
  const libDir = path.join(dir, '.lore', 'lib');
  fs.mkdirSync(libDir, { recursive: true });
  const srcLib = path.join(__dirname, '..', '.lore', 'lib');
  for (const f of fs.readdirSync(srcLib)) {
    fs.copyFileSync(path.join(srcLib, f), path.join(libDir, f));
  }

  // Copy .cursor/hooks/ for capture-nudge profile tests
  const cursorHooksDir = path.join(dir, '.cursor', 'hooks');
  fs.mkdirSync(cursorHooksDir, { recursive: true });
  const cursorSrc = path.join(__dirname, '..', '.cursor', 'hooks');
  for (const f of fs.readdirSync(cursorSrc)) {
    fs.copyFileSync(path.join(cursorSrc, f), path.join(cursorHooksDir, f));
  }

  // Create .lore/agents/ (prompt-preamble scans it)
  fs.mkdirSync(path.join(dir, '.lore', 'agents'), { recursive: true });

  // Create .git/ for knowledge-tracker state file and hook-logger log path
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });

  if (opts.config) {
    fs.writeFileSync(path.join(dir, '.lore', 'config.json'), JSON.stringify(opts.config));
  }

  return dir;
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// -- prompt-preamble --

test('prompt-preamble: no output in minimal profile', () => {
  const dir = setup({ config: { profile: 'minimal' } });
  try {
    const out = execSync('node .lore/hooks/prompt-preamble.js', { cwd: dir, encoding: 'utf8' });
    assert.equal(out, '', 'should produce no output in minimal profile');
  } finally {
    cleanup(dir);
  }
});

test('prompt-preamble: produces output in standard profile', () => {
  const dir = setup({ config: { profile: 'standard' } });
  try {
    const out = execSync('node .lore/hooks/prompt-preamble.js', { cwd: dir, encoding: 'utf8' });
    assert.ok(out.length > 0, 'should produce output in standard profile');
  } finally {
    cleanup(dir);
  }
});

// -- knowledge-tracker --

test('knowledge-tracker: no output in minimal profile', () => {
  const dir = setup({ config: { profile: 'minimal' } });
  try {
    const out = execSync('node .lore/hooks/knowledge-tracker.js', {
      cwd: dir,
      encoding: 'utf8',
      input: JSON.stringify({ tool_name: 'Bash', tool_input: {}, hook_event_name: 'PostToolUse' }),
    });
    assert.equal(out, '', 'should produce no output in minimal profile');
  } finally {
    cleanup(dir);
  }
});

test('knowledge-tracker: produces output in standard profile', () => {
  const dir = setup({ config: { profile: 'standard' } });
  try {
    const out = execSync('node .lore/hooks/knowledge-tracker.js', {
      cwd: dir,
      encoding: 'utf8',
      input: JSON.stringify({ tool_name: 'Bash', tool_input: {}, hook_event_name: 'PostToolUse' }),
    });
    assert.ok(out.length > 0, 'should produce output in standard profile');
  } finally {
    cleanup(dir);
  }
});

// -- protect-memory: blocks in both profiles --

test('protect-memory: blocks MEMORY.md write in minimal profile', () => {
  const dir = setup({ config: { profile: 'minimal' } });
  try {
    const out = execSync('node .lore/hooks/protect-memory.js', {
      cwd: dir,
      encoding: 'utf8',
      input: JSON.stringify({
        tool_name: 'Write',
        tool_input: { file_path: path.join(dir, 'MEMORY.md') },
        hook_event_name: 'PreToolUse',
      }),
    });
    assert.ok(out.includes('"decision":"block"'), 'should block MEMORY.md write in minimal profile');
  } finally {
    cleanup(dir);
  }
});

// -- framework-guard: warns in both profiles --

test('framework-guard: warns on framework file write in minimal profile', () => {
  const dir = setup({ config: { profile: 'minimal' } });
  try {
    const out = execSync('node .lore/hooks/framework-guard.js', {
      cwd: dir,
      encoding: 'utf8',
      input: JSON.stringify({
        tool_name: 'Write',
        tool_input: { file_path: path.join(dir, '.lore', 'hooks', 'session-init.js') },
        hook_event_name: 'PreToolUse',
      }),
    });
    assert.ok(out.includes('"decision":"proceed"'), 'should include proceed decision');
    assert.ok(out.includes('WARNING'), 'should include WARNING in output');
  } finally {
    cleanup(dir);
  }
});

// -- capture-nudge (Cursor) --

test('capture-nudge: bare allow in minimal profile (no agent_message)', () => {
  const dir = setup({ config: { profile: 'minimal' } });
  try {
    const out = execSync('node .cursor/hooks/capture-nudge.js', {
      cwd: dir,
      encoding: 'utf8',
    });
    const parsed = JSON.parse(out.trim());
    assert.equal(parsed.permission, 'allow');
    assert.equal(parsed.agent_message, undefined, 'should not include agent_message in minimal');
  } finally {
    cleanup(dir);
  }
});

test('capture-nudge: has agent_message in standard profile', () => {
  const dir = setup({ config: { profile: 'standard' } });
  try {
    const out = execSync('node .cursor/hooks/capture-nudge.js', {
      cwd: dir,
      encoding: 'utf8',
    });
    const parsed = JSON.parse(out.trim());
    assert.equal(parsed.permission, 'allow');
    assert.ok(parsed.agent_message, 'should include agent_message in standard');
  } finally {
    cleanup(dir);
  }
});
