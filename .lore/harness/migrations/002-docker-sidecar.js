// Migration 002: Scaffold Docker sidecar in the global directory.
// Creates docker-compose.yml, .env (with LORE_TOKEN), and redis-data/.
// All writes are conditional — never overwrites existing files (preserves user customizations).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
    volumes:
      - ./redis-data:/data
    restart: unless-stopped

volumes:
  runtime_data:
`;

exports.version = 2;

exports.up = function up(globalPath) {
  // docker-compose.yml — only if missing
  const composePath = path.join(globalPath, 'docker-compose.yml');
  if (!fs.existsSync(composePath)) {
    fs.writeFileSync(composePath, COMPOSE_CONTENT);
  }

  // .env with LORE_TOKEN — only if missing or no token
  const envPath = path.join(globalPath, '.env');
  let envContent = '';
  try { envContent = fs.readFileSync(envPath, 'utf8'); } catch { /* missing */ }
  if (!envContent.includes('LORE_TOKEN=')) {
    const token = crypto.randomBytes(32).toString('hex');
    fs.appendFileSync(envPath, `LORE_TOKEN=${token}\n`);
  }

  // redis-data directory
  fs.mkdirSync(path.join(globalPath, 'redis-data'), { recursive: true });
};
