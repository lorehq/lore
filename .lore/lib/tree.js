// Shared: ASCII tree builder for directory structures.
// Used by banner (knowledge map) and context-path-guide (directory preview).

const fs = require('fs');
const path = require('path');
const { debug } = require('./debug');

const SKIP_DIRS = new Set(['archive', 'assets', 'stylesheets', 'node_modules', '__pycache__', 'site']);

// Build ASCII tree of a directory.
// Default: directories only (files are on-demand, not loaded into context).
// Set dirsOnly=false for a full listing (used by context-path-guide for
// focused previews of a single directory being written to).
function buildTree(dir, prefix = '', options = {}) {
  const { depth = 0, maxDepth = 5, skipDirs = SKIP_DIRS, dirsOnly = true } = options;
  if (depth >= maxDepth) return [];
  const lines = [];
  try {
    const entries = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => {
        if (e.name.startsWith('.')) return false;
        if (e.isDirectory()) return !skipDirs.has(e.name);
        return !dirsOnly;
      })
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const last = i === entries.length - 1;
      const connector = last ? '\u2514\u2500\u2500 ' : '\u251c\u2500\u2500 ';
      const isDir = entry.isDirectory();
      lines.push(prefix + connector + (isDir ? entry.name + '/' : entry.name));
      if (isDir) {
        lines.push(
          ...buildTree(path.join(dir, entry.name), prefix + (last ? '    ' : '\u2502   '), {
            depth: depth + 1,
            maxDepth,
            skipDirs,
            dirsOnly,
          }),
        );
      }
    }
  } catch (e) {
    debug('buildTree: %s: %s', dir, e.message);
  }
  return lines;
}

module.exports = { buildTree, SKIP_DIRS };
