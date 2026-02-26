// Rule Guard Plugin
// Reinforce rules at the point of write based on target file path.
// Fires on Write and Edit. Injects rule reminders via client.app.log.
//   - Security: always, for any write inside the repo
//   - Docs: all docs/ paths (including work/ and knowledge/)
//   - Work Items: docs/work/
//   - Knowledge Capture: docs/knowledge/
//
// Reads bold principle lines from the actual rule files so
// reminders stay in sync with the source of truth.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const path = require('path');
const fs = require('fs');
const { logHookEvent } = require('../../.lore/lib/hook-logger');
const { getProfile } = require('../../.lore/lib/config');

function extractPrinciples(hubDir, filename) {
  const rulePath = path.join(hubDir, 'docs', 'context', 'rules', filename);
  try {
    const content = fs.readFileSync(rulePath, 'utf8');
    const principles = [];
    for (const line of content.split('\n')) {
      const match = line.match(/^\*\*(.+?)\*\*$/);
      if (match) principles.push(match[1]);
    }
    return principles;
  } catch {
    return [];
  }
}

export const RuleGuard = async ({ directory, client }) => {
  const hub = process.env.LORE_HUB || directory;
  const profile = getProfile(hub);

  return {
    'tool.execute.before': async (input, output) => {
      const tool = (input?.tool || '').toLowerCase();
      if (tool !== 'write' && tool !== 'edit') return;
      if (profile === 'minimal') return;

      const filePath = output?.args?.file_path || output?.args?.path || '';
      if (!filePath) return;

      const resolved = path.resolve(filePath);
      const repoPrefix = path.resolve(hub) + path.sep;
      if (!resolved.startsWith(repoPrefix)) return;

      const relative = resolved.slice(repoPrefix.length);
      const rules = [];

      // Security: always — self-heal from seed if deleted
      let security = extractPrinciples(hub, 'security.md');
      if (security.length === 0) {
        const secTarget = path.join(hub, 'docs', 'context', 'rules', 'security.md');
        const seedPath = path.join(hub, '.lore', 'templates', 'seeds', 'rules', 'security.md');
        try {
          if (!fs.existsSync(secTarget) && fs.existsSync(seedPath)) {
            fs.mkdirSync(path.dirname(secTarget), { recursive: true });
            fs.writeFileSync(secTarget, fs.readFileSync(seedPath, 'utf8'));
            security = extractPrinciples(hub, 'security.md');
          }
        } catch {}
      }
      if (security.length > 0) {
        rules.push(
          'Security checkpoint — assess this write. Does it contain secrets, credentials, or sensitive values? Replace with references (env var names, vault paths) or escalate to the operator. When uncertain, ask before writing.',
        );
      }

      // Docs rule for all docs/ paths
      const isDocs = relative.startsWith('docs/') || relative.startsWith('docs\\');
      if (isDocs) {
        const docs = extractPrinciples(hub, 'docs.md');
        if (docs.length > 0) rules.push('Docs: ' + docs.join(' | '));
      }

      // Domain-specific
      const isWork = relative.startsWith('docs/work/') || relative.startsWith('docs\\work\\');
      const isKnowledge = relative.startsWith('docs/knowledge/') || relative.startsWith('docs\\knowledge\\');
      if (isWork) {
        const workItems = extractPrinciples(hub, 'work-items.md');
        if (workItems.length > 0) rules.push('Work items: ' + workItems.join(' | '));
      } else if (isKnowledge) {
        const knowledge = extractPrinciples(hub, 'knowledge-capture.md');
        if (knowledge.length > 0) rules.push('Knowledge: ' + knowledge.join(' | '));
      }

      // Menu of rules not already injected
      const injected = new Set(['index.md', 'security.md']);
      if (isDocs) injected.add('docs.md');
      if (isWork) injected.add('work-items.md');
      if (isKnowledge) injected.add('knowledge-capture.md');

      const _rulesDir = path.join(hub, 'docs', 'context', 'rules');
      try {
        const files = fs.readdirSync(_rulesDir).filter((f) => f.endsWith('.md') && !injected.has(f));
        if (files.length > 0) {
          const names = files.map((f) => f.replace(/\.md$/, ''));
          rules.push('Other rules: ' + names.join(', ') + ' — read docs/context/rules/<name>.md if relevant');
        }
      } catch {}

      if (rules.length === 0) return;

      const msg = rules.join('\n');
      await client.app.log({
        body: { service: 'rule-guard', level: 'info', message: msg },
      });
      logHookEvent({
        platform: 'opencode',
        hook: 'rule-guard',
        event: 'tool.execute.before',
        outputSize: msg.length,
        state: { path: relative },
        directory: hub,
      });
    },
  };
};
