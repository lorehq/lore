#!/usr/bin/env node
// Lore MCP Server for Cursor
// JSON-RPC 2.0 over stdio (newline-delimited JSON). Zero dependencies.
//
// Exposes three tools:
//   lore_check_in   — capture nudges, failure notes, compaction re-orientation
//   lore_context    — knowledge map + active work (navigation/post-compaction)
//   lore_write_guard — convention reminders based on target file path
//
// Reads state files written by Cursor hooks (capture-nudge, failure-tracker,
// compaction-flag, knowledge-tracker). Read-only for state — hooks own the lifecycle.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

// Hub resolution — linked repos set LORE_HUB to point back to the hub instance;
// direct instances resolve relative to this file's location (.cursor/mcp/ → repo root).
const hubDir = process.env.LORE_HUB || path.join(__dirname, '..', '..');
const cwd = process.cwd();

// ── Shared lib imports ──────────────────────────────────────────────────────

const { getThresholds, getNavFlagPath } = require(path.join(hubDir, 'lib', 'tracker'));
const { getAgentDomains, scanWork, buildTree } = require(path.join(hubDir, 'lib', 'banner'));
const { getConfig } = require(path.join(hubDir, 'lib', 'config'));

// ── State file resolution (same algorithm as capture-nudge.js) ──────────────

const hash = crypto.createHash('md5').update(cwd).digest('hex').slice(0, 8);
const gitDir = path.join(cwd, '.git');
const hasGit = fs.existsSync(gitDir);
const stateDir = hasGit ? gitDir : require('os').tmpdir();

const stateFile = path.join(stateDir, `lore-tracker-${hash}.json`);
const compactedPath = path.join(stateDir, 'lore-compacted');

function readState() {
  try {
    return { bash: 0, lastFailure: false, ...JSON.parse(fs.readFileSync(stateFile, 'utf8')) };
  } catch {
    return { bash: 0, lastFailure: false };
  }
}

// ── Tool implementations ────────────────────────────────────────────────────

// Core nudge delivery — replaces broken agent_message channel.
// Mirrors the logic in capture-nudge.js but is read-only for the state file
// (hooks own the write lifecycle: bash counter increments, failure flag clears).
// Compaction flag is the exception — both MCP and hook clear it (whoever reads first wins).
function loreCheckIn() {
  const state = readState();
  const navDirty = fs.existsSync(getNavFlagPath(hubDir));
  const compacted = fs.existsSync(compactedPath);

  let msg;

  if (compacted) {
    // Post-compaction re-orientation — highest priority, delivers key context
    const cfg = getConfig(hubDir);
    const version = cfg.version ? `v${cfg.version}` : '';
    const domains = getAgentDomains(hubDir);
    const delegateStr = domains.length > 0 ? domains.join(', ') : 'none';
    msg = `[COMPACTED] Lore ${version} | Delegate: ${delegateStr} | Re-read .cursor/rules/ and project context`;
    // Clear flag — both MCP and hook race to clear; harmless if already gone
    try { fs.unlinkSync(compactedPath); } catch {}
  } else {
    // Normal operation — escalating nudge based on consecutive bash count
    const { nudge, warn } = getThresholds(hubDir);
    if (state.bash >= warn) {
      msg = `>>> ${state.bash} consecutive commands \u2014 capture what you learned \u2192 lore-create-skill <<<`;
    } else if (state.bash >= nudge) {
      msg = `>>> ${state.bash} commands in a row \u2014 gotcha worth a skill? <<<`;
    } else {
      msg = 'Gotcha? \u2192 skill | New context? \u2192 docs/knowledge/';
    }
  }

  // Prepend failure note if a tool failed since last shell command
  if (state.lastFailure) {
    msg = `Error pattern worth a skill? | ${msg}`;
  }

  // Append nav-dirty reminder if docs/ were edited without regenerating nav
  if (navDirty) {
    msg += ' | docs/ changed \u2014 run generate-nav.sh';
  }

  return msg;
}

