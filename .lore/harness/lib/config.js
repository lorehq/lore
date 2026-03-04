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
        if (str[j] === '\\') j++;
        j++;
      }
      result += str.slice(i, j + 1);
      i = j + 1;
    } else if (str[i] === '/' && str[i + 1] === '/') {
      i = str.indexOf('\n', i);
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

function getGlobalPath() {
  return path.join(process.env.HOME || process.env.USERPROFILE, '.lore');
}

function deepMerge(target, source) {
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

function getConfig(directory) {
  let config = {};
  try {
    const globalPath = path.join(getGlobalPath(), 'config.json');
    if (fs.existsSync(globalPath)) {
      const raw = fs.readFileSync(globalPath, 'utf8');
      config = JSON.parse(stripJsonComments(raw));
    }
  } catch (e) { debug('globalConfig: %s', e.message); }

  try {
    const localPath = path.join(directory, '.lore', 'config.json');
    if (fs.existsSync(localPath)) {
      const raw = fs.readFileSync(localPath, 'utf8');
      const local = JSON.parse(stripJsonComments(raw));
      config = deepMerge(config, local);
    }
  } catch (e) { debug('localConfig: %s', e.message); }

  return config;
}

const VALID_PROFILES = ['minimal', 'standard', 'discovery'];

function getProfile(directory) {
  const cfg = getConfig(directory);
  return VALID_PROFILES.includes(cfg.profile) ? cfg.profile : 'standard';
}

function getActivePlatforms(directory) {
  const cfg = getConfig(directory);
  const allPlatforms = Object.keys(require('./manifest.json').platforms);
  if (!Array.isArray(cfg.platforms) || cfg.platforms.length === 0) {
    return allPlatforms;
  }
  return cfg.platforms.filter(p => allPlatforms.includes(p));
}

module.exports = { getConfig, getProfile, getGlobalPath, getActivePlatforms, VALID_PROFILES };
