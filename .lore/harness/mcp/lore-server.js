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
const net = require('net');
const http = require('http');
const readline = require('readline');

// Resolve repo root relative to this file's location (.lore/harness/mcp/ → repo root).
const hubDir = path.join(__dirname, '..', '..', '..');

// ── Shared lib imports ──────────────────────────────────────────────────────

const { getConfig, getGlobalPath } = require(path.join(hubDir, '.lore', 'harness', 'lib', 'config'));
const { getSidecarPort, getRedisPort, getGlobalToken } = require(path.join(hubDir, '.lore', 'harness', 'lib', 'global'));

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

// ── Minimal Redis client (RESP over TCP, zero dependencies) ─────────────────

const REDIS_CONNECT_TIMEOUT_MS = 5000;
const HALF_LIFE_SECS = 7 * 24 * 60 * 60; // 7 days
const LAMBDA = Math.LN2 / HALF_LIFE_SECS;

let redisSocket = null;
let redisReady = false;
let redisConnecting = false;
let redisBuffer = '';
let redisQueue = []; // { resolve, reject } callbacks for pipelined commands

/**
 * Encode a RESP array command: *N\r\n$len\r\narg\r\n...
 */
function respEncode(args) {
  let out = `*${args.length}\r\n`;
  for (const arg of args) {
    const s = String(arg);
    out += `$${Buffer.byteLength(s)}\r\n${s}\r\n`;
  }
  return out;
}

/**
 * Parse one complete RESP value from buf starting at offset.
 * Returns { value, offset } or null if incomplete.
 */
function respParseOne(buf, off) {
  if (off >= buf.length) return null;
  const type = buf[off];
  const nl = buf.indexOf('\r\n', off);
  if (nl === -1) return null;

  if (type === '+' || type === '-') {
    // Simple string / error
    const val = buf.slice(off + 1, nl);
    return { value: type === '-' ? new Error(val) : val, offset: nl + 2 };
  }

  if (type === ':') {
    // Integer
    return { value: parseInt(buf.slice(off + 1, nl), 10), offset: nl + 2 };
  }

  if (type === '$') {
    // Bulk string
    const len = parseInt(buf.slice(off + 1, nl), 10);
    if (len === -1) return { value: null, offset: nl + 2 };
    const start = nl + 2;
    const end = start + len;
    if (buf.length < end + 2) return null; // incomplete
    return { value: buf.slice(start, end), offset: end + 2 };
  }

  if (type === '*') {
    // Array
    const count = parseInt(buf.slice(off + 1, nl), 10);
    if (count === -1) return { value: null, offset: nl + 2 };
    const arr = [];
    let cursor = nl + 2;
    for (let i = 0; i < count; i++) {
      const item = respParseOne(buf, cursor);
      if (!item) return null; // incomplete
      arr.push(item.value);
      cursor = item.offset;
    }
    return { value: arr, offset: cursor };
  }

  return null;
}

function drainRedisBuffer() {
  while (redisQueue.length > 0 && redisBuffer.length > 0) {
    const parsed = respParseOne(redisBuffer, 0);
    if (!parsed) break;
    redisBuffer = redisBuffer.slice(parsed.offset);
    const { resolve, reject } = redisQueue.shift();
    if (parsed.value instanceof Error) {
      reject(parsed.value);
    } else {
      resolve(parsed.value);
    }
  }
}

function getRedisConnection() {
  if (redisSocket && redisReady) return Promise.resolve(redisSocket);
  if (redisConnecting) {
    return new Promise((resolve, reject) => {
      const check = setInterval(() => {
        if (redisReady && redisSocket) { clearInterval(check); resolve(redisSocket); }
      }, 50);
      setTimeout(() => { clearInterval(check); reject(new Error('Redis connect timeout')); }, REDIS_CONNECT_TIMEOUT_MS);
    });
  }

  redisConnecting = true;
  return new Promise((resolve, reject) => {
    const port = getRedisPort();
    const sock = net.createConnection({ host: '127.0.0.1', port }, () => {
      redisSocket = sock;
      redisReady = true;
      redisConnecting = false;
      resolve(sock);
    });
    sock.setEncoding('utf8');
    sock.on('data', (chunk) => {
      redisBuffer += chunk;
      drainRedisBuffer();
    });
    sock.on('error', (err) => {
      redisReady = false;
      redisConnecting = false;
      redisSocket = null;
      // Reject all pending commands
      while (redisQueue.length) redisQueue.shift().reject(err);
      reject(err);
    });
    sock.on('close', () => {
      redisReady = false;
      redisSocket = null;
    });
    sock.setTimeout(REDIS_CONNECT_TIMEOUT_MS, () => {
      sock.destroy(new Error('Redis connect timeout'));
    });
  });
}

