// Tiny zero-dependency server: serves the client, holds the shared garden,
// and pushes every change to all browsers over Server-Sent Events.

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createGarden, loadGarden, applyAction, tick, publicState } = require('./game');

const TICK_MS = 1000;
const SAVE_DELAY_MS = 1000;

const STATIC_FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/client.js': ['client.js', 'text/javascript; charset=utf-8'],
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readSavedGarden(saveFile) {
  let text;
  try {
    text = fs.readFileSync(saveFile, 'utf8');
  } catch {
    return null; // no save yet
  }
  try {
    const garden = loadGarden(JSON.parse(text));
    if (garden) return garden;
  } catch {}
  console.warn(`Ignoring unreadable garden save at ${saveFile}; starting a fresh garden.`);
  return null;
}

function writeSavedGarden(saveFile, garden) {
  fs.mkdirSync(path.dirname(saveFile), { recursive: true });
  const tmp = `${saveFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(garden));
  fs.renameSync(tmp, saveFile);
}

// Creates a server with its own garden. Call listen() on the result.
// With saveFile, the garden is loaded from and saved to that JSON file.
function createGardenServer({ saveFile } = {}) {
  const garden = (saveFile && readSavedGarden(saveFile)) || createGarden();
  const clients = new Set(); // { res, name }
  let saveTimer = null;

  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (saveFile) writeSavedGarden(saveFile, garden);
  }

  function onlinePlayers() {
    return [...new Set([...clients].map((c) => c.name))].sort();
  }

  // Sends the garden to everyone; changed=true also schedules a save.
  function broadcast(changed = false) {
    const data = `data: ${JSON.stringify(publicState(garden, onlinePlayers()))}\n\n`;
    for (const client of clients) client.res.write(data);
    if (changed && saveFile && !saveTimer) saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
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
      if (result.ok) broadcast(true);
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

  const timer = setInterval(() => {
    if (tick(garden)) broadcast(true);
  }, TICK_MS);
  server.on('close', () => {
    clearInterval(timer);
    if (saveTimer) saveNow();
  });
  server.saveNow = saveNow;

  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const saveFile = process.env.GARDEN_FILE || path.join(__dirname, 'data', 'garden.json');
  const server = createGardenServer({ saveFile });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      server.saveNow();
      process.exit(0);
    });
  }
  server.listen(port, () => {
    console.log(`Pocket Garden is running at http://localhost:${port}`);
    for (const addrs of Object.values(os.networkInterfaces())) {
      for (const addr of addrs || []) {
        if (addr.family === 'IPv4' && !addr.internal) {
          console.log(`Friends on your network can join at http://${addr.address}:${port}`);
        }
      }
    }
  });
}

module.exports = { createGardenServer };
