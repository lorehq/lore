// Global directory (~/.lore/) lifecycle: versioning, migrations, sidecar config.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { debug } = require('./debug');
const { getGlobalPath } = require('./config');

const DEFAULT_SIDECAR_PORT = 9185;

/**
 * Read globalStructureVersion from ~/.lore/config.json.
 * Returns 0 if the file or field is missing.
 */
function getGlobalStructureVersion() {
  try {
    const configPath = path.join(getGlobalPath(), 'config.json');
    if (!fs.existsSync(configPath)) return 0;
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return typeof data.globalStructureVersion === 'number' ? data.globalStructureVersion : 0;
  } catch (e) {
    debug('getGlobalStructureVersion: %s', e.message);
    return 0;
  }
}

/**
 * Return the highest version number from NNN-name.js migration files.
 * Returns 0 if the directory is missing or empty.
 */
function getRequiredStructureVersion(migrationsDir) {
  try {
    if (!fs.existsSync(migrationsDir)) return 0;
    const files = fs.readdirSync(migrationsDir).filter(f => /^\d{3}-.*\.js$/.test(f)).sort();
    if (files.length === 0) return 0;
    const last = files[files.length - 1];
    return parseInt(last.slice(0, 3), 10);
  } catch (e) {
    debug('getRequiredStructureVersion: %s', e.message);
    return 0;
  }
}

/**
 * Apply pending migrations in order, bumping globalStructureVersion after each.
 * Returns { ran: number, version: number }.
 */
function runMigrations(migrationsDir) {
  const globalPath = getGlobalPath();
  const current = getGlobalStructureVersion();
  let ran = 0;

  try {
    const files = fs.readdirSync(migrationsDir).filter(f => /^\d{3}-.*\.js$/.test(f)).sort();
    for (const file of files) {
      const version = parseInt(file.slice(0, 3), 10);
      if (version <= current) continue;

      debug('running migration %s', file);
      const migration = require(path.resolve(migrationsDir, file));
      migration.up(globalPath);

      // Bump version after each migration (crash-safe: partial runs resume correctly)
      const configPath = path.join(globalPath, 'config.json');
      let config = {};
      try {
        if (fs.existsSync(configPath)) {
          config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
      } catch { /* start fresh */ }
      config.globalStructureVersion = version;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
      ran++;
    }
  } catch (e) {
    debug('runMigrations: %s', e.message);
    throw e;
  }

  return { ran, version: getGlobalStructureVersion() };
}

/**
 * Ensure ~/.lore/ exists and run pending migrations.
 * Returns { ran: number, version: number }.
 */
function ensureGlobalDir(migrationsDir) {
  const globalPath = getGlobalPath();
  fs.mkdirSync(globalPath, { recursive: true });
  return runMigrations(migrationsDir);
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
  getGlobalStructureVersion, getRequiredStructureVersion, runMigrations, ensureGlobalDir,
  getSidecarPort, getGlobalToken, ensureGlobalToken, DEFAULT_SIDECAR_PORT,
};
