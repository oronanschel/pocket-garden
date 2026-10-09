const test = require('node:test');
const assert = require('node:assert');
const { PLANTS, MAX_WATER, createGarden, applyAction, tick, stageOf } = require('../game');

const at = (garden, x, y) => garden.tiles[y * garden.size + x];

test('plants grow through stages only while watered', () => {
  const garden = createGarden();
  assert.ok(applyAction(garden, { type: 'plant', plant: 'carrot', x: 0, y: 0, player: 'Ana' }).ok);
  tick(garden);
  assert.strictEqual(at(garden, 0, 0).growth, 0, 'dry plant does not grow');

  assert.ok(applyAction(garden, { type: 'water', x: 0, y: 0, player: 'Ben' }).ok);
  const stages = new Set();
  for (let i = 0; i < PLANTS.carrot.growTime; i++) {
    if (at(garden, 0, 0).water === 0) applyAction(garden, { type: 'water', x: 0, y: 0, player: 'Ben' });
    tick(garden);
    stages.add(stageOf(at(garden, 0, 0)));
  }
  assert.deepStrictEqual([...stages].sort(), [0, 1, 2, 3]);
  assert.strictEqual(tick(garden), false, 'mature plants stop growing');
});

test('watering is capped', () => {
  const garden = createGarden();
  applyAction(garden, { type: 'plant', plant: 'pumpkin', x: 1, y: 1, player: 'Ana' });
  applyAction(garden, { type: 'water', x: 1, y: 1, player: 'Ana' });
  applyAction(garden, { type: 'water', x: 1, y: 1, player: 'Ana' });
  assert.strictEqual(at(garden, 1, 1).water, MAX_WATER);
  assert.strictEqual(applyAction(garden, { type: 'water', x: 1, y: 1, player: 'Ana' }).ok, false);
});

test('harvesting a mature plant scores for the player and the shared goal', () => {
  const garden = createGarden();
  applyAction(garden, { type: 'plant', plant: 'sunflower', x: 2, y: 3, player: 'Ana' });
  assert.strictEqual(applyAction(garden, { type: 'harvest', x: 2, y: 3, player: 'Ben' }).ok, false);
  at(garden, 2, 3).growth = PLANTS.sunflower.growTime;
  assert.ok(applyAction(garden, { type: 'harvest', x: 2, y: 3, player: 'Ben' }).ok);
  assert.strictEqual(at(garden, 2, 3), null);
  assert.strictEqual(garden.scores.Ben, PLANTS.sunflower.value);
  assert.strictEqual(garden.goal.progress, PLANTS.sunflower.value);
});

test('reaching the target completes the goal and raises the next one', () => {
  const garden = createGarden();
  garden.goal.progress = garden.goal.target - 1;
  const target = garden.goal.target;
  applyAction(garden, { type: 'plant', plant: 'carrot', x: 0, y: 0, player: 'Ana' });
  at(garden, 0, 0).growth = PLANTS.carrot.growTime;
  applyAction(garden, { type: 'harvest', x: 0, y: 0, player: 'Ana' });
  assert.strictEqual(garden.goal.completed, 1);
  assert.strictEqual(garden.goal.progress, 0);
  assert.ok(garden.goal.target > target);
});

test('invalid actions are rejected', () => {
  const garden = createGarden();
  const bad = [
    { type: 'plant', plant: 'carrot', x: 99, y: 0, player: 'Ana' },
    { type: 'plant', plant: 'cactus', x: 0, y: 0, player: 'Ana' },
    { type: 'plant', plant: 'carrot', x: 0, y: 0, player: '' },
    { type: 'dance', x: 0, y: 0, player: 'Ana' },
    null,
  ];
  for (const action of bad) assert.strictEqual(applyAction(garden, action).ok, false);
  applyAction(garden, { type: 'plant', plant: 'carrot', x: 0, y: 0, player: 'Ana' });
  assert.strictEqual(applyAction(garden, { type: 'plant', plant: 'carrot', x: 0, y: 0, player: 'Ben' }).ok, false);
});
