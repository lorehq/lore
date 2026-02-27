// Thin wrapper — delegates to the shared lib/banner.js implementation.
// Hooks call this with no args; it resolves the project root from __dirname.
// The canonical implementation lives in lib/banner.js (parameterized by directory).

const path = require('path');
const { getAgentNames: _getAgentNames } = require('../../lib/banner');

function getAgentNames() {
  // Hook scripts live in .lore/harness/hooks/lib/, so project root is four levels up
  return _getAgentNames(path.join(__dirname, '..', '..', '..', '..'));
}

module.exports = { getAgentNames };
