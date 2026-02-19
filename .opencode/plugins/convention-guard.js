// Convention Guard Plugin
// Reinforce conventions at the point of write based on target file path.
// Fires on Write and Edit. Injects convention reminders via client.app.log.
//   - Security: always, for any write inside the repo
//   - Docs: all docs/ paths (including work/ and knowledge/)
//   - Work Items: docs/work/
//   - Knowledge Capture: docs/knowledge/
//
// Reads bold principle lines from the actual convention files so
// reminders stay in sync with the source of truth.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const path = require('path');
const fs = require('fs');
const { logHookEvent } = require('../../lib/hook-logger');

function extractPrinciples(hubDir, filename) {
  const convPath = path.join(hubDir, 'docs', 'context', 'conventions', filename);
  try {
    const content = fs.readFileSync(convPath, 'utf8');
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

export const ConventionGuard = async ({ directory, client }) => {
  const hub = process.env.LORE_HUB || directory;

  return {
    'tool.execute.before': async (input, output) => {
      const tool = (input?.tool || '').toLowerCase();
      if (tool !== 'write' && tool !== 'edit') return;

      const filePath = output?.args?.file_path || output?.args?.path || '';
      if (!filePath) return;

      const resolved = path.resolve(filePath);
      const repoPrefix = path.resolve(hub) + path.sep;
      if (!resolved.startsWith(repoPrefix)) return;

      const relative = resolved.slice(repoPrefix.length);
      const conventions = [];

      // Security: always
      const security = extractPrinciples(hub, 'security.md');
      if (security.length > 0) conventions.push('Security: ' + security.join(' | '));

      // Docs convention for all docs/ paths
      const isDocs = relative.startsWith('docs/') || relative.startsWith('docs\\');
      if (isDocs) {
        const docs = extractPrinciples(hub, 'docs.md');
        if (docs.length > 0) conventions.push('Docs: ' + docs.join(' | '));
      }

      // Domain-specific
      const isWork = relative.startsWith('docs/work/') || relative.startsWith('docs\\work\\');
      const isKnowledge = relative.startsWith('docs/knowledge/') || relative.startsWith('docs\\knowledge\\');
      if (isWork) {
        const workItems = extractPrinciples(hub, 'work-items.md');
        if (workItems.length > 0) conventions.push('Work items: ' + workItems.join(' | '));
      } else if (isKnowledge) {
        const knowledge = extractPrinciples(hub, 'knowledge-capture.md');
        if (knowledge.length > 0) conventions.push('Knowledge: ' + knowledge.join(' | '));
      }

      // Menu of conventions not already injected
      const injected = new Set(['index.md', 'security.md']);
      if (isDocs) injected.add('docs.md');
      if (isWork) injected.add('work-items.md');
      if (isKnowledge) injected.add('knowledge-capture.md');

      const convDir = path.join(hub, 'docs', 'context', 'conventions');
      try {
        const files = fs.readdirSync(convDir).filter((f) => f.endsWith('.md') && !injected.has(f));
        if (files.length > 0) {
          const names = files.map((f) => f.replace(/\.md$/, ''));
          conventions.push(
            'Other conventions: ' + names.join(', ') + ' — read docs/context/conventions/<name>.md if relevant',
          );
        }
      } catch {}

      if (conventions.length === 0) return;

      const msg = conventions.join('\n');
      await client.app.log({
        body: { service: 'convention-guard', level: 'info', message: msg },
      });
      logHookEvent({
        platform: 'opencode',
        hook: 'convention-guard',
        event: 'tool.execute.before',
        outputSize: msg.length,
        state: { path: relative },
        directory: hub,
      });
    },
  };
};
