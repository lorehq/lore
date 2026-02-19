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
const { getConfig } = require('./config');
const { ensureStickyFiles } = require('./sticky');
const { parseFrontmatter, stripFrontmatter } = require('./frontmatter');

function getAgentDomains(directory) {
  try {
    const content = fs.readFileSync(path.join(directory, 'agent-registry.md'), 'utf8');
    const domains = new Set();
    for (const line of content.split(/\r?\n/)) {
      if (!line.startsWith('|') || line.includes('|---')) continue;
      const parts = line.split('|').map((p) => p.trim());
      const agent = (parts[1] || '').replace(/`/g, '').trim();
      const domain = (parts[2] || '').trim();
      if (!agent || agent.toLowerCase() === 'agent') continue;
      if (!domain || domain.toLowerCase() === 'domain') continue;
      domains.add(domain);
    }
    return Array.from(domains);
  } catch (e) {
    debug('getAgentDomains: %s', e.message);
    return [];
  }
}

// Returns [{name, domain}] pairs for richer banner output.
function getAgentEntries(directory) {
  try {
    const content = fs.readFileSync(path.join(directory, 'agent-registry.md'), 'utf8');
    const entries = [];
    for (const line of content.split(/\r?\n/)) {
      if (!line.startsWith('|') || line.includes('|---')) continue;
      const parts = line.split('|').map((p) => p.trim());
      const name = (parts[1] || '').replace(/`/g, '').trim();
      const domain = (parts[2] || '').trim();
      if (!name || name.toLowerCase() === 'agent') continue;
      if (!domain || domain.toLowerCase() === 'domain') continue;
      entries.push({ name, domain });
    }
    return entries;
  } catch (e) {
    debug('getAgentEntries: %s', e.message);
    return [];
  }
}

// Returns operator skills (non-lore-* prefix) with descriptions from skills-registry.md.
function getOperatorSkills(directory) {
  try {
    const content = fs.readFileSync(path.join(directory, 'skills-registry.md'), 'utf8');
    const skills = [];
    for (const line of content.split(/\r?\n/)) {
      if (!line.startsWith('|') || line.includes('|---')) continue;
      const parts = line.split('|').map((p) => p.trim());
      const name = (parts[1] || '').replace(/`/g, '').trim();
      const desc = (parts[3] || '').trim();
      if (!name || name.toLowerCase() === 'skill') continue;
      if (name.startsWith('lore-')) continue;
      skills.push({ name, description: desc });
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

function buildBanner(directory) {
  const agentEntries = getAgentEntries(directory);
  const operatorSkills = getOperatorSkills(directory);

  const cfg = getConfig(directory);
  const version = cfg.version ? ` v${cfg.version}` : '';
  const treeDepth = cfg.treeDepth ?? 5;

  const docsWork = path.join(directory, 'docs', 'work');
  const roadmaps = scanWork(path.join(docsWork, 'roadmaps'));
  const plans = scanWork(path.join(docsWork, 'plans'));

  const agentLine =
    agentEntries.length > 0 ? agentEntries.map((a) => `${a.name} (${a.domain})`).join(' | ') : '(none yet)';
  const skillLine =
    operatorSkills.length > 0 ? operatorSkills.map((s) => `${s.name} \u2014 ${s.description}`).join(' | ') : '';

  let output = `=== LORE${version} ===

AGENTS: ${agentLine}
KNOWLEDGE: Gotcha \u2192 skill | New context \u2192 docs/knowledge/
CAPTURE: After substantive work \u2192 validate consistency, update active plans.`;

  if (skillLine) output += `\n\nOPERATOR SKILLS: ${skillLine}`;

  if (roadmaps.length > 0) output += `\n\nACTIVE ROADMAPS: ${roadmaps.join('; ')}`;
  if (plans.length > 0) output += `\n\nACTIVE PLANS: ${plans.join('; ')}`;

  try {
    const raw = fs.readFileSync(path.join(directory, 'docs', 'context', 'agent-rules.md'), 'utf8');
    const stripped = stripFrontmatter(raw).trim();
    if (stripped) output += '\n\nPROJECT:\n' + stripped;
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
    const parts = [];
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
        if (stripped) parts.push(stripped);
      }
    } else if (fs.existsSync(convFile)) {
      const raw = fs.readFileSync(convFile, 'utf8');
      const stripped = stripFrontmatter(raw).trim();
      if (stripped) parts.push(stripped);
    }
    if (parts.length > 0) output += '\n\nCONVENTIONS:\n' + parts.join('\n\n');
  } catch (e) {
    debug('conventions: %s', e.message);
  }

  const trees = [];
  const docsTree = buildTree(path.join(directory, 'docs'), '', { maxDepth: treeDepth });
  if (docsTree.length > 0) trees.push('docs/\n' + docsTree.join('\n'));
  const skillsTree = buildTree(path.join(directory, '.lore', 'skills'), '', { maxDepth: treeDepth });
  if (skillsTree.length > 0) trees.push('.lore/skills/\n' + skillsTree.join('\n'));
  const agentsTree = buildTree(path.join(directory, '.lore', 'agents'), '', { maxDepth: treeDepth });
  if (agentsTree.length > 0) trees.push('.lore/agents/\n' + agentsTree.join('\n'));
  if (trees.length > 0) output += '\n\nKNOWLEDGE MAP:\n' + trees.join('\n');

  const memPath = path.join(directory, 'MEMORY.local.md');
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
//   - Local memory (MEMORY.local.md, gitignored)
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
  const memPath = path.join(directory, 'MEMORY.local.md');
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
  getAgentDomains,
  getAgentEntries,
  getConfig,
  getOperatorSkills,
  parseFrontmatter,
  scanWork,
  stripFrontmatter,
};
