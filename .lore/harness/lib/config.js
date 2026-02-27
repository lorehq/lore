// Shared: .lore-config reader.

const fs = require('fs');
const path = require('path');
const { debug } = require('./debug');

// Strip // and /* */ comments from JSONC, plus trailing commas.
// Respects strings — won't strip comment syntax inside quoted values.
function stripJsonComments(str) {
  let result = '';
  let i = 0;
  while (i < str.length) {
    // String literal — pass through untouched
    if (str[i] === '"') {
      let j = i + 1;
      while (j < str.length && str[j] !== '"') {
        if (str[j] === '\\') j++; // skip escaped char
        j++;
      }
      result += str.slice(i, j + 1);
      i = j + 1;
      // Line comment
    } else if (str[i] === '/' && str[i + 1] === '/') {
      i = str.indexOf('\n', i);
      if (i === -1) break;
      // Block comment
    } else if (str[i] === '/' && str[i + 1] === '*') {
      i = str.indexOf('*/', i + 2);
      if (i === -1) break;
      i += 2;
    } else {
      result += str[i++];
    }
  }
  // Trailing commas before } or ]
  return result.replace(/,(\s*[}\]])/g, '$1');
}

function getConfig(directory) {
  try {
    const raw = fs.readFileSync(path.join(directory, '.lore', 'config.json'), 'utf8');
    return JSON.parse(stripJsonComments(raw));
  } catch (e) {
    debug('getConfig: %s', e.message);
    return {};
  }
}

const VALID_PROFILES = ['minimal', 'standard', 'discovery'];

function getProfile(directory) {
  const cfg = getConfig(directory);
  return VALID_PROFILES.includes(cfg.profile) ? cfg.profile : 'standard';
}

module.exports = { getConfig, getProfile, VALID_PROFILES };
