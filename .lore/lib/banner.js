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

function buildBanner(directory) {
  const agentEntries = getAgentEntries(directory);
  const operatorSkills = getOperatorSkills(directory);

  const cfg = getConfig(directory);
  const version = cfg.version ? ` v${cfg.version}` : '';
  const treeDepth = cfg.treeDepth ?? 5;
  const semanticSearchUrl =
    typeof cfg.semanticSearchUrl === 'string' && cfg.semanticSearchUrl.trim() ? cfg.semanticSearchUrl.trim() : '';

  const docsWork = path.join(directory, 'docs', 'work');
  const roadmaps = scanWork(path.join(docsWork, 'roadmaps'));
  const plans = scanWork(path.join(docsWork, 'plans'));

  const delegationLine =
    'Delegate only heavy or parallel tasks; keep simple lookups/calls and capture writes in primary agent. Workers: ' +
    (agentEntries.length > 0 ? agentEntries.map((a) => a.name).join(', ') : '(none yet)');
  const skillLine =
    operatorSkills.length > 0 ? operatorSkills.map((s) => `${s.name} \u2014 ${s.description}`).join(' | ') : '';

  let output = `=== LORE${version} ===

DELEGATION: ${delegationLine}
KNOWLEDGE: Vague question lookup order -> Knowledge, then Work items, then Context (docs/knowledge/ -> docs/work/ -> docs/context/) | Use Exploration -> Execution. Capture reusable Execution fixes -> skills | Capture environment discoveries (URL/endpoint/service/host/port/auth/header/redirect/base path) -> docs/knowledge/environment/
CAPTURE: In Exploration, failures may be normal discovery. In Execution, failures require capture decision (A/B/C) before completion.`;

  output +=
    '\nLOOKUP: Vague ask -> quick local lookup in order: Knowledge folder -> Work folder -> Context folder. Keep it shallow (first 2 levels), then ask clarifying questions if still unclear.';
  if (semanticSearchUrl) {
    output +=
      `\nSEMANTIC SEARCH: enabled -> ${semanticSearchUrl} (query first for vague asks; for localhost/private endpoints use skill semantic-search-query-local; then fall back to folder lookup).`;
  }

  if (skillLine) output += `\n\nSKILLS (load relevant ones when delegating): ${skillLine}`;

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
  getOperatorSkills,
  parseFrontmatter,
  scanWork,
  stripFrontmatter,
};
