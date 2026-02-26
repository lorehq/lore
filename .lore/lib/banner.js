// Shared: session banner builder.
// Used by hooks/session-init.js (CJS) and .opencode/plugins/session-init.js (ESM).
//
// Decomposed: tree building (lib/tree.js), config reading (lib/config.js),
// sticky file scaffolding (lib/sticky.js). This module handles banner assembly
// and re-exports everything for backward compatibility.

const fs = require('fs');
const path = require('path');
const { debug } = require('./debug');
const { buildTree } = require('./tree');
const { getConfig, getProfile } = require('./config');
const { ensureStickyFiles } = require('./sticky');
const { parseFrontmatter, stripFrontmatter } = require('./frontmatter');

function getAgentNames(directory) {
  try {
    const agentsDir = path.join(directory, '.lore', 'agents');
    return fs
      .readdirSync(agentsDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''));
  } catch (e) {
    debug('getAgentNames: %s', e.message);
    return [];
  }
}

// Returns [{name}] entries for banner output (from agent frontmatter).
function getAgentEntries(directory) {
  try {
    const agentsDir = path.join(directory, '.lore', 'agents');
    const entries = [];
    for (const f of fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md'))) {
      const content = fs.readFileSync(path.join(agentsDir, f), 'utf8');
      const { attrs } = parseFrontmatter(content);
      if (attrs.name) entries.push({ name: attrs.name });
    }
    return entries;
  } catch (e) {
    debug('getAgentEntries: %s', e.message);
    return [];
  }
}

// Returns fieldnotes (gotcha collections) with descriptions from .lore/fieldnotes/*/SKILL.md.
function getFieldnotes(directory) {
  try {
    const fieldnotesDir = path.join(directory, '.lore', 'fieldnotes');
    const notes = [];
    for (const d of fs.readdirSync(fieldnotesDir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const skillFile = path.join(fieldnotesDir, d.name, 'SKILL.md');
      if (!fs.existsSync(skillFile)) continue;
      const content = fs.readFileSync(skillFile, 'utf8');
      const { attrs } = parseFrontmatter(content);
      if (attrs.name) notes.push({ name: attrs.name, description: attrs.description || '' });
    }
    return notes;
  } catch (e) {
    debug('getFieldnotes: %s', e.message);
    return [];
  }
}

// Scan work items (roadmaps or plans) and return active labels.
// YAML parsing: single-line values only — no multi-line, no flow sequences.
function scanWork(dir) {
  const active = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'archive') continue;
      const indexPath = path.join(dir, entry.name, 'index.md');
      if (!fs.existsSync(indexPath)) continue;
      const content = fs.readFileSync(indexPath, 'utf8');
      const { attrs } = parseFrontmatter(content);
      const status = attrs.status;
      if (status !== 'active' && status !== 'on-hold') continue;
      const title = attrs.title || entry.name;
      let label = title;
      if (attrs.summary) label += ` (${attrs.summary})`;
      if (status === 'on-hold') label += ' [ON HOLD]';
      active.push(label);
    }
  } catch (e) {
    debug('scanWork: %s: %s', dir, e.message);
  }
  return active;
}

// Returns skills with banner-loaded: true — content inlined into session banner.
// Scans both .lore/skills/ and .lore/fieldnotes/.
function getBannerLoadedSkills(directory) {
  const loaded = [];
  const dirs = [path.join(directory, '.lore', 'skills'), path.join(directory, '.lore', 'fieldnotes')];
  for (const skillsDir of dirs) {
    try {
      for (const d of fs.readdirSync(skillsDir, { withFileTypes: true })) {
        if (!d.isDirectory()) continue;
        const skillFile = path.join(skillsDir, d.name, 'SKILL.md');
        if (!fs.existsSync(skillFile)) continue;
        const content = fs.readFileSync(skillFile, 'utf8');
        const { attrs } = parseFrontmatter(content);
        if (attrs['banner-loaded'] === 'true') {
          loaded.push({ name: attrs.name || d.name, body: stripFrontmatter(content).trim() });
        }
      }
    } catch (e) {
      debug('getBannerLoadedSkills: %s: %s', skillsDir, e.message);
    }
  }
  return loaded;
}

