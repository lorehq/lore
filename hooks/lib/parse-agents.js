// Thin wrapper — delegates to the shared lib/banner.js implementation.
// Hooks call this with no args; it resolves the project root from __dirname.
// The canonical implementation lives in lib/banner.js (parameterized by directory).

const path = require('path');
const { getAgentDomains: _getAgentDomains } = require('../../lib/banner');

function getAgentDomains() {
  // Hook scripts live in hooks/lib/, so project root is two levels up
  return _getAgentDomains(path.join(__dirname, '..', '..'));
}

module.exports = { getAgentDomains };
