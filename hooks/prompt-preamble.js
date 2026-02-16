// Hook: UserPromptSubmit
// Fires before every user message. One-line reminder to delegate and plan.

const { getAgentDomains } = require('./lib/parse-agents');

const agents = getAgentDomains();
const parts = [];
if (agents.length > 0) parts.push(`Delegate: ${agents.join(', ')}`);
parts.push('Multi-step? → use task list');

console.log(`[${parts.join(' | ')}]`);
