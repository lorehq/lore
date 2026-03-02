const http = require('http');
const { getLoreToken } = require('../../lib/security');

function pingActivity(filePath, directory) {
  if (!filePath) return;
  const { isKnowledgePath } = require('../lib/tracker');
  if (!isKnowledgePath(filePath, directory)) return;

  const { getConfig } = require('../lib/config');
  const cfg = getConfig(directory);
  if (!cfg.docker || !cfg.docker.search) return;

  const token = getLoreToken(directory);
  const data = JSON.stringify({ path: filePath });

  const req = http.request({
    hostname: cfg.docker.search.address,
    port: cfg.docker.search.port,
    path: '/activity',
    method: 'POST',
    timeout: 50, // Ultra-fast fail-open
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length,
      'Authorization': token ? `Bearer ${token}` : '',
    },
  }, (res) => {
    res.on('data', () => {}); // Consume stream
  });

  req.on('error', () => {}); // Silent fail-open
  req.on('timeout', () => { req.destroy(); });
  req.write(data);
  req.end();
}

module.exports = { pingActivity };