// Full knowledge context — heavier call for navigation and post-compaction recovery.
// Reuses the same scanWork/buildTree/getAgentDomains from lib/banner.js that the
// session banner uses, so output stays consistent across platforms.
function loreContext() {
  const cfg = getConfig(hubDir);
  const version = cfg.version ? `v${cfg.version}` : '(unknown)';
  const treeDepth = cfg.treeDepth ?? 5;
  const domains = getAgentDomains(hubDir);

  // Scan active roadmaps and plans from docs/work/ frontmatter
  const docsWork = path.join(hubDir, 'docs', 'work');
  const roadmaps = scanWork(path.join(docsWork, 'roadmaps'));
  const plans = scanWork(path.join(docsWork, 'plans'));

  // Build ASCII directory tree — same three roots as the session banner
  const trees = [];
  const pairs = [
    ['docs', path.join(hubDir, 'docs')],
    ['.lore/skills', path.join(hubDir, '.lore', 'skills')],
    ['.lore/agents', path.join(hubDir, '.lore', 'agents')],
  ];
  for (const [label, dir] of pairs) {
    const lines = buildTree(dir, '', { maxDepth: treeDepth });
    if (lines.length) trees.push(label + '/\n' + lines.join('\n'));
  }

  // Local memory — gitignored scratch notes that persist across sessions
  let memory = '';
  try {
    const mem = fs.readFileSync(path.join(hubDir, 'MEMORY.local.md'), 'utf8').trim();
    if (mem && mem !== '# Local Memory') memory = mem;
  } catch {}

  // Assemble output — version and delegation always present, rest conditional
  const parts = [`Lore ${version}`];
  parts.push(`Delegation domains: ${domains.length > 0 ? domains.join(', ') : '(none)'}`);
  if (roadmaps.length > 0) parts.push(`Active roadmaps: ${roadmaps.join('; ')}`);
  if (plans.length > 0) parts.push(`Active plans: ${plans.join('; ')}`);
  if (trees.length > 0) parts.push(`\nKnowledge map:\n${trees.join('\n')}`);
  if (memory) parts.push(`\nLocal memory:\n${memory}`);

  return parts.join('\n');
}

// Convention guard — returns relevant convention principles for a file path.
// Reads the actual convention files and extracts bold principle lines so
// reminders stay in sync with the source of truth (no duplication).
function extractPrinciples(filename) {
  const convPath = path.join(hubDir, 'docs', 'context', 'conventions', filename);
  try {
    const content = fs.readFileSync(convPath, 'utf8');
    const principles = [];
    for (const line of content.split('\n')) {
      const match = line.match(/^\*\*(.+?)\*\*$/);
      if (match) principles.push(match[1]);
    }
    return principles;
  } catch {
    return [];
  }
}

