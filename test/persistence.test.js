// The garden survives a server restart when a save file is configured.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createGarden, loadGarden, applyAction, tick, PLANTS } = require('../game');
const { createGardenServer } = require('../server');

test('loadGarden round-trips a played garden', () => {
  const garden = createGarden();
  applyAction(garden, { type: 'plant', plant: 'pumpkin', x: 3, y: 4, player: 'Ana' });
  applyAction(garden, { type: 'water', x: 3, y: 4, player: 'Ben' });
  tick(garden);
  garden.scores.Ana = 5;
  assert.deepStrictEqual(loadGarden(JSON.parse(JSON.stringify(garden))), garden);
});

test('loadGarden rejects data that is not a garden', () => {
  const good = JSON.parse(JSON.stringify(createGarden()));
  const broken = [
    null,
    'garden',
    { ...good, size: 0 },
    { ...good, tiles: good.tiles.slice(1) },
    { ...good, tiles: [{ type: 'cactus', growth: 0, water: 0, plantedBy: 'Ana' }, ...good.tiles.slice(1)] },
    { ...good, tiles: [{ type: 'carrot', growth: -1, water: 0, plantedBy: 'Ana' }, ...good.tiles.slice(1)] },
    { ...good, goal: { target: 20 } },
    { ...good, scores: { Ana: 'lots' } },
    { ...good, log: 'nope' },
  ];
  for (const data of broken) assert.strictEqual(loadGarden(data), null);
});

async function startServer(saveFile) {
  const server = createGardenServer({ saveFile });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function stopServer(server) {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

async function firstState(baseUrl) {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/events?name=Checker`, { signal: controller.signal });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (!buffer.includes('\n\n')) buffer += decoder.decode((await reader.read()).value, { stream: true });
  controller.abort();
  return JSON.parse(buffer.slice('data: '.length, buffer.indexOf('\n\n')));
}

test('the garden survives a server restart', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pocket-garden-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const saveFile = path.join(dir, 'garden.json');

  const first = await startServer(saveFile);
  const response = await fetch(`${first.baseUrl}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'plant', plant: 'sunflower', x: 5, y: 6, player: 'Ana' }),
  });
  assert.deepStrictEqual(await response.json(), { ok: true });
  await stopServer(first.server); // flushes the pending save

  const second = await startServer(saveFile);
  t.after(() => stopServer(second.server));
  const state = await firstState(second.baseUrl);
  const tile = state.tiles[6 * state.size + 5];
  assert.strictEqual(tile.type, 'sunflower');
  assert.strictEqual(tile.plantedBy, 'Ana');
  assert.ok(state.log.some((e) => e.player === 'Ana' && e.text === `planted a ${PLANTS.sunflower.name.toLowerCase()}`));
});

test('an unreadable save file starts a fresh garden', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pocket-garden-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const saveFile = path.join(dir, 'garden.json');
  fs.writeFileSync(saveFile, '{ not json');

  t.mock.method(console, 'warn', () => {});
  const { server, baseUrl } = await startServer(saveFile);
  t.after(() => stopServer(server));
  const state = await firstState(baseUrl);
  assert.ok(state.tiles.every((tile) => tile === null));
  assert.strictEqual(console.warn.mock.callCount(), 1);
});
