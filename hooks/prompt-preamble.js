// Hook: UserPromptSubmit
// Fires before every user message. One-line reminder to delegate and plan.

const path = require('path');
const { getAgentDomains } = require('./lib/parse-agents');
const { logHookEvent } = require('../lib/hook-logger');

const agents = getAgentDomains();
const parts = [];
if (agents.length > 0) parts.push(`Delegate: ${agents.join(', ')}`);
parts.push('Multi-step? → use task list; run independent subtasks in parallel via subagents');

const msg = `[${parts.join(' | ')}]`;
console.log(msg);
// Fires every user message — track frequency and size for context accumulation analysis
logHookEvent({ platform: 'claude', hook: 'prompt-preamble', event: 'UserPromptSubmit', outputSize: msg.length, directory: path.join(__dirname, '..') });
