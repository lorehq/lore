// Context Path Guide Plugin
// Shows ASCII tree of docs/context/ or docs/knowledge/ before writes.
// Thin ESM adapter — reuses buildTree/getConfig from lib/banner.js.
//
// Non-blocking — logs guidance but never throws.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const path = require('path');
const fs = require('fs');
const { buildTree, getConfig } = require('../../lib/banner');
const { logHookEvent } = require('../../lib/hook-logger');

export const ContextPathGuide = async ({ directory, client }) => {
  const hub = process.env.LORE_HUB || directory;
  const cfg = getConfig(hub);
  const treeDepth = cfg.treeDepth ?? 5;

  return {
    'tool.execute.before': async (input, output) => {
      const tool = (input?.tool || '').toLowerCase();
      if (tool !== 'write' && tool !== 'edit') return;

      const filePath = output?.args?.file_path || output?.args?.path || '';
      const resolved = path.resolve(filePath);
      const knowledgePrefix = path.resolve(hub, 'docs', 'knowledge') + path.sep;
      const contextPrefix = path.resolve(hub, 'docs', 'context') + path.sep;
      const isKnowledge = resolved.startsWith(knowledgePrefix);
      const isContext = resolved.startsWith(contextPrefix);
      if (!isKnowledge && !isContext) {
        // Non-docs write — log to measure how often this hook fires vs matches
        logHookEvent({ platform: 'opencode', hook: 'context-path-guide', event: 'tool.execute.before', outputSize: 0, state: { matched: false }, directory: hub });
        return;
      }

      const targetDir = isKnowledge ? path.join(hub, 'docs', 'knowledge') : path.join(hub, 'docs', 'context');
      const treeLabel = isKnowledge ? 'docs/knowledge/' : 'docs/context/';
      const treeLines = fs.existsSync(targetDir)
        ? buildTree(targetDir, '', { maxDepth: treeDepth, skipDirs: new Set(), dirsOnly: false })
        : [];
      const structure = treeLines.length > 0 ? treeLines.join('\n') + '\n' : '';

      let msg = 'Knowledge path guide:\n';
      msg += `${treeLabel}\n${structure || '(empty)\n'}`;
      msg += isKnowledge
        ? 'Organize under environment/ subdirs (inventory/, decisions/, reference/, diagrams/)'
        : 'Context holds rules and conventions — environment data goes in docs/knowledge/';

      await client.app.log({
        body: { service: 'context-path-guide', level: 'info', message: msg },
      });
      // Matched docs/ write — output includes full directory tree, so size matters
      logHookEvent({ platform: 'opencode', hook: 'context-path-guide', event: 'tool.execute.before', outputSize: msg.length, state: { matched: true }, directory: hub });
    },
  };
};
