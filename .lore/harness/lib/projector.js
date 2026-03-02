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

async function project() {
  const instructions = readOr(path.join(absRoot, '.lore', 'instructions.md')).trim();
  const staticBanner = await buildStaticBanner(absRoot);
  const getFragment = (name) => {
    const global = path.join(enclavePath, 'harness', 'fragments', name);
    const local = path.join(absRoot, '.lore', 'harness', 'fragments', name);
    return (readOr(global) || readOr(local)).trim();
  };
  const ambiguityGuard = getFragment('ambiguity-guard.md');
  const searchDiscipline = getFragment('search-discipline.md');
  const delegationGuidance = getFragment('delegation-guidance.md');
  const TIER_PREAMBLE = { fast: getFragment('agent-preamble-fast.md'), default: getFragment('agent-preamble-default.md'), powerful: getFragment('agent-preamble-powerful.md') };

  const canonicalDir = path.join(absRoot, '.lore', 'agents');
  fs.mkdirSync(canonicalDir, { recursive: true });
  const allAgentFiles = new Set();
  const agentDirs = [path.join(enclavePath, 'agents'), path.join(absRoot, '.lore', 'agents')];
  for (const d of agentDirs) { try { if (fs.existsSync(d)) for (const f of fs.readdirSync(d).filter(f => f.endsWith('.md'))) allAgentFiles.add(f); } catch (_) {} }

  for (const [name, platform] of Object.entries(MANIFEST.platforms)) {
    const caps = platform.capabilities || [];
    if (caps.includes('mandates') && platform.mandateFile) {
      writeIfChanged(path.join(absRoot, platform.mandateFile), [instructions, delegationGuidance, ambiguityGuard, searchDiscipline, staticBanner].join('\n\n') + '\n');
    }
    if (caps.includes('mdc') && platform.rulesDir) {
      const outDir = path.join(absRoot, platform.rulesDir);
      const writeMdc = (fn, desc, body) => writeIfChanged(path.join(outDir, fn), `---\ndescription: ${desc}\nalwaysApply: true\n---\n\n${body.trim()}\n`);
      writeMdc('lore-core.mdc', 'Lore harness instructions', instructions + '\n\n' + staticBanner);
      writeMdc('lore-ambiguity.mdc', 'Ambiguity guard', ambiguityGuard);
      writeMdc('lore-search-discipline.mdc', 'Search strategy enforcement', searchDiscipline);
    }
    if (caps.includes('hooks') && platform.hookFile) {
      const templatePath = path.join(absRoot, '.lore', 'harness', 'templates', `.${name}`, 'settings.json');
      if (fs.existsSync(templatePath)) {
        let content = fs.readFileSync(templatePath, 'utf8');
        if (loreToken) content = content.replace(/LORE_TOKEN_PLACEHOLDER/g, loreToken);
        writeIfChanged(path.join(absRoot, platform.hookFile), content);
      }
    }
  }
}

project();
