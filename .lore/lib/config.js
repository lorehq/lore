// Shared: .lore-config reader.

const fs = require('fs');
const path = require('path');
const { debug } = require('./debug');

function getConfig(directory) {
  try {
    return JSON.parse(fs.readFileSync(path.join(directory, '.lore', 'config.json'), 'utf8'));
  } catch (e) {
    debug('getConfig: %s', e.message);
    return {};
  }
}

module.exports = { getConfig };
