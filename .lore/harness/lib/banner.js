const fs = require('fs');
const path = require('path');
const { debug } = require('./debug');
const { buildTree } = require('./tree');
const { getConfig, getProfile, getEnclavePath } = require('./config');
const { ensureStickyFiles } = require('./sticky');
const { parseFrontmatter, stripFrontmatter } = require('./frontmatter');

function getAgentEntries(directory) {
  const entries = [];
  const names = new Set();
  const dirs = [path.join(directory, '.lore', 'agents'), path.join(getEnclavePath(), 'agents')];
  for (const agentsDir of dirs) {
    try {
      if (!fs.existsSync(agentsDir)) continue;
      for (const f of fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md'))) {
        const content = fs.readFileSync(path.join(agentsDir, f), 'utf8');
        const { attrs } = parseFrontmatter(content);
        const name = attrs.name || f.replace(/\.md$/, '');
        if (name && !names.has(name)) {
          entries.push({ name });
          names.add(name);
        }
      }
    } catch (e) { debug('getAgentEntries: %s', e.message); }
  }
  return entries;
}

function getFieldnotes(directory) {
  const notes = [];
  const names = new Set();
  const dirs = [path.join(directory, '.lore', 'fieldnotes'), path.join(getEnclavePath(), 'fieldnotes')];
  for (const fieldnotesDir of dirs) {
    try {
      if (!fs.existsSync(fieldnotesDir)) continue;
      for (const d of fs.readdirSync(fieldnotesDir, { withFileTypes: true })) {
        if (!d.isDirectory()) continue;
        const fieldnoteFile = path.join(fieldnotesDir, d.name, 'FIELDNOTE.md');
        if (!fs.existsSync(fieldnoteFile)) continue;
        const content = fs.readFileSync(fieldnoteFile, 'utf8');
        const { attrs } = parseFrontmatter(content);
        const name = attrs.name || d.name;
        if (name && !names.has(name)) {
          notes.push({ name, description: attrs.description || '' });
          names.add(name);
        }
      }
    } catch (e) { debug('getFieldnotes: %s', e.message); }
  }
  return notes;
}

function scanWork(dir) {
  const active = [];
  try {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'archive') continue;
      const indexPath = path.join(dir, entry.name, 'index.md');
      if (!fs.existsSync(indexPath)) continue;
      const content = fs.readFileSync(indexPath, 'utf8');
      const { attrs } = parseFrontmatter(content);
      if (attrs.status === 'active' || attrs.status === 'on-hold') {
        let label = attrs.title || entry.name;
        if (attrs.summary) label += ` (${attrs.summary})`;
        if (attrs.status === 'on-hold') label += ' [ON HOLD]';
        active.push(label);
      }
    }
  } catch (e) { debug('scanWork: %s', e.message); }
  return active;
}

function getBannerLoadedSkills(directory) {
  const loaded = [];
  const names = new Set();
  const baseDirs = [
    path.join(directory, '.lore', 'skills'),
    path.join(directory, '.lore', 'fieldnotes'),
    path.join(getEnclavePath(), 'skills'),
    path.join(getEnclavePath(), 'fieldnotes')
  ];
  for (const skillsDir of baseDirs) {
    try {
      if (!fs.existsSync(skillsDir)) continue;
      for (const d of fs.readdirSync(skillsDir, { withFileTypes: true })) {
        if (!d.isDirectory()) continue;
        const isFn = skillsDir.includes('fieldnotes');
        const manifest = path.join(skillsDir, d.name, isFn ? 'FIELDNOTE.md' : 'SKILL.md');
        if (!fs.existsSync(manifest)) continue;
        const content = fs.readFileSync(manifest, 'utf8');
        const { attrs } = parseFrontmatter(content);
        const name = attrs.name || d.name;
        if (attrs['banner-loaded'] === 'true' && !names.has(name)) {
          loaded.push({ name, body: stripFrontmatter(content).trim() });
          names.add(name);
        }
      }
    } catch (e) { debug('getBannerLoadedSkills: %s', e.message); }
  }
  return loaded;
}

