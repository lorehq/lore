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

// Returns operator skills (non-lore-* prefix) with descriptions from .lore/skills/*/SKILL.md.
function getOperatorSkills(directory) {
  try {
    const skillsDir = path.join(directory, '.lore', 'skills');
    const skills = [];
    for (const d of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name.startsWith('lore-')) continue;
      const skillFile = path.join(skillsDir, d.name, 'SKILL.md');
      if (!fs.existsSync(skillFile)) continue;
      const content = fs.readFileSync(skillFile, 'utf8');
      const { attrs } = parseFrontmatter(content);
      if (attrs.name) skills.push({ name: attrs.name, description: attrs.description || '' });
    }
    return skills;
  } catch (e) {
    debug('getOperatorSkills: %s', e.message);
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
function getBannerLoadedSkills(directory) {
  try {
    const skillsDir = path.join(directory, '.lore', 'skills');
    const loaded = [];
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
    return loaded;
  } catch (e) {
    debug('getBannerLoadedSkills: %s', e.message);
    return [];
  }
}

function buildBanner(directory) {
  const agentEntries = getAgentEntries(directory);
  const operatorSkills = getOperatorSkills(directory);

  const cfg = getConfig(directory);
  const version = cfg.version ? ` v${cfg.version}` : '';
  const profile = getProfile(directory);
  const profileTag = profile !== 'standard' ? ` [${profile.toUpperCase()}]` : '';
  const treeDepth = cfg.treeDepth ?? 5;
  const docker = cfg.docker || {};
  const semanticSearchUrl =
    docker.search && docker.search.address
      ? `http://${docker.search.address}:${docker.search.port || 9185}/search`
      : '';

  const docsWork = path.join(directory, 'docs', 'work');
  const roadmaps = scanWork(path.join(docsWork, 'roadmaps'));
  const plans = scanWork(path.join(docsWork, 'plans'));

  const workerList = agentEntries.length > 0 ? agentEntries.map((a) => a.name).join(', ') : '(none yet)';
  const delegationLine =
    'DO NOT EXECUTE WORK YOURSELF. You are an orchestrator. Your ONLY jobs: (1) known path → Read directly; unknown → semantic search, (2) delegate ALL work to workers, (3) capture after. NEVER run curl, fetch, API calls, or multi-step exploration directly. Workers: ' +
    workerList;
  const skillLine = operatorSkills.length > 0 ? operatorSkills.map((s) => s.name).join(', ') : '';

  let output = `=== LORE${version}${profileTag} ===

DELEGATION: ${delegationLine}
KNOWLEDGE: Vague question lookup order -> Knowledge, then Work items, then Context (docs/knowledge/ -> docs/work/ -> docs/context/) | Use Exploration -> Execution. Capture reusable Execution fixes -> skills | Capture environment discoveries (URL/endpoint/service/host/port/auth/header/redirect/base path) -> docs/knowledge/environment/ | Ask operator before writing to docs/ or creating skills
CAPTURE: In Exploration, failures may be normal discovery. In Execution, failures require capture decision (A/B/C) before completion.`;

  if (profile === 'minimal') {
    output += '\nPROFILE: minimal \u2014 per-tool nudges off. Use /lore-capture manually after substantive work.';
  } else if (profile === 'discovery') {
    output +=
      '\nPROFILE: discovery \u2014 aggressive capture. Map every service, endpoint, auth header, and redirect to docs/knowledge/environment/. Create skills for every non-obvious fix. Run /lore-capture at natural breakpoints.';
  }

  if (semanticSearchUrl) {
    output += `\nSEMANTIC SEARCH: ${semanticSearchUrl} — unknown concept → query first; known path → Read/Grep directly. Delegate ALL work.`;
  } else {
    output +=
      '\nLOOKUP: Vague ask -> quick local lookup in order: Knowledge folder -> Work folder -> Context folder. Keep it shallow (first 2 levels), then ask clarifying questions if still unclear.';
  }

  if (skillLine) output += `\n\nSKILLS: ${skillLine}`;

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
    const profilePath = path.join(directory, 'docs', 'knowledge', 'local', 'operator-profile.md');
    const raw = fs.readFileSync(profilePath, 'utf8');
    const stripped = stripFrontmatter(raw).trim();
    // Skip injection if the profile is still the default template
    if (stripped && !stripped.includes('- **Name:**\n- **Role:**')) {
      output += '\n\nOPERATOR PROFILE:\n' + stripped;
    }
  } catch (e) {
    debug('operator-profile: %s', e.message);
  }

  try {
    const convDir = path.join(directory, 'docs', 'context', 'conventions');
    const convFile = path.join(directory, 'docs', 'context', 'conventions.md');
    if (semanticSearchUrl) {
      // Semantic search available — list all convention names, agent finds content on demand
      if (fs.existsSync(convDir) && fs.statSync(convDir).isDirectory()) {
        const allNames = fs
          .readdirSync(convDir)
          .filter((f) => f.endsWith('.md') && f !== 'index.md')
          .map((f) => f.replace(/\.md$/, ''))
          .sort();
        if (allNames.length > 0) {
          output += '\n\nAVAILABLE CONVENTIONS (load when relevant): ' + allNames.join(', ');
        }
      }
    } else {
      // No semantic search — inject required conventions in full, list rest by name
      const requiredParts = [];
      const availableNames = [];
      if (fs.existsSync(convDir) && fs.statSync(convDir).isDirectory()) {
        const files = fs
          .readdirSync(convDir)
          .filter((f) => f.endsWith('.md'))
          .sort((a, b) => {
            if (a === 'index.md') return -1;
            if (b === 'index.md') return 1;
            return a.localeCompare(b);
          });
        for (const file of files) {
          const raw = fs.readFileSync(path.join(convDir, file), 'utf8');
          const stripped = stripFrontmatter(raw).trim();
          if (!stripped) continue;
          // Without semantic search, inject all conventions so the model has them available
          requiredParts.push(stripped);
        }
      } else if (fs.existsSync(convFile)) {
        const raw = fs.readFileSync(convFile, 'utf8');
        const stripped = stripFrontmatter(raw).trim();
        if (stripped) requiredParts.push(stripped);
      }
      if (requiredParts.length > 0) output += '\n\nCONVENTIONS:\n' + requiredParts.join('\n\n');
      if (availableNames.length > 0)
        output += '\n\nAVAILABLE CONVENTIONS (load when relevant): ' + availableNames.join(', ');
    }
  } catch (e) {
    debug('conventions: %s', e.message);
  }

  if (!semanticSearchUrl) {
    const trees = [];
    const docsTree = buildTree(path.join(directory, 'docs'), '', { maxDepth: treeDepth });
    if (docsTree.length > 0) trees.push('docs/\n' + docsTree.join('\n'));
    const skillsTree = buildTree(path.join(directory, '.lore', 'skills'), '', { maxDepth: treeDepth });
    if (skillsTree.length > 0) trees.push('.lore/skills/\n' + skillsTree.join('\n'));
    const agentsTree = buildTree(path.join(directory, '.lore', 'agents'), '', { maxDepth: treeDepth });
    if (agentsTree.length > 0) trees.push('.lore/agents/\n' + agentsTree.join('\n'));
    if (trees.length > 0) output += '\n\nKNOWLEDGE MAP:\n' + trees.join('\n');
  }

  const memPath = path.join(directory, '.lore/memory.local.md');
  try {
    const mem = fs.readFileSync(memPath, 'utf8').trim();
    if (mem && mem !== '# Local Memory') output += `\n\nLOCAL MEMORY:\n${mem}`;
  } catch (e) {
    debug('local-memory: %s', e.message);
  }

  return output;
}

// Cursor-specific banner: dynamic-only content that can't live in static .mdc rules.
// Complements the tiered .cursor/rules/lore-*.mdc files which handle project identity,
// conventions, knowledge map, delegation, and other static context.
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
  buildCursorBanner,
  buildTree,
  ensureStickyFiles,
  getAgentNames,
  getAgentEntries,
  getConfig,
  getProfile,
  getBannerLoadedSkills,
  getOperatorSkills,
  parseFrontmatter,
  scanWork,
  stripFrontmatter,
};
