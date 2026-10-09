// Starts the real server and checks that two players see each other's changes.

const test = require('node:test');
const assert = require('node:assert');
const { createGardenServer } = require('../server');

// Connects a player over Server-Sent Events. waitFor(predicate) resolves with
// the first garden state (including ones already received) that matches.
async function joinGarden(baseUrl, name) {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/events?name=${encodeURIComponent(name)}`, {
    signal: controller.signal,
  });
  const states = [];
  const waiters = [];
  const decoder = new TextDecoder();
  let buffer = '';

  (async () => {
    try {
      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n\n')) !== -1) {
          const event = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (!event.startsWith('data: ')) continue;
          const state = JSON.parse(event.slice(6));
          states.push(state);
          for (const waiter of [...waiters]) {
            if (waiter.predicate(state)) {
              waiters.splice(waiters.indexOf(waiter), 1);
              waiter.resolve(state);
            }
          }
        }
      }
    } catch {
      // The stream is aborted when the player leaves.
    }
  })();

  return {
    waitFor(predicate, timeoutMs = 3000) {
      const seen = states.find(predicate);
      if (seen) return Promise.resolve(seen);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${name} timed out waiting for state`)), timeoutMs);
        waiters.push({ predicate, resolve: (state) => (clearTimeout(timer), resolve(state)) });
      });
    },
    leave: () => controller.abort(),
  };
}

async function act(baseUrl, action) {
  const response = await fetch(`${baseUrl}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
  });
  return response.json();
}

test('two players share one garden and see each other\'s changes', async (t) => {
  const server = createGardenServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });

  const ana = await joinGarden(baseUrl, 'Ana');
  const ben = await joinGarden(baseUrl, 'Ben');
  t.after(() => {
    ana.leave();
    ben.leave();
  });

  const bothOnline = (state) => state.players.includes('Ana') && state.players.includes('Ben');
  await ana.waitFor(bothOnline);
  await ben.waitFor(bothOnline);

  assert.deepStrictEqual(await act(baseUrl, { type: 'plant', plant: 'carrot', x: 2, y: 1, player: 'Ana' }), { ok: true });
  const planted = await ben.waitFor((state) => state.tiles[1 * state.size + 2]?.plantedBy === 'Ana');
  assert.strictEqual(planted.tiles[1 * planted.size + 2].type, 'carrot');

  assert.deepStrictEqual(await act(baseUrl, { type: 'water', x: 2, y: 1, player: 'Ben' }), { ok: true });
  const watered = await ana.waitFor((state) => state.log.some((e) => e.player === 'Ben' && e.text.startsWith('watered')));
  assert.ok(watered.tiles[1 * watered.size + 2].water > 0);

  // Growth ticks reach both players too.
  await ana.waitFor((state) => state.tiles[1 * state.size + 2]?.growth > 0);
  await ben.waitFor((state) => state.tiles[1 * state.size + 2]?.growth > 0);

  const rejected = await act(baseUrl, { type: 'harvest', x: 2, y: 1, player: 'Ben' });
  assert.deepStrictEqual(rejected, { ok: false, error: 'Not ready yet' });
});

test('the server serves the game page', async (t) => {
  const server = createGardenServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
  assert.strictEqual(response.status, 200);
  assert.match(await response.text(), /Pocket Garden/);
});
