// Generates all agent platform copies from canonical sources.
// Template-generated: workers (tier variants) and explore (single tier) from .lore/harness/templates/.
// Non-template: copied from .lore/agents/ with tier resolved to platform model.
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

// Tier-specific context injected after "# Worker Agent" in generated prompts.
// Language intensity scales inversely with model capability:
//   fast (Haiku) = hard guardrails, zero reasoning expected
//   default (Sonnet) = firm, reasoning expected, discovery capable
//   powerful (Opus) = soft, full latitude for complex work
const TIER_PREAMBLE = {
  fast: 'IMPORTANT: You are a zero-reasoning executor. Follow instructions literally. Do not interpret, infer, or explore beyond what was asked. Search the knowledge base first. If the answer is there, use it exactly. If something is unclear or missing, STOP and return to the orchestrator — do not guess. If you have not completed the task after 8 tool calls, STOP and return what you have.',
  default: 'You were selected because this task requires reasoning — discovery, interpretation, or judgment. Read error messages carefully and act on hints. When exploring APIs, check swagger/docs endpoints first, then follow error response hints. If stuck after 12 tool calls, stop and return what you have with a clear summary of what you tried.',
  powerful: 'You were selected for a task requiring careful reasoning. Take the latitude you need — explore adjacent context, consider edge cases, weigh trade-offs. If the task grows beyond the original brief, flag it and propose a path forward rather than stopping cold.',
};

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

  // Track all files produced by template generation so the non-worker loop skips them.
  const templateGenerated = new Set();

  // -- Worker tiers: generated from template --
  const workerTemplatePath = path.join(rootDir, '.lore', 'harness', 'templates', 'lore-worker.md');
  if (fs.existsSync(workerTemplatePath)) {
    const template = fs.readFileSync(workerTemplatePath, 'utf8');

    // Default tier always present; fast/powerful only when configured.
    const tiers = [{ file: 'lore-worker.md', name: 'lore-worker', alias: TIER_ALIASES.default, tier: 'default' }];
    if (claudeTiers.fast) {
      tiers.push({ file: 'lore-worker-fast.md', name: 'lore-worker-fast', alias: TIER_ALIASES.fast, tier: 'fast' });
    }
    if (claudeTiers.powerful) {
      tiers.push({ file: 'lore-worker-powerful.md', name: 'lore-worker-powerful', alias: TIER_ALIASES.powerful, tier: 'powerful' });
    }

    const validFiles = new Set(tiers.map((t) => t.file));

    // Generate canonical (no model) and Claude (with model alias) variants.
    // Canonical files omit the model field — they are platform-agnostic.
    // Claude platform files use the short alias so Claude Code resolves the correct deployment.
    for (const tier of tiers) {
      let canonical = template.replace(/^name:\s*.+$/m, 'name: ' + tier.name);
      const preamble = TIER_PREAMBLE[tier.tier] || '';
      if (preamble) {
        canonical = canonical.replace(/^# Worker Agent\n/m, `# Worker Agent\n\n${preamble}\n`);
      }
      writeIfChanged(path.join(canonicalDir, tier.file), canonical);

      const claude = stampModel(canonical, tier.alias);
      writeIfChanged(path.join(claudeDir, tier.file), claude);
      templateGenerated.add(tier.file);
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
    debug('generate-agents: no worker template at %s', workerTemplatePath);
  }

  // -- Explore agent: generated from template, single tier (fast or default fallback) --
  const exploreTemplatePath = path.join(rootDir, '.lore', 'harness', 'templates', 'lore-explore.md');
  if (fs.existsSync(exploreTemplatePath)) {
    const template = fs.readFileSync(exploreTemplatePath, 'utf8');
    const alias = claudeTiers.fast ? TIER_ALIASES.fast : TIER_ALIASES.default;
    const file = 'lore-explore.md';

    writeIfChanged(path.join(canonicalDir, file), template);
    writeIfChanged(path.join(claudeDir, file), stampModel(template, alias));
    templateGenerated.add(file);
  } else {
    debug('generate-agents: no explore template at %s', exploreTemplatePath);
  }

  // -- Non-template agents: copy from .lore/agents/ with tier → model stamping --
  try {
    for (const file of fs.readdirSync(canonicalDir)) {
      if (!file.endsWith('.md') || templateGenerated.has(file)) continue;
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
