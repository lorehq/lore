const fs = require('fs');
const path = require('path');
const http = require('http');
const { debug } = require('./debug');
const { buildTree } = require('./tree');
const { getConfig, getProfile, getEnclavePath } = require('./config');
const { ensureStickyFiles } = require('./sticky');
const { parseFrontmatter, stripFrontmatter } = require('./frontmatter');
const { getLoreToken } = require('./security');

async function getHotPrimitives(directory, limit = 5) {
  const cfg = getConfig(directory);
  if (!cfg.docker || !cfg.docker.search) return [];
  const token = getLoreToken(directory);
  return new Promise((resolve) => {
    const req = http.request({
      hostname: cfg.docker.search.address,
      port: cfg.docker.search.port,
      path: `/memory/hot?limit=${limit}`,
      method: 'GET',
      timeout: 100,
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
    req.end();
  });
}

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

function getRunbookEntries(directory) {
  const runbooks = [];
  const names = new Set();
  const dirs = [path.join(directory, '.lore', 'runbooks'), path.join(getEnclavePath(), 'runbooks')];
  for (const rbDir of dirs) {
    try {
      if (!fs.existsSync(rbDir)) continue;
      const scan = (d) => {
        const files = fs.readdirSync(d, { withFileTypes: true });
        for (const f of files) {
          const fullPath = path.join(d, f.name);
          if (f.isDirectory() && f.name !== 'system' && f.name !== 'first-session') scan(fullPath);
          else if (f.name.endsWith('.md') && f.name !== 'index.md') {
            const name = f.name.replace(/\.md$/, '');
            if (!names.has(name)) {
              runbooks.push({ name });
              names.add(name);
            }
          }
        }
      };
      scan(rbDir);
    } catch (e) { debug('getRunbookEntries: %s', e.message); }
  }
  return runbooks;
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

async function buildStaticBanner(directory) {
  const agentEntries = getAgentEntries(directory);
  const fieldnotes = getFieldnotes(directory);
  const runbooks = getRunbookEntries(directory);
  const hotMem = await getHotPrimitives(directory);
  const cfg = getConfig(directory);
  const version = cfg.version ? ` v${cfg.version}` : '';
  const profile = getProfile(directory);
  const profileTag = profile !== 'standard' ? ` [${profile.toUpperCase()}]` : '';
  const docker = cfg.docker || {};
  const semanticSearchUrl = docker.search && docker.search.address ? `http://${docker.search.address}:${docker.search.port}/search` : '';
  const workerList = agentEntries.length > 0 ? agentEntries.map((a) => a.name).join(', ') : '(none yet)';
  const fieldnoteLine = fieldnotes.length > 0 ? fieldnotes.map((s) => s.name).join(', ') : '';
  const runbookLine = runbooks.length > 0 ? runbooks.map((r) => r.name).join(', ') : '';
  let output = `\x1b[91m▆▆▆ [LORE-CORE-PROTOCOL-V1] ▆▆▆\x1b[0m\nVERSION: ${version}${profileTag}\nWORKERS: ${workerList}`;
  if (semanticSearchUrl) output += `\nSEMANTIC SEARCH: ${semanticSearchUrl}`;
  if (profile === 'minimal') {
    output += `\nPROFILE: minimal \u2014 per-tool nudges off. Use /lore-capture manually after substantive work.`;
  } else if (profile === 'discovery') {
    output += `\nPROFILE: discovery \u2014 capture aggressively. Map every service, endpoint, auth header, and redirect to docs/knowledge-base/machine/. Create fieldnotes for every non-obvious fix. Run /lore-capture at natural breakpoints.`;
  }
  if (fieldnoteLine) output += `\n\nFIELDNOTES: ${fieldnoteLine}`;
  if (runbookLine) output += `\n\nAVAILABLE RUNBOOKS: ${runbookLine}`;
  if (hotMem.length > 0) {
    const fading = hotMem.filter(m => m.current_score < 1.5);
    if (fading.length > 0) output += `\n\nWARNING: ${fading.length} memory facts are fading. Run /lore-reconcile to persist them.`;
    output += `\n\nACTIVE MEMORY (Hot): ` + hotMem.map(m => m.path.split('/').pop().replace(/\.md$/, '')).join(', ');
  }
  const bannerSkills = getBannerLoadedSkills(directory);
  if (bannerSkills.length > 0) output += '\n\n' + bannerSkills.map((s) => s.body).join('\n\n');
  try {
    const agentRulesPath = path.join(getEnclavePath(), 'rules', 'lore-agent-rules.md');
    const raw = fs.readFileSync(agentRulesPath, 'utf8');
    const stripped = stripFrontmatter(raw).trim();
    if (stripped) output += '\n\nPROJECT IDENTITY:\n' + stripped;
  } catch (e) { debug('project-identity: %s', e.message); }
  try {
    const allRules = [];
    const rulesDirs = [path.join(getEnclavePath(), 'rules'), path.join(directory, '.lore', 'rules')];
    const seen = new Set();
    for (const rDir of rulesDirs) {
      if (!fs.existsSync(rDir)) continue;
      const files = fs.readdirSync(rDir).filter(f => f.endsWith('.md') && f !== 'lore-agent-rules.md' && !fs.lstatSync(path.join(rDir, f)).isDirectory()).sort();
      for (const f of files) {
        if (seen.has(f) || allRules.length >= 10) continue;
        const content = stripFrontmatter(fs.readFileSync(path.join(rDir, f), 'utf8')).trim();
        if (content) { allRules.push(content); seen.add(f); }
      }
      const sDir = path.join(rDir, 'system');
      if (fs.existsSync(sDir)) {
        const sFiles = fs.readdirSync(sDir).filter(f => f.endsWith('.md') && !seen.has(f)).sort();
        for (const f of sFiles) {
          if (allRules.length >= 10) break;
          const content = stripFrontmatter(fs.readFileSync(path.join(sDir, f), 'utf8')).trim();
          if (content) { allRules.push(content); seen.add(f); }
        }
      }
    }
    if (allRules.length > 0) output += '\n\nRULES:\n' + allRules.join('\n\n');
  } catch (e) { debug('rules: %s', e.message); }
  return output;
}

function buildDynamicBanner(directory) {
  let output = '';
  const enclaveKB = path.join(getEnclavePath(), 'knowledge-base');
  try {
    const operatorPath = path.join(enclaveKB, 'operator', 'operator-profile.md');
    if (fs.existsSync(operatorPath)) {
      const raw = fs.readFileSync(operatorPath, 'utf8');
      const stripped = stripFrontmatter(raw).trim();
      if (stripped && !stripped.includes('- **Name:**')) output += 'OPERATOR PROFILE:\n' + stripped;
    }
  } catch (e) { debug('operator-profile: %s', e.message); }
  try {
    const userPath = path.join(enclaveKB, 'user', 'index.md');
    if (fs.existsSync(userPath)) {
      const raw = fs.readFileSync(userPath, 'utf8');
      const stripped = stripFrontmatter(raw).trim();
      if (stripped) {
        if (output) output += '\n\n';
        output += 'USER CONTEXT:\n' + stripped;
      }
    }
  } catch (e) { debug('user-context: %s', e.message); }
  const memPath = path.join(directory, '.lore', 'memory.local.md');
  try {
    const raw = fs.readFileSync(memPath, 'utf8');
    const stripped = stripFrontmatter(raw).trim();
    if (stripped && !stripped.includes('Transient memory')) {
      if (output) output += '\n\n';
      output += 'SESSION MEMORY:\n' + stripped;
    }
  } catch (e) { debug('memory: %s', e.message); }
  return output;
}

module.exports = { buildStaticBanner, buildDynamicBanner, getAgentEntries, getFieldnotes, getBannerLoadedSkills, getConfig, getProfile, parseFrontmatter, stripFrontmatter };
