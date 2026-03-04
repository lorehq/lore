#!/usr/bin/env node
// Lore MCP Server — Knowledge Base, Hot Memory, and Fieldnotes
// JSON-RPC 2.0 over stdio (newline-delimited JSON). Zero dependencies.
//
// Tools:
//   lore_search            — semantic search across the knowledge base
//   lore_read              — read a knowledge base file by path
//   lore_health            — sidecar health and index status
//   lore_hot_recall        — list hot memory facts with scores
//   lore_hot_write         — write a fact to hot memory (agent scratchpad)
//   lore_hot_fieldnote     — draft a fieldnote in hot memory for later graduation
//   lore_hot_session_note  — record session context (decisions, scope, rejected approaches)
//
// Connects to the global sidecar at localhost:<sidecarPort> (default 9185).
// Platform-agnostic — works with Claude Code, Cursor, Gemini, and OpenCode.

const fs = require('fs');
const path = require('path');
const http = require('http');
const readline = require('readline');

// Resolve repo root relative to this file's location (.lore/harness/mcp/ → repo root).
const hubDir = path.join(__dirname, '..', '..', '..');

// ── Shared lib imports ──────────────────────────────────────────────────────

const { getConfig, getGlobalPath } = require(path.join(hubDir, '.lore', 'harness', 'lib', 'config'));
const { getSidecarPort, getGlobalToken } = require(path.join(hubDir, '.lore', 'harness', 'lib', 'global'));

// ── Constants ───────────────────────────────────────────────────────────────

const MAX_LINES_PER_FILE = 500;
const HTTP_TIMEOUT_MS = 10000;

// ── HTTP helpers ────────────────────────────────────────────────────────────

function sidecarUrl(pathname) {
  return `http://localhost:${getSidecarPort()}${pathname}`;
}

function authHeaders() {
  const token = getGlobalToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers: authHeaders() }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(HTTP_TIMEOUT_MS, () => { req.destroy(new Error('Request timed out')); });
  });
}

function httpPost(url, body) {
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...authHeaders(),
      },
    }, (res) => {
      let respData = '';
      res.on('data', (chunk) => { respData += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(respData);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${respData.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(HTTP_TIMEOUT_MS, () => { req.destroy(new Error('Request timed out')); });
    req.write(data);
    req.end();
  });
}

// ── Path resolution ─────────────────────────────────────────────────────────
// Search results return paths relative to the mounted knowledge base volume.
// Resolve them to absolute paths on the host filesystem.

function resolveSearchPath(resultPath) {
  const globalKB = path.join(getGlobalPath(), 'knowledge-base');
  const resolved = path.join(globalKB, resultPath);
  if (fs.existsSync(resolved)) return resolved;

  // Fallback: try project docs/ for legacy indexed content
  const docsPath = path.join(hubDir, 'docs', resultPath);
  if (fs.existsSync(docsPath)) return docsPath;

  return resolved;
}

function readFileContent(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    if (lines.length > MAX_LINES_PER_FILE) {
      return (
        lines.slice(0, MAX_LINES_PER_FILE).join('\n') +
        `\n[...truncated at ${MAX_LINES_PER_FILE} lines, full file at ${filePath}]`
      );
    }
    return content;
  } catch {
    return `[Could not read file: ${filePath}]`;
  }
}

// ── Tool implementations ────────────────────────────────────────────────────

async function loreSearch(query, k) {
  if (!query || !query.trim()) {
    return 'Error: query parameter is required.';
  }

  const searchK = Math.max(1, Math.min(k || 5, 20));
  const url = sidecarUrl(`/search?q=${encodeURIComponent(query)}&k=${searchK}&mode=full`);

  let raw;
  try {
    raw = await httpGet(url);
  } catch (err) {
    return `Sidecar unavailable: ${err.message}\nFall back to Glob/Grep for knowledge base searches.`;
  }

  let results;
  try {
    const parsed = JSON.parse(raw);
    results = Array.isArray(parsed) ? parsed : parsed.results || [];
  } catch {
    return `Unexpected response from sidecar:\n${raw.slice(0, 500)}`;
  }

  if (results.length === 0) {
    return `No results found for: "${query}"`;
  }

  const parts = [];
  for (const result of results) {
    const resultPath = result.path || result.file || '';
    const score = result.score != null ? result.score.toFixed(3) : '?';
    const snippet = result.snippet || '';
    const fsPath = resolveSearchPath(resultPath);
    parts.push(`--- ${resultPath} (score: ${score}) ---\n${snippet}\n→ ${fsPath}`);
  }
  return parts.join('\n\n');
}

