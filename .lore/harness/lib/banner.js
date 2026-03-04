const fs = require('fs');
const path = require('path');
const http = require('http');
const { debug } = require('./debug');
const { buildTree } = require('./tree');
const { getConfig, getProfile, getGlobalPath } = require('./config');
const { ensureStickyFiles } = require('./sticky');
const { parseFrontmatter, stripFrontmatter } = require('./frontmatter');
const { getSidecarPort, getGlobalToken } = require('./global');

/**
 * Fast sidecar health probe. Returns true if the sidecar responds within timeout.
 */
function probeSidecar(timeoutMs = 200) {
  return new Promise((resolve) => {
    const req = http.get({
      hostname: 'localhost',
      port: getSidecarPort(),
      path: '/health',
      timeout: timeoutMs,
      headers: (() => {
        const token = getGlobalToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      })(),
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const health = JSON.parse(data);
          resolve(health.ok ? health : false);
        } catch { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}


function getFieldnotes(directory) {
  const notes = [];
  const names = new Set();
  const dirs = [path.join(getGlobalPath(), 'knowledge-base', 'fieldnotes')];
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
  const dirs = [path.join(getGlobalPath(), 'knowledge-base', 'runbooks')];
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

function getBannerLoadedSkills(directory) {
  const byName = new Map();
  const baseDirs = [
    path.join(directory, '.lore', 'harness', 'skills'),   // harness (lowest priority)
    path.join(getGlobalPath(), 'skills'),                  // global user
    path.join(directory, '.lore', 'skills'),               // project user (wins)
  ];
  for (const skillsDir of baseDirs) {
    try {
      if (!fs.existsSync(skillsDir)) continue;
      for (const d of fs.readdirSync(skillsDir, { withFileTypes: true })) {
        if (!d.isDirectory()) continue;
        const manifest = path.join(skillsDir, d.name, 'SKILL.md');
        if (!fs.existsSync(manifest)) continue;
        const content = fs.readFileSync(manifest, 'utf8');
        const { attrs } = parseFrontmatter(content);
        const name = attrs.name || d.name;
        if (attrs['banner-loaded'] === 'true') {
          byName.set(name, { name, body: stripFrontmatter(content).trim() });
        }
      }
    } catch (e) { debug('getBannerLoadedSkills: %s', e.message); }
  }
  return [...byName.values()];
}

async function buildStaticBanner(directory) {
  const fieldnotes = getFieldnotes(directory);
  const runbooks = getRunbookEntries(directory);
  const sidecarHealth = await probeSidecar();
  const cfg = getConfig(directory);
  const version = cfg.version ? ` v${cfg.version}` : '';
  const profile = getProfile(directory);
  const profileTag = profile !== 'standard' ? ` [${profile.toUpperCase()}]` : '';
  const fieldnoteLine = fieldnotes.length > 0 ? fieldnotes.map((s) => s.name).join(', ') : '';
  const runbookLine = runbooks.length > 0 ? runbooks.map((r) => r.name).join(', ') : '';
  let output = `\x1b[93m▆▆▆ [LORE-HARNESS-PROTOCOL] ▆▆▆\x1b[0m\nVERSION: ${version}${profileTag}`;
  if (sidecarHealth) {
    output += `\nSEMANTIC SEARCH: http://localhost:${getSidecarPort()}/search`;
  }
  const globalKBPath = path.join(getGlobalPath(), 'knowledge-base');
  if (fs.existsSync(globalKBPath)) output += `\nKNOWLEDGE BASE: ${globalKBPath}`;

  // Hot memory status — green when active, red when offline
  if (sidecarHealth) {
    output += `\n\n\x1b[92m▆ HOT MEMORY: active\x1b[0m \u2014 capture context (lore_hot_session_note), recall before research (lore_hot_recall).`;
  } else {
    output += `\n\n\x1b[93m▆ HOT MEMORY: offline\x1b[0m \u2014 sidecar offline; write to .lore/memory.local.md instead. Start sidecar: /lore memory.`;
  }

  if (profile === 'minimal') {
    output += `\nPROFILE: minimal \u2014 per-tool nudges off. Capture fieldnotes manually after substantive work.`;
  } else if (profile === 'discovery') {
    output += `\nPROFILE: discovery \u2014 capture aggressively. Map every service, endpoint, auth header, and redirect to ~/.lore/knowledge-base/environment/. Create fieldnotes for every non-obvious fix.`;
  }
  if (fieldnoteLine) output += `\n\nFIELDNOTES: ${fieldnoteLine}`;
  if (runbookLine) output += `\n\nAVAILABLE RUNBOOKS: ${runbookLine}`;
  const bannerSkills = getBannerLoadedSkills(directory);
  if (bannerSkills.length > 0) output += '\n\n' + bannerSkills.map((s) => s.body).join('\n\n');
  try {
    const allRules = [];
    const rulesDirs = [path.join(getGlobalPath(), 'rules'), path.join(directory, '.lore', 'rules')];
    const seen = new Set();
    for (const rDir of rulesDirs) {
      if (!fs.existsSync(rDir)) continue;
      const files = fs.readdirSync(rDir).filter(f => f.endsWith('.md') && !fs.lstatSync(path.join(rDir, f)).isDirectory()).sort();
      for (const f of files) {
        if (seen.has(f) || allRules.length >= 10) continue;
        const content = stripFrontmatter(fs.readFileSync(path.join(rDir, f), 'utf8')).trim();
        if (content) { allRules.push(content); seen.add(f); }
      }
    }
    if (allRules.length > 0) output += '\n\nRULES:\n' + allRules.join('\n\n');
  } catch (e) { debug('rules: %s', e.message); }
  return output;
}

function buildDynamicBanner(directory) {
  let output = '';
  const globalKB = path.join(getGlobalPath(), 'knowledge-base');
  try {
    const operatorPath = path.join(globalKB, 'operator-profile.md');
    if (fs.existsSync(operatorPath)) {
      const raw = fs.readFileSync(operatorPath, 'utf8');
      const stripped = stripFrontmatter(raw).trim();
      if (stripped && !stripped.includes('- **Name:**')) output += 'OPERATOR PROFILE:\n' + stripped;
    }
  } catch (e) { debug('operator-profile: %s', e.message); }
  // Session memory — always show when present (sidecar handles hot memory separately)
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

module.exports = { buildStaticBanner, buildDynamicBanner, probeSidecar, getFieldnotes, getBannerLoadedSkills, getConfig, getProfile, parseFrontmatter, stripFrontmatter, ensureStickyFiles };
