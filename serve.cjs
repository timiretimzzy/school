const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = 8080;
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ts':'application/typescript','.png':'image/png','.svg':'image/svg+xml'};
const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {'Content-Type': MIME[ext] || 'application/octet-stream'});
    res.end(data);
  });
});
server.listen(PORT, () => console.log(`http://localhost:${PORT}`));