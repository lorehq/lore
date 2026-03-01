#!/usr/bin/env node
// Lore Projector Engine (Zero Dependencies)
// Projects the Lore Source of Truth (.lore/) into platform-specific configurations.

const fs = require('fs');
const path = require('path');
const { buildStaticBanner } = require('./banner');
const { stripFrontmatter, parseFrontmatter } = require('./frontmatter');
const { getConfig } = require('./config');

const baseManifest = require('./manifest.json');
const root = process.argv[2] || process.cwd();
const absRoot = path.resolve(root);

const cfg = getConfig(absRoot);
const MANIFEST = {
  ...baseManifest,
  platforms: {
    ...baseManifest.platforms,
    ...(cfg.manifest || {})
  }
};

const TIER_ALIASES = { fast: 'haiku', default: 'sonnet', powerful: 'opus' };

// --- Helpers ---

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
    const match = line.match(/^(#{1,6})\s+(.*)$/);
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
  const re = new RegExp('^' + field + ':.*\\n?', 'm');
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
    if (eol >= 0) {
      fm = fm.slice(0, eol + 1) + 'model: ' + model + '\n' + fm.slice(eol + 1);
    } else {
      fm += '\nmodel: ' + model;
    }
  } else {
    fm += '\nmodel: ' + model;
  }

  return src.replace(fmMatch[1], fm.replace(/\n+$/, ''));
}

// --- Projection Engine ---

