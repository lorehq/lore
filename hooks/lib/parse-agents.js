const fs = require('fs');
const path = require('path');

function getAgentDomains() {
  try {
    const content = fs.readFileSync(path.join(__dirname, '..', '..', 'agent-registry.md'), 'utf8');
    const domains = new Set();
    for (const line of content.split(/\r?\n/)) {
      if (!line.startsWith('|') || line.includes('|---')) continue;
      const parts = line.split('|').map(p => p.trim());
      const agent = (parts[1] || '').replace(/`/g, '').trim();
      const domain = (parts[2] || '').trim();
      if (!agent || agent.toLowerCase() === 'agent') continue;
      if (!domain || domain.toLowerCase() === 'domain') continue;
      domains.add(domain);
    }
    return Array.from(domains);
  } catch { return []; }
}

module.exports = { getAgentDomains };
