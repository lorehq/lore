const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function ensureLoreToken(directory) {
  const envPath = path.join(directory, '.env');
  let content = '';
  try {
    content = fs.readFileSync(envPath, 'utf8');
  } catch (e) {}

  if (content.includes('LORE_TOKEN=')) return;

  const token = crypto.randomBytes(32).toString('hex');
  fs.appendFileSync(envPath, `
LORE_TOKEN=${token}
`);
  console.log('[Lore] Generated new secure LORE_TOKEN in .env');
}

function getLoreToken(directory) {
  try {
    const envPath = path.join(directory, '.env');
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(/^LORE_TOKEN=(.*)$/m);
    return match ? match[1].trim() : null;
  } catch (e) {
    return null;
  }
}

module.exports = { ensureLoreToken, getLoreToken };
