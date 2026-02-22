#!/usr/bin/env node
// Lore MCP Server — Knowledge Base Search
// JSON-RPC 2.0 over stdio (newline-delimited JSON). Zero dependencies.
//
// Exposes three tools:
//   lore_search  — semantic search returning snippets and file paths
//   lore_read    — read a knowledge base file by path (use after lore_search)
//   lore_health  — container health and index status
//
// Reads docker.search config from .lore/config.json to locate the search container.
// Platform-agnostic — works with Claude Code, Cursor, and OpenCode.

const fs = require('fs');
const path = require('path');
const http = require('http');
const readline = require('readline');

// Hub resolution — linked repos set LORE_HUB to point back to the hub instance;
// direct instances resolve relative to this file's location (.lore/mcp/ → repo root).
const hubDir = process.env.LORE_HUB || path.join(__dirname, '..', '..');

// ── Shared lib imports ──────────────────────────────────────────────────────

const { getConfig } = require(path.join(hubDir, '.lore', 'lib', 'config'));

// ── Constants ───────────────────────────────────────────────────────────────

const MAX_LINES_PER_FILE = 500;
const HTTP_TIMEOUT_MS = 10000;

// ── HTTP helper ─────────────────────────────────────────────────────────────

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
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
    req.setTimeout(HTTP_TIMEOUT_MS, () => {
      req.destroy(new Error('Request timed out'));
    });
  });
}

// ── Search URL builder ──────────────────────────────────────────────────────

function getSearchBaseUrl() {
  const cfg = getConfig(hubDir);
  const search = cfg.docker?.search;
  if (!search) return null;
  const addr = search.address || 'localhost';
  const port = search.port || 8080;
  return `http://${addr}:${port}`;
}

// ── Path resolution ─────────────────────────────────────────────────────────
// Docker mounts:
//   docs/       → /data/docs/     (paths start with knowledge/, work/, context/)
//   .lore/skills/ → /data/skills/ (everything else)
// Search API returns paths relative to volume roots.

function resolveSearchPath(resultPath) {
  const docsIndicators = ['knowledge/', 'work/', 'context/'];
  const isDocsPath = docsIndicators.some((p) => resultPath.startsWith(p));

  if (isDocsPath) {
    return path.join(hubDir, 'docs', resultPath);
  }

  // Skills path — try .lore/skills/ first
  const skillsPath = path.join(hubDir, '.lore', 'skills', resultPath);
  if (fs.existsSync(skillsPath)) return skillsPath;

  // Fallback — try docs/ in case of unexpected prefix
  const docsPath = path.join(hubDir, 'docs', resultPath);
  if (fs.existsSync(docsPath)) return docsPath;

  // Last resort — return skills path (will fail gracefully on read)
  return skillsPath;
}

function readFileContent(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    if (lines.length > MAX_LINES_PER_FILE) {
      return lines.slice(0, MAX_LINES_PER_FILE).join('\n')
        + `\n[...truncated at ${MAX_LINES_PER_FILE} lines, full file at ${filePath}]`;
    }
    return content;
  } catch {
    return `[Could not read file: ${filePath}]`;
  }
}

// ── Tool implementations ────────────────────────────────────────────────────

async function doSearch(query, k) {
  const baseUrl = getSearchBaseUrl();
  if (!baseUrl) {
    return { error: 'Semantic search not configured — no docker.search in .lore/config.json.\nFall back to Glob/Grep for knowledge base searches.' };
  }

  if (!query || !query.trim()) {
    return { error: 'Error: query parameter is required.' };
  }

  const searchK = Math.max(1, Math.min(k || 5, 20));
  const url = `${baseUrl}/search?q=${encodeURIComponent(query)}&k=${searchK}&mode=full`;

  let raw;
  try {
    raw = await httpGet(url);
  } catch (err) {
    return { error: `Search container unavailable: ${err.message}\nFall back to Glob/Grep for knowledge base searches.` };
  }

  let results;
  try {
    const parsed = JSON.parse(raw);
    // API returns { query, results: [...] } or bare array
    results = Array.isArray(parsed) ? parsed : (parsed.results || []);
  } catch {
    return { error: `Unexpected response from search container:\n${raw.slice(0, 500)}` };
  }

  if (results.length === 0) {
    return { error: `No results found for: "${query}"` };
  }

  return { results };
}