// Static banner: file-driven content that only changes when source files change.
// Suitable for baking into CLAUDE.md and .mdc files at generation time.
function buildStaticBanner(directory) {
  const agentEntries = getAgentEntries(directory);
  const fieldnotes = getFieldnotes(directory);

  const cfg = getConfig(directory);
  const version = cfg.version ? ` v${cfg.version}` : '';
  const profile = getProfile(directory);
  const profileTag = profile !== 'standard' ? ` [${profile.toUpperCase()}]` : '';
  const treeDepth = cfg.treeDepth ?? 5;
  const docker = cfg.docker || {};
  const semanticSearchUrl =
    docker.search && docker.search.address ? `http://${docker.search.address}:${docker.search.port}/search` : '';

  const docsWork = path.join(directory, 'docs', 'work');
  const roadmaps = scanWork(path.join(docsWork, 'roadmaps'));
  const plans = scanWork(path.join(docsWork, 'plans'));

  // Notes (docs/work/notes/) intentionally excluded from scanning — lightweight capture, no banner inclusion
  const workerList = agentEntries.length > 0 ? agentEntries.map((a) => a.name).join(', ') : '(none yet)';
  const fieldnoteLine = fieldnotes.length > 0 ? fieldnotes.map((s) => s.name).join(', ') : '';

  let output = `=== LORE${version}${profileTag} ===

WORKERS: ${workerList}`;

  if (semanticSearchUrl) {
    output += `\nSEMANTIC SEARCH: ${semanticSearchUrl}`;
  }

  if (profile === 'minimal') {
    output += '\nPROFILE: minimal \u2014 per-tool nudges off. Use /lore-capture manually after substantive work.';
  } else if (profile === 'discovery') {
    output +=
      '\nPROFILE: discovery \u2014 capture aggressively. Map every service, endpoint, auth header, and redirect to docs/knowledge/environment/. Create fieldnotes for every non-obvious fix. Run /lore-capture at natural breakpoints.';
  }

  if (fieldnoteLine) output += `\n\nFIELDNOTES: ${fieldnoteLine}`;

  const bannerSkills = getBannerLoadedSkills(directory);
  if (bannerSkills.length > 0) {
    output += '\n\n' + bannerSkills.map((s) => s.body).join('\n\n');
  }

  if (roadmaps.length > 0) output += `\n\nACTIVE ROADMAPS: ${roadmaps.join('; ')}`;
  if (plans.length > 0) output += `\n\nACTIVE PLANS: ${plans.join('; ')}`;

  try {
    const raw = fs.readFileSync(path.join(directory, 'docs', 'context', 'agent-rules.md'), 'utf8');
    const stripped = stripFrontmatter(raw).trim();
    if (stripped && !stripped.includes('Describe your project')) output += '\n\nPROJECT:\n' + stripped;
  } catch (e) {
    debug('agent-rules: %s', e.message);
  }

  try {
    const rulesDir = path.join(directory, 'docs', 'context', 'rules');
    const rulesFile = path.join(directory, 'docs', 'context', 'rules.md');
    if (semanticSearchUrl) {
      // Semantic search available — list all rule names, agent finds content on demand
      // Merge operator rules + system/ rules (operator names take precedence)
      if (fs.existsSync(rulesDir) && fs.statSync(rulesDir).isDirectory()) {
        const operatorNames = fs.readdirSync(rulesDir).filter((f) => f.endsWith('.md') && f !== 'index.md');
        const operatorSet = new Set(operatorNames);
        let systemNames = [];
        const systemDir = path.join(rulesDir, 'system');
        try {
          systemNames = fs
            .readdirSync(systemDir)
            .filter((f) => f.endsWith('.md') && f !== 'index.md' && !operatorSet.has(f));
        } catch (_) {}
        const allNames = [...operatorNames, ...systemNames].map((f) => f.replace(/\.md$/, '')).sort();
        if (allNames.length > 0) {
          output += '\n\nAVAILABLE RULES (load when relevant): ' + allNames.join(', ');
        }
      }
    } else {
      // No semantic search — inject all rules in full
      // Merge operator rules + system/ rules (operator files take precedence)
      const requiredParts = [];
      if (fs.existsSync(rulesDir) && fs.statSync(rulesDir).isDirectory()) {
        const operatorFiles = fs
          .readdirSync(rulesDir)
          .filter((f) => f.endsWith('.md'))
          .sort((a, b) => {
            if (a === 'index.md') return -1;
            if (b === 'index.md') return 1;
            return a.localeCompare(b);
          });
        const operatorSet = new Set(operatorFiles);
        for (const file of operatorFiles) {
          const raw = fs.readFileSync(path.join(rulesDir, file), 'utf8');
          const stripped = stripFrontmatter(raw).trim();
          if (stripped) requiredParts.push(stripped);
        }
        // Add system/ rules not overridden by operator files
        const systemDir = path.join(rulesDir, 'system');
        try {
          const systemFiles = fs
            .readdirSync(systemDir)
            .filter((f) => f.endsWith('.md') && f !== 'index.md' && !operatorSet.has(f))
            .sort();
          for (const file of systemFiles) {
            const raw = fs.readFileSync(path.join(systemDir, file), 'utf8');
            const stripped = stripFrontmatter(raw).trim();
            if (stripped) requiredParts.push(stripped);
          }
        } catch (_) {}
      } else if (fs.existsSync(rulesFile)) {
        const raw = fs.readFileSync(rulesFile, 'utf8');
        const stripped = stripFrontmatter(raw).trim();
        if (stripped) requiredParts.push(stripped);
      }
      if (requiredParts.length > 0) output += '\n\nRULES:\n' + requiredParts.join('\n\n');
    }
  } catch (e) {
    debug('rules: %s', e.message);
  }

  if (!semanticSearchUrl) {
    const trees = [];
    const docsTree = buildTree(path.join(directory, 'docs'), '', { maxDepth: treeDepth });
    if (docsTree.length > 0) trees.push('docs/\n' + docsTree.join('\n'));
    const fieldnotesTree = buildTree(path.join(directory, '.lore', 'fieldnotes'), '', { maxDepth: treeDepth });
    if (fieldnotesTree.length > 0) trees.push('.lore/fieldnotes/\n' + fieldnotesTree.join('\n'));
    const skillsTree = buildTree(path.join(directory, '.lore', 'skills'), '', { maxDepth: treeDepth });
    if (skillsTree.length > 0) trees.push('.lore/skills/\n' + skillsTree.join('\n'));
    const agentsTree = buildTree(path.join(directory, '.lore', 'agents'), '', { maxDepth: treeDepth });
    if (agentsTree.length > 0) trees.push('.lore/agents/\n' + agentsTree.join('\n'));
    if (trees.length > 0) output += '\n\nKNOWLEDGE MAP:\n' + trees.join('\n');
  }

  return output;
}

