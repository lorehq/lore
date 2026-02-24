// Generates all agent platform copies from canonical sources.
// Workers: generated from template with tier variants based on config.
// Non-workers: copied from .lore/agents/ with tier resolved to platform model.
// Called at session start (session-init hooks) and during sync (sync-platform-skills.sh).
// Idempotent — only writes when content changes, so git stays clean across sessions.

const fs = require('fs');
const path = require('path');
const { getConfig } = require('./config');
const { debug } = require('./debug');
const { parseFrontmatter } = require('./frontmatter');

// Tier name → Claude Code alias. Claude Code resolves aliases through
// ANTHROPIC_DEFAULT_*_MODEL env vars, so full deployment names (e.g.
// claude-opus-4-6) must NOT be used here — Claude Code ignores unrecognized values.
const TIER_ALIASES = { fast: 'haiku', default: 'sonnet', powerful: 'opus' };

function generate(rootDir) {
  let claudeTiers = {};
  try {
    const cfg = getConfig(rootDir);
    claudeTiers = (cfg.subagentDefaults && cfg.subagentDefaults.claude) || {};
  } catch (_e) {
    /* no config or no defaults */
  }

  const canonicalDir = path.join(rootDir, '.lore', 'agents');
  const claudeDir = path.join(rootDir, '.claude', 'agents');
  fs.mkdirSync(canonicalDir, { recursive: true });
  fs.mkdirSync(claudeDir, { recursive: true });

  // -- Worker tiers: generated from template --
  const templatePath = path.join(rootDir, '.lore', 'templates', 'lore-worker.md');
  if (fs.existsSync(templatePath)) {
    const template = fs.readFileSync(templatePath, 'utf8');

    // Default tier always present; fast/powerful only when configured.
    const tiers = [{ file: 'lore-worker.md', name: 'lore-worker', alias: TIER_ALIASES.default }];
    if (claudeTiers.fast) {
      tiers.push({ file: 'lore-worker-fast.md', name: 'lore-worker-fast', alias: TIER_ALIASES.fast });
    }
    if (claudeTiers.powerful) {
      tiers.push({ file: 'lore-worker-powerful.md', name: 'lore-worker-powerful', alias: TIER_ALIASES.powerful });
    }

    const validFiles = new Set(tiers.map((t) => t.file));

    // Generate canonical (no model) and Claude (with model alias) variants.
    // Canonical files omit the model field — they are platform-agnostic.
    // Claude platform files use the short alias so Claude Code resolves the correct deployment.
    for (const tier of tiers) {
      const canonical = template.replace(/^name:\s*.+$/m, 'name: ' + tier.name);
      writeIfChanged(path.join(canonicalDir, tier.file), canonical);

      const claude = stampModel(canonical, tier.alias);
      writeIfChanged(path.join(claudeDir, tier.file), claude);
    }

    // Cleanup stale lore-worker*.md files from both directories
    for (const dir of [canonicalDir, claudeDir]) {
      try {
        for (const f of fs.readdirSync(dir)) {
          if (f.startsWith('lore-worker') && f.endsWith('.md') && !validFiles.has(f)) {
            fs.unlinkSync(path.join(dir, f));
            debug('generate-agents: removed stale %s from %s', f, dir);
          }
        }
      } catch (_e) {
        /* dir doesn't exist */
      }
    }
  } else {
    debug('generate-agents: no worker template at %s', templatePath);
  }

  // -- Non-worker agents: copy from .lore/agents/ with tier → model stamping --
  try {
    for (const file of fs.readdirSync(canonicalDir)) {
      if (!file.endsWith('.md') || file.startsWith('lore-worker')) continue;
      const src = fs.readFileSync(path.join(canonicalDir, file), 'utf8');
      const { attrs } = parseFrontmatter(src);
      const tier = attrs.tier || 'default';
      const alias = TIER_ALIASES[tier] || TIER_ALIASES.default;

      // Strip tier: from the platform copy (Claude Code doesn't understand it),
      // then stamp the resolved model.
      const stripped = stripField(src, 'tier');
      const claude = stampModel(stripped, alias);
      writeIfChanged(path.join(claudeDir, file), claude);
    }
  } catch (_e) {
    /* canonicalDir doesn't exist */
  }
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

function writeIfChanged(filePath, content) {
  try {
    const existing = fs.readFileSync(filePath, 'utf8');
    if (existing === content) return;
  } catch (_e) {
    /* file doesn't exist */
  }
  fs.writeFileSync(filePath, content);
  debug('generate-agents: wrote %s', filePath);
}

module.exports = { generate, TIER_ALIASES };
