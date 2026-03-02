const http = require('http');

function pingActivity(filePath, directory) {
  if (!filePath) return;
  const { isKnowledgePath } = require('../lib/tracker');
  if (!isKnowledgePath(filePath, directory)) return;

  const { getConfig } = require('../lib/config');
  const cfg = getConfig(directory);
  if (!cfg.docker || !cfg.docker.search) return;

  const data = JSON.stringify({ path: filePath });
  const req = http.request({
    hostname: cfg.docker.search.address,
    port: cfg.docker.search.port,
    path: '/activity',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length,
    },
  }, () => {});
  req.on('error', () => {});
  req.write(data);
  req.end();
}
