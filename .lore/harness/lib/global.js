// Global directory (~/.lore/) lifecycle: setup, sidecar config, Redis config.
// All setup is idempotent — safe to run on every session.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { debug } = require('./debug');
const { getGlobalPath } = require('./config');

const DEFAULT_SIDECAR_PORT = 9185;
const DEFAULT_REDIS_PORT = 6379;

const GLOBAL_DIRS = [
  'AGENTIC/skills',
  'AGENTIC/rules',
  'AGENTIC/agents',
  'knowledge-base/fieldnotes',
  'knowledge-base/runbooks',
  'knowledge-base/environment',
  'knowledge-base/work-items',
  'knowledge-base/drafts',
  'redis-data',
];

const OPERATOR_PROFILE_CONTENT = `# Operator Profile

<!-- Injected into every session as OPERATOR PROFILE context. -->
<!-- This file is gitignored — it stays local to your machine. -->

## Identity

- **Name:**
- **Role:**

## Preferences

Add any preferences, working style notes, or context that should be
available to the agent in every session.
`;

const COMPOSE_CONTENT = `name: lore
services:
  lore-runtime:
    image: lorehq/lore-memory:latest
    ports:
      - '9185:8080'
    environment:
      - REDIS_URL=redis://lore-memory:6379
      - DOCS_SOURCE=/data/knowledge-base
      - LORE_TOKEN=\${LORE_TOKEN}
    volumes:
      - ./knowledge-base:/data/knowledge-base:ro
      - runtime_data:/runtime-data
    depends_on:
      - lore-memory
    restart: unless-stopped

  lore-memory:
    image: redis/redis-stack-server:latest
    ports:
      - '6379:6379'
    volumes:
      - ./redis-data:/data
    restart: unless-stopped

volumes:
  runtime_data:
`;

/**
 * Ensure ~/.lore/ exists with the expected structure.
 * Fully idempotent — creates what's missing, never overwrites existing content.
 */
function ensureGlobalDir() {
  const globalPath = getGlobalPath();

  // Directories
  for (const dir of GLOBAL_DIRS) {
    fs.mkdirSync(path.join(globalPath, dir), { recursive: true });
  }

  // Operator profile — only if missing
  const profilePath = path.join(globalPath, 'knowledge-base', 'operator-profile.md');
  if (!fs.existsSync(profilePath)) {
    fs.writeFileSync(profilePath, OPERATOR_PROFILE_CONTENT);
  }

  // docker-compose.yml — create if missing, patch Redis port if existing
  const composePath = path.join(globalPath, 'docker-compose.yml');
  if (!fs.existsSync(composePath)) {
    fs.writeFileSync(composePath, COMPOSE_CONTENT);
  } else {
    let yml = fs.readFileSync(composePath, 'utf8');
    if (yml.includes('lore-memory:') && !yml.includes("'6379:6379'")) {
      yml = yml.replace(
        /(  lore-memory:\n    image: [^\n]+\n)/,
        '$1    ports:\n      - \'6379:6379\'\n',
      );
      fs.writeFileSync(composePath, yml);
    }
  }

  // .env with LORE_TOKEN — only if missing or no token
  const envPath = path.join(globalPath, '.env');
  let envContent = '';
  try { envContent = fs.readFileSync(envPath, 'utf8'); } catch { /* missing */ }
  if (!envContent.includes('LORE_TOKEN=')) {
    const token = crypto.randomBytes(32).toString('hex');
    fs.appendFileSync(envPath, `LORE_TOKEN=${token}\n`);
  }
}

/**
 * Return the sidecar port. Reads sidecarPort from ~/.lore/config.json,
 * falls back to 9185.
 */
function getSidecarPort() {
  try {
    const configPath = path.join(getGlobalPath(), 'config.json');
    if (!fs.existsSync(configPath)) return DEFAULT_SIDECAR_PORT;
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return data.sidecarPort || DEFAULT_SIDECAR_PORT;
  } catch (e) {
    debug('getSidecarPort: %s', e.message);
    return DEFAULT_SIDECAR_PORT;
  }
}

/**
 * Return the Redis port. Reads redisPort from ~/.lore/config.json,
 * falls back to 6379.
 */
function getRedisPort() {
  try {
    const configPath = path.join(getGlobalPath(), 'config.json');
    if (!fs.existsSync(configPath)) return DEFAULT_REDIS_PORT;
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return data.redisPort || DEFAULT_REDIS_PORT;
  } catch (e) {
    debug('getRedisPort: %s', e.message);
    return DEFAULT_REDIS_PORT;
  }
}

/**
 * Read LORE_TOKEN from ~/.lore/.env. Returns null if missing.
 */
function getGlobalToken() {
  try {
    const envPath = path.join(getGlobalPath(), '.env');
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(/^LORE_TOKEN=(.*)$/m);
    return match ? match[1].trim() : null;
  } catch (e) {
    debug('getGlobalToken: %s', e.message);
    return null;
  }
}

/**
 * Ensure LORE_TOKEN exists in ~/.lore/.env. Creates one if missing.
 */
function ensureGlobalToken() {
  const envPath = path.join(getGlobalPath(), '.env');
  let content = '';
  try { content = fs.readFileSync(envPath, 'utf8'); } catch { /* missing */ }
  if (content.includes('LORE_TOKEN=')) return;
  const token = crypto.randomBytes(32).toString('hex');
  fs.appendFileSync(envPath, `LORE_TOKEN=${token}\n`);
}

module.exports = {
  ensureGlobalDir,
  getSidecarPort, getRedisPort, getGlobalToken, ensureGlobalToken,
  DEFAULT_SIDECAR_PORT, DEFAULT_REDIS_PORT,
};