async function loreSearch(query, k) {
  const res = await doSearch(query, k);
  if (res.error) return res.error;

  const parts = [];
  for (const result of res.results) {
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

  const resolved = path.resolve(filePath);
  return readFileContent(resolved);
}

async function loreSearchHealth() {
  const baseUrl = getSearchBaseUrl();
  if (!baseUrl) {
    return 'Semantic search not configured — no docker.search in .lore/config.json.';
  }

  try {
    const raw = await httpGet(`${baseUrl}/health`);
    const health = JSON.parse(raw);
    const parts = [`Status: ${health.ok ? 'healthy' : 'unhealthy'}`];
    if (health.file_count != null) parts.push(`Files indexed: ${health.file_count}`);
    if (health.chunk_count != null) parts.push(`Chunks: ${health.chunk_count}`);
    if (health.last_indexed_at) parts.push(`Last indexed: ${health.last_indexed_at}`);
    return parts.join('\n');
  } catch (err) {
    return `Search container unavailable: ${err.message}\nStart with: docker compose -f .lore/docker-compose.yml up -d`;
  }
}

// ── MCP protocol ────────────────────────────────────────────────────────────

const SERVER_INFO = {
  name: 'lore-search',
  version: getConfig(hubDir).version || '0.0.0',
};

const SEARCH_PARAMS = {
  query: { type: 'string', description: 'Natural language search query.' },
  k: { type: 'number', description: 'Number of results to return (1-20, default 5).' },
};

const TOOLS = [
  {
    name: 'lore_search',
    description:
      'Semantic search across the Lore knowledge base (docs, skills, runbooks, work items). '
      + 'Returns snippets and file paths. Use lore_read to get complete file contents.',
    inputSchema: { type: 'object', properties: SEARCH_PARAMS, required: ['query'] },
  },
  {
    name: 'lore_read',
    description:
      'Read a knowledge base file by path. Use after lore_search to get the full contents '
      + 'of a matched file.',
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
    description: 'Check if the semantic search container is running and how many files are indexed.',
    inputSchema: { type: 'object', properties: {}, required: [] },
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
    try {
      if (toolName === 'lore_search') {
        const args = req.params?.arguments || {};
        text = await loreSearch(args.query, args.k);
      } else if (toolName === 'lore_read') {
        const args = req.params?.arguments || {};
        text = loreRead(args.file_path);
      } else if (toolName === 'lore_health') {
        text = await loreSearchHealth();
      } else {
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
// One JSON-RPC message per line (terminated by \n).
// Responses are written the same way — one JSON line + newline.
// All debug logging goes to stderr only — stdout is the MCP channel.

const rl = readline.createInterface({ input: process.stdin, terminal: false });

// Track in-flight async handlers so we don't exit before they complete.
const pending = new Set();

rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    const req = JSON.parse(line);
    const p = Promise.resolve(handleRequest(req)).then((res) => {
      // Notifications (no id) get null back — don't send anything
      if (res) process.stdout.write(JSON.stringify(res) + '\n');
    }).catch((err) => {
      console.error('[lore-search-mcp] handler error:', err.message);
      process.stdout.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: req.id || null,
          error: { code: -32603, message: 'Internal error' },
        }) + '\n',
      );
    }).finally(() => pending.delete(p));
    pending.add(p);
  } catch (err) {
    console.error('[lore-search-mcp] parse error:', err.message);
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
  // Wait for any in-flight async tool calls before exiting.
  Promise.all(pending).then(() => process.exit(0));
});
