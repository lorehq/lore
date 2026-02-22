// Generates worker agent tier variants from template based on config.
// Called at session start (session-init hooks) and during sync (sync-platform-skills.sh).
// Idempotent — only writes when content changes, so git stays clean across sessions.

const fs = require('fs');
const path = require('path');
const { getConfig } = require('./config');
const { debug } = require('./debug');

function generate(rootDir) {
  const templatePath = path.join(rootDir, '.lore', 'templates', 'lore-worker.md');
  if (!fs.existsSync(templatePath)) {
    debug('generate-agents: no template at %s', templatePath);
    return;
  }

  const template = fs.readFileSync(templatePath, 'utf8');
  let claudeTiers = {};
  try {
    const cfg = getConfig(rootDir);
    claudeTiers = (cfg.subagentDefaults && cfg.subagentDefaults.claude) || {};
  } catch (_e) { /* no config or no defaults */ }

  const canonicalDir = path.join(rootDir, '.lore', 'agents');
  const claudeDir = path.join(rootDir, '.claude', 'agents');
  fs.mkdirSync(canonicalDir, { recursive: true });
  fs.mkdirSync(claudeDir, { recursive: true });

  // Default tier always present; fast/powerful only when configured
  const tiers = [
    { file: 'lore-worker.md', name: 'lore-worker', model: claudeTiers.default || null },
  ];
  if (claudeTiers.fast) {
    tiers.push({ file: 'lore-worker-fast.md', name: 'lore-worker-fast', model: claudeTiers.fast });
  }
  if (claudeTiers.powerful) {
    tiers.push({ file: 'lore-worker-powerful.md', name: 'lore-worker-powerful', model: claudeTiers.powerful });
  }

  const validFiles = new Set(tiers.map((t) => t.file));

  // Generate canonical (no model) and Claude (with model) variants
  for (const tier of tiers) {
    const canonical = template.replace(/^name:\s*.+$/m, 'name: ' + tier.name);
    writeIfChanged(path.join(canonicalDir, tier.file), canonical);

    const claude = stampModel(canonical, tier.model);
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
    } catch (_e) { /* dir doesn't exist */ }
  }
}

function stampModel(src, model) {
  if (!model) return src;
  const fmMatch = src.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return src;

  let fm = fmMatch[1].replace(/^model:.*\n?/m, '');
  const descIdx = fm.search(/^description:.*$/m);
  if (descIdx >= 0) {
    const eol = fm.indexOf('\n', descIdx);
    fm = fm.slice(0, eol + 1) + 'model: ' + model + '\n' + fm.slice(eol + 1);
  } else {
    fm += 'model: ' + model + '\n';
  }

  return src.replace(fmMatch[1], fm.replace(/\n+$/, ''));
}

function writeIfChanged(filePath, content) {
  try {
    const existing = fs.readFileSync(filePath, 'utf8');
    if (existing === content) return;
  } catch (_e) { /* file doesn't exist */ }
  fs.writeFileSync(filePath, content);
  debug('generate-agents: wrote %s', filePath);
}

module.exports = { generate };
