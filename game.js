// Pure garden rules. The server owns one garden and applies actions and ticks to it.

const PLANTS = {
  carrot: { name: 'Carrot', growTime: 6, value: 1, stages: ['🌰', '🌱', '🌿', '🥕'] },
  sunflower: { name: 'Sunflower', growTime: 10, value: 2, stages: ['🌰', '🌱', '🌿', '🌻'] },
  pumpkin: { name: 'Pumpkin', growTime: 16, value: 3, stages: ['🌰', '🌱', '🌿', '🎃'] },
};

const GRID_SIZE = 8;
const WATER_PER_CAN = 5; // ticks of growth one watering provides
const MAX_WATER = 8;
const FIRST_GOAL = 20; // points the gardeners must harvest together
const GOAL_STEP = 10; // each completed goal raises the next target by this much
const LOG_LENGTH = 8;

function createGarden(size = GRID_SIZE) {
  return {
    size,
    tiles: Array.from({ length: size * size }, () => null),
    goal: { target: FIRST_GOAL, progress: 0, completed: 0 },
    scores: {},
    log: [],
  };
}

const isCount = (n) => Number.isInteger(n) && n >= 0;

function isValidTile(tile) {
  return (
    tile === null ||
    (typeof tile === 'object' &&
      Object.hasOwn(PLANTS, tile.type) &&
      isCount(tile.growth) &&
      isCount(tile.water) &&
      tile.water <= MAX_WATER &&
      typeof tile.plantedBy === 'string')
  );
}

// Rebuilds a garden from saved JSON data, or returns null if it doesn't look like one.
function loadGarden(data) {
  if (!data || typeof data !== 'object') return null;
  const { size, tiles, goal, scores, log } = data;
  if (!Number.isInteger(size) || size < 1 || !Array.isArray(tiles) || tiles.length !== size * size) return null;
  if (!tiles.every(isValidTile)) return null;
  if (!goal || !isCount(goal.target) || !isCount(goal.progress) || !isCount(goal.completed)) return null;
  if (!scores || typeof scores !== 'object' || !Object.values(scores).every(isCount)) return null;
  if (!Array.isArray(log)) return null;
  return {
    size,
    tiles: tiles.map((tile) => tile && { type: tile.type, growth: tile.growth, water: tile.water, plantedBy: tile.plantedBy }),
    goal: { target: goal.target, progress: goal.progress, completed: goal.completed },
    scores: { ...scores },
    log: log.slice(0, LOG_LENGTH),
  };
}

function stageOf(tile) {
  const plant = PLANTS[tile.type];
  if (tile.growth >= plant.growTime) return 3;
  return Math.floor((tile.growth / plant.growTime) * 3);
}

function isMature(tile) {
  return stageOf(tile) === 3;
}

function addLog(garden, player, text) {
  garden.log.unshift({ player, text, at: Date.now() });
  garden.log.length = Math.min(garden.log.length, LOG_LENGTH);
}

// Returns { ok: true } or { ok: false, error }.
function applyAction(garden, action) {
  if (!action || typeof action !== 'object') return { ok: false, error: 'Invalid action' };
  const player = typeof action.player === 'string' ? action.player.trim() : '';
  if (!player || player.length > 20) return { ok: false, error: 'Name must be 1-20 characters' };
  const { x, y } = action;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= garden.size || y >= garden.size) {
    return { ok: false, error: 'That spot is outside the garden' };
  }
  const index = y * garden.size + x;
  const tile = garden.tiles[index];

  switch (action.type) {
    case 'plant': {
      if (!Object.hasOwn(PLANTS, action.plant)) return { ok: false, error: 'Unknown plant' };
      const plant = PLANTS[action.plant];
      if (tile) return { ok: false, error: 'Something is already growing there' };
      garden.tiles[index] = { type: action.plant, growth: 0, water: 0, plantedBy: player };
      addLog(garden, player, `planted a ${plant.name.toLowerCase()}`);
      return { ok: true };
    }
    case 'water': {
      if (!tile) return { ok: false, error: 'Plant something first' };
      if (isMature(tile)) return { ok: false, error: 'This plant is ready to harvest' };
      if (tile.water >= MAX_WATER) return { ok: false, error: 'Already fully watered' };
      tile.water = Math.min(MAX_WATER, tile.water + WATER_PER_CAN);
      addLog(garden, player, `watered a ${PLANTS[tile.type].name.toLowerCase()}`);
      return { ok: true };
    }
    case 'harvest': {
      if (!tile) return { ok: false, error: 'Nothing to harvest there' };
      if (!isMature(tile)) return { ok: false, error: 'Not ready yet' };
      const plant = PLANTS[tile.type];
      garden.tiles[index] = null;
      garden.scores[player] = (garden.scores[player] || 0) + plant.value;
      garden.goal.progress += plant.value;
      addLog(garden, player, `harvested a ${plant.name.toLowerCase()} (+${plant.value})`);
      if (garden.goal.progress >= garden.goal.target) {
        garden.goal.completed += 1;
        garden.goal.progress = 0;
        garden.goal.target += GOAL_STEP;
        addLog(garden, player, `completed shared goal #${garden.goal.completed}!`);
      }
      return { ok: true };
    }
    default:
      return { ok: false, error: 'Unknown action' };
  }
}

// Advances growth by one tick. Plants grow only while they have water.
// Returns true if anything changed.
function tick(garden) {
  let changed = false;
  for (const tile of garden.tiles) {
    if (tile && tile.water > 0 && !isMature(tile)) {
      tile.growth += 1;
      tile.water -= 1;
      changed = true;
    }
  }
  return changed;
}

function publicState(garden, players) {
  return {
    size: garden.size,
    maxWater: MAX_WATER,
    plants: PLANTS,
    tiles: garden.tiles.map((tile) => tile && { ...tile, stage: stageOf(tile) }),
    goal: garden.goal,
    scores: garden.scores,
    log: garden.log,
    players,
  };
}

module.exports = { PLANTS, MAX_WATER, WATER_PER_CAN, createGarden, loadGarden, applyAction, tick, stageOf, publicState };