// Dynamic banner: gitignored content that changes between/within sessions.
// Injected at runtime via hooks — never baked into static files.
function buildDynamicBanner(directory) {
  let output = '';

  try {
    const profilePath = path.join(directory, 'docs', 'knowledge', 'local', 'operator-profile.md');
    const raw = fs.readFileSync(profilePath, 'utf8');
    const stripped = stripFrontmatter(raw).trim();
    // Skip injection if the profile is still the default template
    if (stripped && !stripped.includes('- **Name:**\n- **Role:**')) {
      output += 'OPERATOR PROFILE:\n' + stripped;
    }
  } catch (e) {
    debug('operator-profile: %s', e.message);
  }

  const memPath = path.join(directory, '.lore/memory.local.md');
  try {
    const mem = fs.readFileSync(memPath, 'utf8').trim();
    if (mem && mem !== '# Local Memory') {
      if (output) output += '\n\n';
      output += `LOCAL MEMORY:\n${mem}`;
    }
  } catch (e) {
    debug('local-memory: %s', e.message);
  }

  return output;
}

// Full banner: static + dynamic combined. Backward compatible.
function buildBanner(directory) {
  let output = buildStaticBanner(directory);
  const dynamic = buildDynamicBanner(directory);
  if (dynamic) output += '\n\n' + dynamic;
  return output;
}

// Cursor-specific banner: dynamic-only content that can't live in static .mdc rules.
// Complements the tiered .cursor/rules/lore-*.mdc files which handle project identity,
// rules, knowledge map, delegation, and other static context.
// This banner provides only what changes between sessions:
//   - Version header
//   - Active roadmaps/plans (scanned from docs/work/ frontmatter)
//   - Local memory (.lore/memory.local.md, gitignored)
function buildCursorBanner(directory) {
  const cfg = getConfig(directory);
  const version = cfg.version ? ` v${cfg.version}` : '';

  // Active work items — changes frequently, can't be static
  const docsWork = path.join(directory, 'docs', 'work');
  const roadmaps = scanWork(path.join(docsWork, 'roadmaps'));
  const plans = scanWork(path.join(docsWork, 'plans'));

  let output = `=== LORE${version} ===`;

  if (roadmaps.length > 0) output += `\n\nACTIVE ROADMAPS: ${roadmaps.join('; ')}`;
  if (plans.length > 0) output += `\n\nACTIVE PLANS: ${plans.join('; ')}`;

  // Operator profile — gitignored, can't be in .mdc rules
  try {
    const profilePath = path.join(directory, 'docs', 'knowledge', 'local', 'operator-profile.md');
    const raw = fs.readFileSync(profilePath, 'utf8');
    const stripped = stripFrontmatter(raw).trim();
    if (stripped && !stripped.includes('- **Name:**\n- **Role:**')) {
      output += '\n\nOPERATOR PROFILE:\n' + stripped;
    }
  } catch (e) {
    debug('operator-profile: %s', e.message);
  }

  // Local memory — gitignored, can't be in .mdc rules
  const memPath = path.join(directory, '.lore/memory.local.md');
  try {
    const mem = fs.readFileSync(memPath, 'utf8').trim();
    if (mem && mem !== '# Local Memory') output += `\n\nLOCAL MEMORY:\n${mem}`;
  } catch (e) {
    debug('local-memory: %s', e.message);
  }

  return output;
}

// Re-export everything for backward compatibility.
// New code can import directly from lib/tree, lib/config, lib/sticky.
module.exports = {
  buildBanner,
  buildStaticBanner,
  buildDynamicBanner,
  buildCursorBanner,
  buildTree,
  ensureStickyFiles,
  getAgentNames,
  getAgentEntries,
  getConfig,
  getProfile,
  getBannerLoadedSkills,
  getFieldnotes,
  parseFrontmatter,
  scanWork,
  stripFrontmatter,
};
