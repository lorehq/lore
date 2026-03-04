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

  const hooksDir = path.join(dir, '.lore', 'harness', 'hooks', 'lib');
  fs.mkdirSync(hooksDir, { recursive: true });

  // Copy all hooks used across these tests
  const hooks = [
    'prompt-preamble.js',
    'memory-nudge.js',
    'protect-memory.js',
    'harness-guard.js',
  ];
  for (const hook of hooks) {
    fs.copyFileSync(path.join(__dirname, '..', '.lore', 'harness', 'hooks', hook), path.join(dir, '.lore', 'harness', 'hooks', hook));
  }

  // Copy hooks/lib/
  const srcHooksLib = path.join(__dirname, '..', '.lore', 'harness', 'hooks', 'lib');
  for (const f of fs.readdirSync(srcHooksLib)) {
    fs.copyFileSync(path.join(srcHooksLib, f), path.join(dir, '.lore', 'harness', 'hooks', 'lib', f));
  }

  // Copy .lore/harness/lib/
  const libDir = path.join(dir, '.lore', 'harness', 'lib');
  fs.mkdirSync(libDir, { recursive: true });
  const srcLib = path.join(__dirname, '..', '.lore', 'harness', 'lib');
  for (const f of fs.readdirSync(srcLib)) {
    fs.copyFileSync(path.join(srcLib, f), path.join(libDir, f));
  }

  // Create .lore/agents/ (prompt-preamble scans it)
  fs.mkdirSync(path.join(dir, '.lore', 'agents'), { recursive: true });

  // Create .git/ for memory-nudge state file and hook-logger log path
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
    const out = execSync('node .lore/harness/hooks/prompt-preamble.js', { cwd: dir, encoding: 'utf8' });
    assert.equal(out, '', 'should produce no output in minimal profile');
  } finally {
    cleanup(dir);
  }
});

test('prompt-preamble: produces output in standard profile', () => {
  const dir = setup({ config: { profile: 'standard' } });
  try {
    const out = execSync('node .lore/harness/hooks/prompt-preamble.js', { cwd: dir, encoding: 'utf8' });
    assert.ok(out.length > 0, 'should produce output in standard profile');
  } finally {
    cleanup(dir);
  }
});

// -- memory-nudge --

test('memory-nudge: no output in minimal profile', () => {
  const dir = setup({ config: { profile: 'minimal' } });
  try {
    const out = execSync('node .lore/harness/hooks/memory-nudge.js', {
      cwd: dir,
      encoding: 'utf8',
      input: JSON.stringify({ tool_name: 'Bash', tool_input: {}, hook_event_name: 'PostToolUse' }),
    });
    assert.equal(out, '', 'should produce no output in minimal profile');
  } finally {
    cleanup(dir);
  }
});

test('memory-nudge: produces output in standard profile', () => {
  const dir = setup({ config: { profile: 'standard' } });
  try {
    const out = execSync('node .lore/harness/hooks/memory-nudge.js', {
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
    const out = execSync('node .lore/harness/hooks/protect-memory.js', {
      cwd: dir,
      encoding: 'utf8',
      input: JSON.stringify({
        tool_name: 'Write',
        tool_input: { file_path: path.join(dir, 'MEMORY.md') },
        hook_event_name: 'PreToolUse',
      }),
    });
    const parsed = JSON.parse(out);
    assert.equal(
      parsed.hookSpecificOutput.permissionDecision,
      'deny',
      'should block MEMORY.md write in minimal profile',
    );
  } finally {
    cleanup(dir);
  }
});

// -- harness-guard: now only protects global directory path (~/.lore/) --

test('harness-guard: no output for project-level harness file write', () => {
  const dir = setup({ config: { profile: 'minimal' } });
  try {
    const out = execSync('node .lore/harness/hooks/harness-guard.js', {
      cwd: dir,
      encoding: 'utf8',
      input: JSON.stringify({
        tool_name: 'Write',
        tool_input: { file_path: path.join(dir, '.lore', 'harness', 'hooks', 'session-init.js') },
        hook_event_name: 'PreToolUse',
      }),
    });
    // harness-guard now only blocks global directory writes; project-level harness writes produce no output
    assert.equal(out.trim(), '', 'should produce no output for project-level harness file write');
  } finally {
    cleanup(dir);
  }
});

