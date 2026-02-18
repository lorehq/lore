// Debug logging for Lore hooks and lib.
// Output goes to stderr so it doesn't interfere with JSON stdout.
// Enable with: LORE_DEBUG=1

const { format } = require('util');

function debug(...args) {
  if (process.env.LORE_DEBUG) console.error('[lore]', format(...args));
}

module.exports = { debug };
