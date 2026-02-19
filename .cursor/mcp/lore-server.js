#!/usr/bin/env node
// Lore MCP Server for Cursor
// JSON-RPC 2.0 over stdio with Content-Length header framing (MCP spec). Zero dependencies.
//
// Exposes two tools:
//   lore_check_in  — capture nudges, failure notes, compaction re-orientation
//   lore_context   — knowledge map + active work (navigation/post-compaction)
//
// Reads state files written by Cursor hooks (capture-nudge, failure-tracker,
// compaction-flag, knowledge-tracker). Read-only for state — hooks own the lifecycle.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
      msg = 'Gotcha? \u2192 skill | New knowledge? \u2192 docs';
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
];

// Route JSON-RPC requests to the appropriate handler.
// Only 4 methods needed: initialize handshake, post-init notification (no-op),
// tool listing, and tool dispatch.
function handleRequest(req) {
  const { id, method } = req;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
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

// ── Transport: Content-Length framed JSON-RPC over stdio (MCP spec) ──────────
// MCP uses the same framing as LSP: each message is preceded by a header block
// of "Content-Length: <N>\r\n\r\n" followed by exactly N bytes of JSON.
// stdout is the MCP channel — all debug logging goes to stderr only.

// Send a JSON-RPC response with Content-Length header framing.
function send(obj) {
  const body = JSON.stringify(obj);
  const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
  process.stdout.write(header + body);
}

// Parse incoming Content-Length framed messages from stdin.
// Accumulates chunks in a buffer and extracts complete messages as they arrive.
let buffer = Buffer.alloc(0);

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);

  // Process all complete messages in the buffer
  while (true) {
    // Look for the header/body separator (\r\n\r\n)
    const sepIndex = buffer.indexOf('\r\n\r\n');
    if (sepIndex === -1) break;

    // Extract Content-Length from the header block
    const header = buffer.slice(0, sepIndex).toString();
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      // Malformed header — skip past the separator and try again
      console.error('[lore-mcp] malformed header:', header);
      buffer = buffer.slice(sepIndex + 4);
      continue;
    }

    const contentLength = parseInt(match[1], 10);
    const bodyStart = sepIndex + 4;

    // Wait for the full body to arrive
    if (buffer.length < bodyStart + contentLength) break;

    // Extract and parse the JSON body
    const body = buffer.slice(bodyStart, bodyStart + contentLength).toString();
    buffer = buffer.slice(bodyStart + contentLength);

    try {
      const req = JSON.parse(body);
      const res = handleRequest(req);
      // Notifications (no id) get null back — don't send anything
      if (res) send(res);
    } catch (err) {
      console.error('[lore-mcp] parse error:', err.message);
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
  }
});

process.stdin.on('end', () => process.exit(0));