function project() {
  const instructions = readOr(path.join(absRoot, '.lore', 'instructions.md')).trim();
  const staticBanner = buildStaticBanner(absRoot);

  const fragmentsDir = path.join(absRoot, '.lore', 'harness', 'fragments');
  const ambiguityGuard = readOr(path.join(fragmentsDir, 'ambiguity-guard.md')).trim();
  const searchDiscipline = readOr(path.join(fragmentsDir, 'search-discipline.md')).trim();
  const delegationGuidance = readOr(path.join(fragmentsDir, 'delegation-guidance.md')).trim();

  const TIER_PREAMBLE = {
    fast: readOr(path.join(fragmentsDir, 'agent-preamble-fast.md')).trim(),
    default: readOr(path.join(fragmentsDir, 'agent-preamble-default.md')).trim(),
    powerful: readOr(path.join(fragmentsDir, 'agent-preamble-powerful.md')).trim(),
  };

  const canonicalDir = path.join(absRoot, '.lore', 'agents');
  fs.mkdirSync(canonicalDir, { recursive: true });

  let agentTable = '';
  try {
    const cursorTiers = (cfg.subagentDefaults && cfg.subagentDefaults.cursor) || {};
    const rows = [];
    for (const f of fs.readdirSync(canonicalDir).filter(f => f.endsWith('.md'))) {
      const content = fs.readFileSync(path.join(canonicalDir, f), 'utf8');
      const { attrs } = parseFrontmatter(content);
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

    // 1. Projection: Mandates (Foundational MD files)
    if (caps.includes('mandates') && platform.mandateFile) {
      const parts = [instructions, delegationGuidance];
      if (!caps.includes('hooks')) parts.push(ambiguityGuard, searchDiscipline);
      parts.push(staticBanner);
      writeIfChanged(path.join(absRoot, platform.mandateFile), parts.join('\n\n') + '\n');
      console.log(`[Projector] Projected Mandates -> ${platform.mandateFile}`);
    }

    // 2. Projection: MDC Rules (Cursor Decomposed)
    if (caps.includes('mdc') && platform.rulesDir) {
      const outDir = path.join(absRoot, platform.rulesDir);
      const writeMdc = (filename, desc, body, alwaysApply = true) => {
        const content = `---\ndescription: ${desc}\nalwaysApply: ${alwaysApply}\n---\n\n${body.trim()}\n`;
        writeIfChanged(path.join(outDir, filename), content);
      };

      const mcpSection = '\n\n## MCP Tools\n\nCall `lore_check_in` after every 2-3 shell commands to check for capture nudges. YOU MUST call `lore_write_guard` before every file write or edit.';
      writeMdc('lore-core.mdc', 'Lore harness instructions', instructions + '\n\n' + staticBanner + mcpSection);
      writeMdc('lore-ambiguity.mdc', 'Ambiguity guard', ambiguityGuard);
      writeMdc('lore-search-discipline.mdc', 'Search strategy enforcement', searchDiscipline);
      
      let delegationBody = extractSection(instructions, 'Delegation');
      if (agentTable) delegationBody += '\n\n## Agents\n\n' + agentTable;
      writeMdc('lore-delegation.mdc', 'Worker agent delegation', delegationBody);
      console.log(`[Projector] Projected MDC Rules -> ${platform.rulesDir}`);
    }

    // 3. Projection: Hooks (Lifecycle config)
    if (caps.includes('hooks') && platform.hookFile) {
      const templatePath = path.join(absRoot, '.lore', 'harness', 'templates', `.${name}`, 'settings.json');
      if (fs.existsSync(templatePath)) {
        writeIfChanged(path.join(absRoot, platform.hookFile), fs.readFileSync(templatePath, 'utf8'));
        console.log(`[Projector] Projected Hooks -> ${platform.hookFile}`);
      }
    }

    // 4. Projection: Agents
    if (caps.includes('agents') && platform.agentsDir) {
      const platformAgentsDir = path.join(absRoot, platform.agentsDir);
      fs.mkdirSync(platformAgentsDir, { recursive: true });
      
      const platformTiers = (cfg.subagentDefaults && cfg.subagentDefaults[name]) || {};
      const templateGenerated = new Set();
      
      const workerTemplatePath = path.join(absRoot, '.lore', 'harness', 'templates', 'lore-worker.md');
      if (fs.existsSync(workerTemplatePath)) {
        const template = fs.readFileSync(workerTemplatePath, 'utf8');
        const tiers = [{ file: 'lore-worker.md', name: 'lore-worker', alias: TIER_ALIASES.default, tier: 'default' }];
        if (platformTiers.fast) tiers.push({ file: 'lore-worker-fast.md', name: 'lore-worker-fast', alias: TIER_ALIASES.fast, tier: 'fast' });
        if (platformTiers.powerful) tiers.push({ file: 'lore-worker-powerful.md', name: 'lore-worker-powerful', alias: TIER_ALIASES.powerful, tier: 'powerful' });
        
        const validFiles = new Set(tiers.map(t => t.file));
        
        for (const tier of tiers) {
          let canonical = template.replace(/^name:\s*.+$/m, 'name: ' + tier.name);
          const preamble = TIER_PREAMBLE[tier.tier] || '';
          if (preamble) canonical = canonical.replace(/^# Worker Agent\n/m, `# Worker Agent\n\n${preamble}\n`);
          writeIfChanged(path.join(canonicalDir, tier.file), canonical);
          
          const modelAlias = platformTiers[tier.tier] || tier.alias;
          const platformAgent = stampModel(canonical, modelAlias);
          writeIfChanged(path.join(platformAgentsDir, tier.file), platformAgent);
          templateGenerated.add(tier.file);
        }
        
        for (const dir of [canonicalDir, platformAgentsDir]) {
          try {
            for (const f of fs.readdirSync(dir)) {
              if (f.startsWith('lore-worker') && f.endsWith('.md') && !validFiles.has(f)) {
                fs.unlinkSync(path.join(dir, f));
              }
            }
          } catch (_) {}
        }
      }

      const exploreTemplatePath = path.join(absRoot, '.lore', 'harness', 'templates', 'lore-explore.md');
      if (fs.existsSync(exploreTemplatePath)) {
        const template = fs.readFileSync(exploreTemplatePath, 'utf8');
        const alias = platformTiers.fast || TIER_ALIASES.fast;
        const file = 'lore-explore.md';
        writeIfChanged(path.join(canonicalDir, file), template);
        writeIfChanged(path.join(platformAgentsDir, file), stampModel(template, alias));
        templateGenerated.add(file);
      }

      try {
        for (const file of fs.readdirSync(canonicalDir)) {
          if (!file.endsWith('.md') || templateGenerated.has(file)) continue;
          const src = fs.readFileSync(path.join(canonicalDir, file), 'utf8');
          const { attrs } = parseFrontmatter(src);
          const tier = attrs.tier || 'default';
          const alias = platformTiers[tier] || TIER_ALIASES[tier] || TIER_ALIASES.default;
          
          const stripped = stripField(src, 'tier');
          const platformAgent = stampModel(stripped, alias);
          writeIfChanged(path.join(platformAgentsDir, file), platformAgent);
        }
      } catch (_) {}
      
      console.log(`[Projector] Projected Agents -> ${platform.agentsDir}`);
    }
  }
}

project();