function buildStaticBanner(directory) {
  const agentEntries = getAgentEntries(directory);
  const fieldnotes = getFieldnotes(directory);
  const cfg = getConfig(directory);
  const version = cfg.version ? ` v${cfg.version}` : '';
  const profile = getProfile(directory);
  const profileTag = profile !== 'standard' ? ` [${profile.toUpperCase()}]` : '';
  const docker = cfg.docker || {};
  const semanticSearchUrl = docker.search && docker.search.address ? `http://${docker.search.address}:${docker.search.port}/search` : '';

  const inFlight = path.join(directory, 'docs', 'active-work', 'in-flight');
  const initiatives = scanWork(path.join(inFlight, 'initiatives'));
  const epics = scanWork(path.join(inFlight, 'epics'));
  const items = scanWork(path.join(inFlight, 'items'));

  const workerList = agentEntries.length > 0 ? agentEntries.map((a) => a.name).join(', ') : '(none yet)';
  const fieldnoteLine = fieldnotes.length > 0 ? fieldnotes.map((s) => s.name).join(', ') : '';

  let output = `=== LORE${version}${profileTag} ===

WORKERS: ${workerList}`;
  if (semanticSearchUrl) output += `
SEMANTIC SEARCH: ${semanticSearchUrl}`;
  if (profile === 'minimal') output += '
PROFILE: minimal \u2014 per-tool nudges off. Use /lore-capture manually after substantive work.';
  else if (profile === 'discovery') output += '
PROFILE: discovery \u2014 capture aggressively. Map every service, endpoint, auth header, and redirect to docs/knowledge-base/environment/. Create fieldnotes for every non-obvious fix. Run /lore-capture at natural breakpoints.';

  if (fieldnoteLine) output += `

FIELDNOTES: ${fieldnoteLine}`;

  const bannerSkills = getBannerLoadedSkills(directory);
  if (bannerSkills.length > 0) output += '

' + bannerSkills.map((s) => s.body).join('

');

  if (initiatives.length > 0) output += `

ACTIVE INITIATIVES: ${initiatives.join('; ')}`;
  if (epics.length > 0) output += `

ACTIVE EPICS: ${epics.join('; ')}`;
  if (items.length > 0) output += `

ACTIVE ITEMS: ${items.join('; ')}`;

  try {
    const agentRulesPath = path.join(getEnclavePath(), 'rules', 'lore-agent-rules.md');
    const raw = fs.readFileSync(agentRulesPath, 'utf8');
    const stripped = stripFrontmatter(raw).trim();
    if (stripped) output += '

PROJECT IDENTITY:
' + stripped;
  } catch (e) { debug('project-identity: %s', e.message); }

  try {
    const allRules = [];
    const rulesDirs = [path.join(getEnclavePath(), 'rules'), path.join(directory, '.lore', 'rules')];
    const seen = new Set();
    for (const rDir of rulesDirs) {
      if (!fs.existsSync(rDir)) continue;
      const files = fs.readdirSync(rDir).filter(f => f.endsWith('.md') && f !== 'lore-agent-rules.md' && !fs.lstatSync(path.join(rDir, f)).isDirectory()).sort();
      for (const f of files) {
        if (seen.has(f)) continue;
        const content = stripFrontmatter(fs.readFileSync(path.join(rDir, f), 'utf8')).trim();
        if (content) { allRules.push(content); seen.add(f); }
      }
      const sDir = path.join(rDir, 'system');
      if (fs.existsSync(sDir)) {
        const sFiles = fs.readdirSync(sDir).filter(f => f.endsWith('.md') && !seen.has(f)).sort();
        for (const f of sFiles) {
          const content = stripFrontmatter(fs.readFileSync(path.join(sDir, f), 'utf8')).trim();
          if (content) { allRules.push(content); seen.add(f); }
        }
      }
    }
    if (allRules.length > 0) output += '

RULES:
' + allRules.join('

');
  } catch (e) { debug('rules: %s', e.message); }

  return output;
}

function buildDynamicBanner(directory) {
  let output = '';
  try {
    const profilePath = path.join(getEnclavePath(), 'knowledge-base', 'local', 'operator-profile.md');
    const raw = fs.readFileSync(profilePath, 'utf8');
    const stripped = stripFrontmatter(raw).trim();
    if (stripped && !stripped.includes('- **Name:**')) output += 'OPERATOR PROFILE:
' + stripped;
  } catch (e) { debug('operator-profile: %s', e.message); }

  const memPath = path.join(directory, '.lore', 'memory.local.md');
  try {
    const raw = fs.readFileSync(memPath, 'utf8');
    const stripped = stripFrontmatter(raw).trim();
    if (stripped && !stripped.includes('Transient memory')) {
      if (output) output += '

';
      output += 'SESSION MEMORY:
' + stripped;
    }
  } catch (e) { debug('memory: %s', e.message); }

  return output;
}

module.exports = { buildStaticBanner, buildDynamicBanner, getAgentEntries, getFieldnotes, getBannerLoadedSkills, getConfig, getProfile, parseFrontmatter, stripFrontmatter };
