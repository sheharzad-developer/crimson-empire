const fs = require('fs');
const path = require('path');
const { hasValidAccess } = require('./_lib/access-token');

const HTML_PATH = path.join(__dirname, '..', 'crimson-empire.html');

module.exports = (req, res) => {
  if (!hasValidAccess(req)) {
    res.statusCode = 302;
    res.setHeader('Location', '/paywall.html');
    res.end();
    return;
  }

  const html = fs.readFileSync(HTML_PATH, 'utf8');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(html);
};
