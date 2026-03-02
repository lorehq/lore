const path = require('path');
const { getEnclavePath } = require('./config');

function isPrimerPath(filePath, rootDir) {
  if (!filePath) return false;
  const resolved = path.resolve(filePath);
  const enclave = getEnclavePath();

  // 1. Global Enclave Primers
  if (resolved.startsWith(path.join(enclave, 'primers'))) return true;

  // 2. Project Local Primers
  if (resolved.startsWith(path.join(rootDir, '.lore', 'primers'))) return true;

  // 3. Projected Platform Skills (e.g. .claude/skills/prim-*)
  const parts = resolved.split(path.sep);
  if (parts.some(p => p.startsWith('prim-'))) return true;

  return false;
}

module.exports = { isPrimerPath };
