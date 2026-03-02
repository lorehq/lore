#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { buildStaticBanner } = require('./banner');
const { stripFrontmatter, parseFrontmatter } = require('./frontmatter');
const { getConfig, getEnclavePath } = require('./config');
const { getLoreToken } = require('./security');

const baseManifest = require('./manifest.json');
const root = process.argv[2] || process.cwd();
const absRoot = path.resolve(root);
const enclavePath = getEnclavePath();
const loreToken = getLoreToken(absRoot);

const cfg = getConfig(absRoot);
const MANIFEST = { ...baseManifest, platforms: { ...baseManifest.platforms, ...(cfg.manifest || {}) } };
const TIER_ALIASES = { fast: 'haiku', default: 'sonnet', powerful: 'opus' };

function readOr(filePath, fallback = '') { try { return fs.readFileSync(filePath, 'utf8'); } catch (_) { return fallback; } }
function writeIfChanged(dest, content) { if (readOr(dest) === content) return; fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, content); }

function stampModel(src, model) {
  if (!model) return src;
  const fmMatch = src.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return src;
  let fm = fmMatch[1].replace(/^model:.*\n?/m, '');
  fm += `\nmodel: ${model}`;
  return src.replace(fmMatch[1], fm.replace(/\n+$/, ''));
}

async function project() {
  const instructions = readOr(path.join(absRoot, '.lore', 'instructions.md')).trim();
  const staticBanner = await buildStaticBanner(absRoot);
  
  const domainAssets = { rules: {}, primers: {} };
  const scanAssets = (dir, type) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
      const src = readOr(path.join(dir, f));
      const { attrs } = parseFrontmatter(src);
      const domain = attrs.domain || 'general';
      if (!domainAssets[type][domain]) domainAssets[type][domain] = [];
      domainAssets[type][domain].push(stripFrontmatter(src).trim());
    }
  };

  scanAssets(path.join(enclavePath, 'rules'), 'rules');
  scanAssets(path.join(absRoot, '.lore', 'rules'), 'rules');
  scanAssets(path.join(enclavePath, 'primers'), 'primers');
  scanAssets(path.join(absRoot, '.lore', 'primers'), 'primers');

  const allAgentFiles = new Set();
  const agentDirs = [path.join(enclavePath, 'agents'), path.join(absRoot, '.lore', 'agents')];
  for (const d of agentDirs) { try { if (fs.existsSync(d)) for (const f of fs.readdirSync(d).filter(f => f.endsWith('.md'))) allAgentFiles.add(f); } catch (_) {} }

  for (const [name, platform] of Object.entries(MANIFEST.platforms)) {
    const caps = platform.capabilities || [];
    if (caps.includes('mandates') && platform.mandateFile) {
      writeIfChanged(path.join(absRoot, platform.mandateFile), [instructions, staticBanner].join('\n\n') + '\n');
    }
    if (caps.includes('mdc') && platform.rulesDir) {
      const outDir = path.join(absRoot, platform.rulesDir);
      const writeMdc = (fn, desc, body) => writeIfChanged(path.join(outDir, fn), `---\ndescription: ${desc}\nalwaysApply: true\n---\n\n${body.trim()}\n`);
      writeMdc('lore-core.mdc', 'Lore harness instructions', instructions + '\n\n' + staticBanner);
    }
    if (caps.includes('hooks') && platform.hookFile) {
      const templatePath = path.join(absRoot, '.lore', 'harness', 'templates', `.${name}`, 'settings.json');
      if (fs.existsSync(templatePath)) {
        let content = fs.readFileSync(templatePath, 'utf8');
        if (loreToken) content = content.replace(/LORE_TOKEN_PLACEHOLDER/g, loreToken);
        writeIfChanged(path.join(absRoot, platform.hookFile), content);
      }
    }
    if (caps.includes('agents') && platform.agentsDir) {
      const platformSkillsDir = path.join(absRoot, platform.agentsDir.replace('agents', 'skills'));
      const skillDirs = [path.join(enclavePath, 'skills'), path.join(absRoot, '.lore', 'skills')];
      const platformTiers = (cfg.subagentDefaults && cfg.subagentDefaults[name]) || {};

      for (const sDir of skillDirs) {
        if (!fs.existsSync(sDir)) continue;
        for (const d of fs.readdirSync(sDir, { withFileTypes: true })) {
          if (!d.isDirectory()) continue;
          const manifest = path.join(sDir, d.name, 'SKILL.md');
          if (!fs.existsSync(manifest)) continue;

          const skillSrc = fs.readFileSync(manifest, 'utf8');
          const { attrs } = parseFrontmatter(skillSrc);
          const domain = attrs.domain || 'general';
          const tier = attrs.tier || 'default';
          const modelAlias = platformTiers[tier] || TIER_ALIASES[tier] || TIER_ALIASES.default;

          const rules = (domainAssets.rules[domain] || []).join('\n\n');
          const primers = (domainAssets.primers[domain] || []).join('\n\n');
          
          let finalBody = '';
          if (rules) finalBody += `## MANDATES & CONSTRAINTS\n${rules}\n\n`;
          if (primers) finalBody += `## COGNITIVE PRIMING\n${primers}\n\n`;
          finalBody += `## USAGE\n${stripFrontmatter(skillSrc).trim()}`;

          const target = path.join(platformSkillsDir, d.name, 'SKILL.md');
          writeIfChanged(target, stampModel(`---\nname: ${attrs.name || d.name}\ndescription: ${attrs.description || ''}\n---\n\n${finalBody}`, modelAlias));
        }
      }
    }
  }
}
project();
