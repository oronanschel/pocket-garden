// Tiny zero-dependency server: serves the client, holds the shared garden,
// and pushes every change to all browsers over Server-Sent Events.

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createGarden, applyAction, tick, publicState } = require('./game');

const PORT = Number(process.env.PORT) || 3000;
const TICK_MS = 1000;

const STATIC_FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/client.js': ['client.js', 'text/javascript; charset=utf-8'],
};

const garden = createGarden();
const clients = new Set(); // { res, name }

function onlinePlayers() {
  return [...new Set([...clients].map((c) => c.name))].sort();
}

function broadcast() {
  const data = `data: ${JSON.stringify(publicState(garden, onlinePlayers()))}\n\n`;
  for (const client of clients) client.res.write(data);
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function handleEvents(req, res, url) {
  const name = (url.searchParams.get('name') || '').trim().slice(0, 20) || 'Gardener';
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  const client = { res, name };
  clients.add(client);
  broadcast();
  req.on('close', () => {
    clients.delete(client);
    broadcast();
  });
}

function handleAction(req, res) {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 1024) req.destroy();
  });
  req.on('end', () => {
    let action;
    try {
      action = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { ok: false, error: 'Invalid JSON' });
    }
    const result = applyAction(garden, action);
    if (result.ok) broadcast();
    sendJson(res, result.ok ? 200 : 400, result);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/events') return handleEvents(req, res, url);
  if (req.method === 'POST' && url.pathname === '/action') return handleAction(req, res);
  const file = req.method === 'GET' && STATIC_FILES[url.pathname];
  if (!file) {
    res.writeHead(404);
    return res.end('Not found');
  }
  fs.readFile(path.join(__dirname, 'public', file[0]), (err, content) => {
    if (err) {
      res.writeHead(500);
      return res.end('Could not read file');
    }
    res.writeHead(200, { 'Content-Type': file[1] });
    res.end(content);
  });
});

setInterval(() => {
  if (tick(garden)) broadcast();
}, TICK_MS);

server.listen(PORT, () => {
  console.log(`Pocket Garden is running at http://localhost:${PORT}`);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs || []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        console.log(`Friends on your network can join at http://${addr.address}:${PORT}`);
      }
    }
  }
});