function loreRead(filePath) {
  if (!filePath || !filePath.trim()) {
    return 'Error: file_path parameter is required.';
  }
  return readFileContent(path.resolve(filePath));
}

async function loreHealth() {
  try {
    const raw = await httpGet(sidecarUrl('/health'));
    const health = JSON.parse(raw);
    const parts = [`Status: ${health.ok ? 'healthy' : 'unhealthy'}`];
    if (health.file_count != null) parts.push(`Files indexed: ${health.file_count}`);
    if (health.chunk_count != null) parts.push(`Chunks: ${health.chunk_count}`);
    if (health.last_indexed_at) parts.push(`Last indexed: ${health.last_indexed_at}`);
    return parts.join('\n');
  } catch (err) {
    return `Sidecar unavailable: ${err.message}\nStart with: docker compose -f ~/.lore/docker-compose.yml up -d`;
  }
}

async function loreHotRecall(limit) {
  const n = Math.max(1, Math.min(limit || 10, 50));
  try {
    const raw = await httpGet(sidecarUrl(`/memory/hot?limit=${n}`));
    const facts = JSON.parse(raw);
    if (!Array.isArray(facts) || facts.length === 0) {
      return 'No hot memory facts.';
    }
    const parts = facts.map((f) => {
      const score = f.current_score != null ? f.current_score.toFixed(2) : '?';
      const label = f.key || f.path || f.id || 'unknown';
      const content = f.content || f.value || '';
      return `[${score}] ${label}${content ? '\n' + content : ''}`;
    });
    return `${facts.length} hot facts:\n\n${parts.join('\n\n')}`;
  } catch (err) {
    return `Sidecar unavailable: ${err.message}`;
  }
}

async function loreHotWrite(key, content) {
  if (!key || !key.trim()) {
    return 'Error: key parameter is required.';
  }
  if (!content || !content.trim()) {
    return 'Error: content parameter is required.';
  }
  try {
    await httpPost(sidecarUrl('/memory/write'), { key: key.trim(), content: content.trim() });
    return `Recorded to hot memory: ${key}`;
  } catch (err) {
    return `Failed to write to hot memory: ${err.message}`;
  }
}

async function loreHotFieldnote(name, description, body) {
  if (!name || !name.trim()) {
    return 'Error: name parameter is required.';
  }
  if (!body || !body.trim()) {
    return 'Error: body parameter is required.';
  }
  const fieldnote = {
    type: 'fieldnote',
    key: `fieldnote:${name.trim()}`,
    name: name.trim(),
    description: (description || '').trim(),
    body: body.trim(),
  };
  try {
    await httpPost(sidecarUrl('/memory/write'), fieldnote);
    return `Fieldnote drafted in hot memory: ${name}\nUse /lore memory burn to review and graduate to the knowledge base.`;
  } catch (err) {
    return `Failed to draft fieldnote: ${err.message}`;
  }
}

async function loreHotSessionNote(key, content) {
  if (!key || !key.trim()) return 'Error: key parameter is required.';
  if (!content || !content.trim()) return 'Error: content parameter is required.';
  const note = { type: 'session-note', key: `note:${key.trim()}`, content: content.trim() };
  try {
    await httpPost(sidecarUrl('/memory/write'), note);
    return `Session note recorded: ${key}`;
  } catch (err) {
    return `Failed to record session note: ${err.message}`;
  }
}

// ── MCP protocol ────────────────────────────────────────────────────────────

const SERVER_INFO = {
  name: 'lore',
  version: getConfig(hubDir).version || '0.0.0',
};

