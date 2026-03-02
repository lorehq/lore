#!/usr/bin/env node
// Lore Projector Engine (Zero Dependencies)
// Projects the Lore Source of Truth (.lore/) into platform-specific configurations.

const fs = require('fs');
const path = require('path');
const { buildStaticBanner } = require('./banner');
const { stripFrontmatter, parseFrontmatter } = require('./frontmatter');
const { getConfig, getEnclavePath } = require('./config');

const baseManifest = require('./manifest.json');
const root = process.argv[2] || process.cwd();
const absRoot = path.resolve(root);
const enclavePath = getEnclavePath();

const cfg = getConfig(absRoot);
const MANIFEST = {
  ...baseManifest,
  platforms: {
    ...baseManifest.platforms,
    ...(cfg.manifest || {})
  }
};

const TIER_ALIASES = { fast: 'haiku', default: 'sonnet', powerful: 'opus' };

function readOr(filePath, fallback = '') {
  try { return fs.readFileSync(filePath, 'utf8'); }
  catch (_) { return fallback; }
}

function writeIfChanged(dest, content) {
  const existing = readOr(dest);
  if (existing === content) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
}

function extractSection(content, heading) {
  const lines = content.split(/\r?\n/);
  let capturing = false;
  let level = 0;
  const result = [];
  for (const line of lines) {
    const match = line.match(/^(\#{1,6})\s+(.*)$/);
    if (match) {
      if (match[2].trim() === heading) {
        capturing = true;
        level = match[1].length;
        result.push(line);
        continue;
      }
      if (capturing && match[1].length <= level) break;
    }
    if (capturing) result.push(line);
  }
  return result.join('\n').trim();
}

function stripField(src, field) {
  const re = new RegExp('^' + field + ':.*\n?', 'm');
  return src.replace(re, '');
}

function stampModel(src, model) {
  if (!model) return src;
  const fmMatch = src.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return src;
  let fm = fmMatch[1].replace(/^model:.*\n?/m, '');
  const descIdx = fm.search(/^description:.*$/m);
  if (descIdx >= 0) {
    const eol = fm.indexOf('\n', descIdx);
    if (eol >= 0) fm = fm.slice(0, eol + 1) + 'model: ' + model + '\n' + fm.slice(eol + 1);
    else fm += '\nmodel: ' + model;
  } else fm += '\nmodel: ' + model;
  return src.replace(fmMatch[1], fm.replace(/\n+$/, ''));
}

function project() {
  const instructions = readOr(path.join(absRoot, '.lore', 'instructions.md')).trim();
  const staticBanner = buildStaticBanner(absRoot);

  const getFragment = (name) => {
    const global = path.join(enclavePath, 'harness', 'fragments', name);
    const local = path.join(absRoot, '.lore', 'harness', 'fragments', name);
    return (readOr(global) || readOr(local)).trim();
  };

  const ambiguityGuard = getFragment('ambiguity-guard.md');
  const searchDiscipline = getFragment('search-discipline.md');
  const delegationGuidance = getFragment('delegation-guidance.md');

  const TIER_PREAMBLE = {
    fast: getFragment('agent-preamble-fast.md'),
    default: getFragment('agent-preamble-default.md'),
    powerful: getFragment('agent-preamble-powerful.md'),
  };

  const canonicalDir = path.join(absRoot, '.lore', 'agents');
  fs.mkdirSync(canonicalDir, { recursive: true });

  const allAgentFiles = new Set();
  const agentDirs = [path.join(enclavePath, 'agents'), path.join(absRoot, '.lore', 'agents')];
  for (const d of agentDirs) {
    try {
      if (fs.existsSync(d)) {
        for (const f of fs.readdirSync(d).filter(f => f.endsWith('.md'))) allAgentFiles.add(f);
      }
    } catch (_) {}
  }

  let agentTable = '';
  try {
    const cursorTiers = (cfg.subagentDefaults && cfg.subagentDefaults.cursor) || {};
    const rows = [];
    for (const f of Array.from(allAgentFiles).sort()) {
      const src = readOr(path.join(absRoot, '.lore', 'agents', f)) || readOr(path.join(enclavePath, 'agents', f));
      const { attrs } = parseFrontmatter(src);
      if (!attrs.name) continue;
      let tier = attrs.tier || 'default';
      if (f.startsWith('lore-worker')) {
        if (f.includes('-fast')) tier = 'fast';
        else if (f.includes('-powerful')) tier = 'powerful';
        else tier = 'default';
      }
      const model = cursorTiers[tier] || TIER_ALIASES[tier] || TIER_ALIASES.default;
      rows.push(`| ${attrs.name} | ${attrs.description || ''} | ${model} |`);
    }
    if (rows.length > 0) agentTable = '| Agent | Description | Model |\n|-------|-------------|-------|\n' + rows.join('\n');
  } catch (_) {}

  for (const [name, platform] of Object.entries(MANIFEST.platforms)) {
    const caps = platform.capabilities || [];
    if (caps.includes('mandates') && platform.mandateFile) {
      const parts = [instructions, delegationGuidance];
      if (!caps.includes('hooks')) parts.push(ambiguityGuard, searchDiscipline);
      parts.push(staticBanner);
      writeIfChanged(path.join(absRoot, platform.mandateFile), parts.join('\n\n') + '\n');
    }
    if (caps.includes('mdc') && platform.rulesDir) {
      const outDir = path.join(absRoot, platform.rulesDir);
      const writeMdc = (fn, desc, body) => writeIfChanged(path.join(outDir, fn), `---\ndescription: ${desc}\nalwaysApply: true\n---\n\n${body.trim()}\n`);
      const mcpSection = '\n\n## MCP Tools\n\nCall `lore_check_in` after every 2-3 shell commands to check for capture nudges. YOU MUST call `lore_write_guard` before every file write or edit.';
      writeMdc('lore-core.mdc', 'Lore harness instructions', instructions + '\n\n' + staticBanner + mcpSection);
      writeMdc('lore-ambiguity.mdc', 'Ambiguity guard', ambiguityGuard);
      writeMdc('lore-search-discipline.mdc', 'Search strategy enforcement', searchDiscipline);
      let delegationBody = extractSection(instructions, 'Delegation');
      if (agentTable) delegationBody += '\n\n## Agents\n\n' + agentTable;
      writeMdc('lore-delegation.mdc', 'Worker agent delegation', delegationBody);
    }
    if (caps.includes('hooks') && platform.hookFile) {
      const templatePath = path.join(absRoot, '.lore', 'harness', 'templates', `.${name}`, 'settings.json');
      if (fs.existsSync(templatePath)) writeIfChanged(path.join(absRoot, platform.hookFile), fs.readFileSync(templatePath, 'utf8'));
    }
    if (caps.includes('agents') && platform.agentsDir) {
      const platformAgentsDir = path.join(absRoot, platform.agentsDir);
      const platformTiers = (cfg.subagentDefaults && cfg.subagentDefaults[name]) || {};
      for (const f of allAgentFiles) {
        const src = readOr(path.join(absRoot, '.lore', 'agents', f)) || readOr(path.join(enclavePath, 'agents', f));
        const { attrs } = parseFrontmatter(src);
        let tier = attrs.tier || 'default';
        if (f.startsWith('lore-worker')) {
          if (f.includes('-fast')) tier = 'fast';
          else if (f.includes('-powerful')) tier = 'powerful';
          else tier = 'default';
        }
        const modelAlias = platformTiers[tier] || TIER_ALIASES[tier] || TIER_ALIASES.default;
        writeIfChanged(path.join(platformAgentsDir, f), stampModel(stripField(src, 'tier'), modelAlias));
      }
    }
  }
}

project();
