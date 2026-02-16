// Shared utility: parse agent domains from agent-registry.md
// Returns an array of unique domain names (e.g., ["Git", "Docker", "GitHub"])
// Used by session-init and prompt-preamble hooks to show delegation options.

const fs = require('fs');
const path = require('path');

function getAgentDomains() {
  try {
    const content = fs.readFileSync(path.join(__dirname, '..', '..', 'agent-registry.md'), 'utf8');
    const domains = new Set();

    for (const line of content.split(/\r?\n/)) {
      // Only parse table rows (start with |), skip separator rows (|---)
      if (!line.startsWith('|') || line.includes('|---')) continue;

      const parts = line.split('|').map(p => p.trim());
      const agent = (parts[1] || '').replace(/`/g, '').trim();
      const domain = (parts[2] || '').trim();

      // Skip header row and empty values
      if (!agent || agent.toLowerCase() === 'agent') continue;
      if (!domain || domain.toLowerCase() === 'domain') continue;

      domains.add(domain);
    }

    return Array.from(domains);
  } catch {
    return []; // No registry file or parse error — no agents yet
  }
}

module.exports = { getAgentDomains };