const TOOLS = [
  {
    name: 'lore_search',
    description:
      'Semantic search across the Lore knowledge base (fieldnotes, runbooks, environment docs, work items). ' +
      'Returns snippets and file paths. Use lore_read to get complete file contents.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language search query.' },
        k: { type: 'number', description: 'Number of results to return (1-20, default 5).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'lore_read',
    description: 'Read a knowledge base file by path. Use after lore_search to get the full contents of a matched file.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file (from lore_search results).' },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'lore_health',
    description: 'Check if the Lore sidecar is running and how many files are indexed.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'lore_hot_recall',
    description:
      'Recall hot memory — list recently tracked facts, observations, and draft fieldnotes with their heat scores. ' +
      'Higher scores = more recently or frequently accessed. Facts decay over time.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum facts to return (1-50, default 10).' },
      },
      required: [],
    },
  },
  {
    name: 'lore_hot_write',
    description:
      'Write a fact or observation to hot memory (Redis scratchpad). Use freely during sessions to track ' +
      'gotchas, API quirks, environment details, or anything worth remembering. No operator approval needed. ' +
      'Facts decay over time — frequently accessed items stay hotter.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Short identifier for the fact (e.g. "proxmox-api-token-format").' },
        content: { type: 'string', description: 'The fact or observation to record.' },
      },
      required: ['key', 'content'],
    },
  },
  {
    name: 'lore_hot_fieldnote',
    description:
      'Draft a fieldnote in hot memory for later graduation to the persistent knowledge base. ' +
      'Use when you hit a non-obvious snag (auth quirk, encoding issue, platform incompatibility). ' +
      'The operator reviews and graduates hot fieldnotes to the KB via /lore memory burn.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Fieldnote name in kebab-case (e.g. "eslint-10-node-18-crash").' },
        description: { type: 'string', description: 'One-line description of the snag.' },
        body: { type: 'string', description: 'Full fieldnote content (context, snags, workaround). Markdown.' },
      },
      required: ['name', 'body'],
    },
  },
  {
    name: 'lore_hot_session_note',
    description:
      'Record a session note — key conversational context like decisions, clarifications, scope boundaries, ' +
      'or rejected approaches. Use freely throughout the session to preserve important context. ' +
      'Session notes decay naturally and do not require operator approval.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Short identifier (e.g. "auth-approach-decision", "scope-excludes-mobile").' },
        content: { type: 'string', description: 'The decision, clarification, or context to record.' },
      },
      required: ['key', 'content'],
    },
  },
];

// Route JSON-RPC requests to the appropriate handler.
async function handleRequest(req) {
  const { id, method } = req;

  if (method === 'initialize') {
    const clientVersion = req.params?.protocolVersion || '2024-11-05';
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: clientVersion,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      },
    };
  }

  if (method === 'notifications/initialized') {
    return null;
  }

  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
  }

  if (method === 'tools/call') {
    const toolName = req.params?.name;
    const args = req.params?.arguments || {};
    let text;
    try {
      switch (toolName) {
        case 'lore_search':
          text = await loreSearch(args.query, args.k);
          break;
        case 'lore_read':
          text = loreRead(args.file_path);
          break;
        case 'lore_health':
          text = await loreHealth();
          break;
        case 'lore_hot_recall':
          text = await loreHotRecall(args.limit);
          break;
        case 'lore_hot_write':
          text = await loreHotWrite(args.key, args.content);
          break;
        case 'lore_hot_fieldnote':
          text = await loreHotFieldnote(args.name, args.description, args.body);
          break;
        case 'lore_hot_session_note':
          text = await loreHotSessionNote(args.key, args.content);
          break;
        default:
          return {
            jsonrpc: '2.0',
            id,
            result: { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true },
          };
      }
    } catch (err) {
      text = `Error: ${err.message}`;
    }
    return {
      jsonrpc: '2.0',
      id,
      result: { content: [{ type: 'text', text }] },
    };
  }

  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  };
}

// ── Transport: newline-delimited JSON-RPC over stdio ────────────────────────

const rl = readline.createInterface({ input: process.stdin, terminal: false });
const pending = new Set();

rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    const req = JSON.parse(line);
    const p = Promise.resolve(handleRequest(req))
      .then((res) => {
        if (res) process.stdout.write(JSON.stringify(res) + '\n');
      })
      .catch((err) => {
        console.error('[lore-mcp] handler error:', err.message);
        process.stdout.write(
          JSON.stringify({
            jsonrpc: '2.0',
            id: req.id || null,
            error: { code: -32603, message: 'Internal error' },
          }) + '\n',
        );
      })
      .finally(() => pending.delete(p));
    pending.add(p);
  } catch (err) {
    console.error('[lore-mcp] parse error:', err.message);
    process.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      }) + '\n',
    );
  }
});

rl.on('close', () => {
  Promise.all(pending).then(() => process.exit(0));
});
