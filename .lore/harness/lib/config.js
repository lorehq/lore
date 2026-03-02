const fs = require('fs');
const path = require('path');
const { debug } = require('./debug');

function stripJsonComments(str) {
  let result = '';
  let i = 0;
  while (i < str.length) {
    if (str[i] === '"') {
      let j = i + 1;
      while (j < str.length && str[j] !== '"') {
        if (str[j] === '\') j++;
        j++;
      }
      result += str.slice(i, j + 1);
      i = j + 1;
    } else if (str[i] === '/' && str[i + 1] === '/') {
      i = str.indexOf('
', i);
      if (i === -1) break;
    } else if (str[i] === '/' && str[i + 1] === '*') {
      i = str.indexOf('*/', i + 2);
      if (i === -1) break;
      i += 2;
    } else {
      result += str[i++];
    }
  }
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

function getEnclavePath() {
  return path.join(process.env.HOME || process.env.USERPROFILE, '.lore');
}

module.exports = { getConfig, getProfile, getEnclavePath, VALID_PROFILES };