function loreWriteGuard(filePath) {
  if (!filePath) return 'No file path provided.';

  const resolved = path.resolve(filePath);
  const repoPrefix = path.resolve(hubDir) + path.sep;
  if (!resolved.startsWith(repoPrefix)) return 'File is outside this repo.';

  const relative = resolved.slice(repoPrefix.length);
  const conventions = [];

  // Security: always
  const security = extractPrinciples('security.md');
  if (security.length > 0) conventions.push('Security: ' + security.join(' | '));

  // Docs convention for all docs/ paths
  const isDocs = relative.startsWith('docs/') || relative.startsWith('docs\\');
  if (isDocs) {
    const docs = extractPrinciples('docs.md');
    if (docs.length > 0) conventions.push('Docs: ' + docs.join(' | '));
  }

  // Domain-specific
  const isWork = relative.startsWith('docs/work/') || relative.startsWith('docs\\work\\');
  const isKnowledge = relative.startsWith('docs/knowledge/') || relative.startsWith('docs\\knowledge\\');
  if (isWork) {
    const workItems = extractPrinciples('work-items.md');
    if (workItems.length > 0) conventions.push('Work items: ' + workItems.join(' | '));
  } else if (isKnowledge) {
    const knowledge = extractPrinciples('knowledge-capture.md');
    if (knowledge.length > 0) conventions.push('Knowledge: ' + knowledge.join(' | '));
  }

  // Menu of conventions not already injected
  const injected = new Set(['index.md', 'security.md']);
  if (isDocs) injected.add('docs.md');
  if (isWork) injected.add('work-items.md');
  if (isKnowledge) injected.add('knowledge-capture.md');

  const convDir = path.join(hubDir, 'docs', 'context', 'conventions');
  try {
    const files = fs.readdirSync(convDir).filter((f) => f.endsWith('.md') && !injected.has(f));
    if (files.length > 0) {
      const names = files.map((f) => f.replace(/\.md$/, ''));
      conventions.push('Other conventions: ' + names.join(', ') + ' — read docs/context/conventions/<name>.md if relevant');
    }
  } catch {}

  return conventions.length > 0 ? conventions.join('\n') : 'No conventions apply.';
}

// ── MCP protocol ────────────────────────────────────────────────────────────

const SERVER_INFO = {
  name: 'lore',
  version: getConfig(hubDir).version || '0.0.0',
};

const TOOLS = [
  {
    name: 'lore_check_in',
    description: 'Check for capture nudges, failure notes, and compaction state. Call after every 2-3 shell commands.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'lore_context',
    description: 'Get knowledge map, active work, and delegation domains. Use when navigating the knowledge base or after context compaction.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'lore_write_guard',
    description: 'Get convention reminders before writing a file. MUST be called before every file write or edit. Returns security, docs, knowledge, or work-item conventions based on the target path.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'The absolute path of the file about to be written or edited.' },
      },
      required: ['file_path'],
    },
  },
];

// Route JSON-RPC requests to the appropriate handler.
// Only 4 methods needed: initialize handshake, post-init notification (no-op),
// tool listing, and tool dispatch.
function handleRequest(req) {
  const { id, method } = req;

  // Cursor sends protocolVersion 2025-11-25 — echo it back for compatibility.
  // The server doesn't use version-specific features, so matching the client works.
  if (method === 'initialize') {
    const clientVersion = req.params?.protocolVersion || '2024-11-05';
    return {
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: clientVersion,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      },
    };
  }

  // MCP spec requires acknowledging this notification — no response payload
  if (method === 'notifications/initialized') {
    return null;
  }

  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
  }

  if (method === 'tools/call') {
    const toolName = req.params?.name;
    let text;
    if (toolName === 'lore_check_in') {
      text = loreCheckIn();
    } else if (toolName === 'lore_context') {
      text = loreContext();
    } else if (toolName === 'lore_write_guard') {
      text = loreWriteGuard(req.params?.arguments?.file_path || '');
    } else {
      return {
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true },
      };
    }
    return {
      jsonrpc: '2.0', id,
      result: { content: [{ type: 'text', text }] },
    };
  }

  return {
    jsonrpc: '2.0', id,
    error: { code: -32601, message: `Method not found: ${method}` },
  };
}

// ── Transport: newline-delimited JSON-RPC over stdio ────────────────────────
// Cursor sends one JSON-RPC message per line (terminated by \n).
// Responses are written the same way — one JSON line + newline.
// All debug logging goes to stderr only — stdout is the MCP channel.

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    const req = JSON.parse(line);
    const res = handleRequest(req);
    // Notifications (no id) get null back — don't send anything
    if (res) process.stdout.write(JSON.stringify(res) + '\n');
  } catch (err) {
    console.error('[lore-mcp] parse error:', err.message);
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0', id: null,
      error: { code: -32700, message: 'Parse error' },
    }) + '\n');
  }
});

rl.on('close', () => process.exit(0));