/**
 * Send a Redis command and return the parsed response.
 */
async function redis(...args) {
  const sock = await getRedisConnection();
  return new Promise((resolve, reject) => {
    redisQueue.push({ resolve, reject });
    sock.write(respEncode(args));
  });
}

/**
 * Compute heat score: hits × exp(-λ × age)
 */
function heatScore(hits, lastAccessed) {
  const age = Math.max(0, Math.floor(Date.now() / 1000) - lastAccessed);
  return hits * Math.exp(-LAMBDA * age);
}

/**
 * Parse HGETALL flat array [k1, v1, k2, v2, ...] into an object.
 */
function hashToObject(arr) {
  if (!Array.isArray(arr)) return {};
  const obj = {};
  for (let i = 0; i < arr.length; i += 2) {
    obj[arr[i]] = arr[i + 1];
  }
  return obj;
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
    const keys = await redis('SMEMBERS', 'lore:hot:index');
    if (!Array.isArray(keys) || keys.length === 0) {
      return 'No hot memory facts.';
    }

    const facts = [];
    for (const key of keys) {
      const data = hashToObject(await redis('HGETALL', `lore:hot:${key}`));
      if (!data.created_at) continue; // skip malformed
      const hits = parseInt(data.hits, 10) || 1;
      const lastAccessed = parseInt(data.last_accessed, 10) || parseInt(data.created_at, 10);
      const score = heatScore(hits, lastAccessed);

      // Boost: increment hits and update last_accessed on recall
      const now = Math.floor(Date.now() / 1000);
      await redis('HINCRBY', `lore:hot:${key}`, 'hits', 1);
      await redis('HSET', `lore:hot:${key}`, 'last_accessed', String(now));

      const display = data.type === 'fieldnote'
        ? `${data.description || ''}\n${data.body || ''}`
        : data.content || '';
      facts.push({ key, score, display, type: data.type || 'fact' });
    }

    facts.sort((a, b) => b.score - a.score);
    const top = facts.slice(0, n);

    if (top.length === 0) return 'No hot memory facts.';

    const parts = top.map((f) =>
      `[${f.score.toFixed(2)}] ${f.key} (${f.type})${f.display ? '\n' + f.display : ''}`,
    );
    return `${top.length} hot facts:\n\n${parts.join('\n\n')}`;
  } catch (err) {
    return `Redis unavailable: ${err.message}`;
  }
}

async function loreHotWrite(key, content) {
  if (!key || !key.trim()) {
    return 'Error: key parameter is required.';
  }
  if (!content || !content.trim()) {
    return 'Error: content parameter is required.';
  }
  const k = key.trim();
  const now = String(Math.floor(Date.now() / 1000));
  try {
    await redis('HSET', `lore:hot:${k}`,
      'content', content.trim(),
      'type', 'fact',
      'created_at', now,
      'last_accessed', now,
      'hits', '1',
    );
    await redis('SADD', 'lore:hot:index', k);
    return `Recorded to hot memory: ${k}`;
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
  const n = name.trim();
  const k = `fieldnote:${n}`;
  const now = String(Math.floor(Date.now() / 1000));
  try {
    await redis('HSET', `lore:hot:${k}`,
      'content', (description || '').trim(),
      'type', 'fieldnote',
      'name', n,
      'description', (description || '').trim(),
      'body', body.trim(),
      'created_at', now,
      'last_accessed', now,
      'hits', '1',
    );
    await redis('SADD', 'lore:hot:index', k);
    return `Fieldnote drafted in hot memory: ${n}\nUse /lore memory burn to review and graduate to the knowledge base.`;
  } catch (err) {
    return `Failed to draft fieldnote: ${err.message}`;
  }
}

async function loreHotSessionNote(key, content) {
  if (!key || !key.trim()) return 'Error: key parameter is required.';
  if (!content || !content.trim()) return 'Error: content parameter is required.';
  const k = `note:${key.trim()}`;
  const now = String(Math.floor(Date.now() / 1000));
  try {
    await redis('HSET', `lore:hot:${k}`,
      'content', content.trim(),
      'type', 'session-note',
      'created_at', now,
      'last_accessed', now,
      'hits', '1',
    );
    await redis('SADD', 'lore:hot:index', k);
    return `Session note recorded: ${key.trim()}`;
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
