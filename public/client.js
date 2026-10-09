// Browser client: renders the shared garden pushed by the server and sends actions.

const joinForm = document.getElementById('join');
const nameInput = document.getElementById('name');
const game = document.getElementById('game');
const toolsEl = document.getElementById('tools');
const statusEl = document.getElementById('status');
const gridEl = document.getElementById('grid');

let playerName = '';
let selectedTool = null; // { type: 'plant', plant } | { type: 'water' } | { type: 'harvest' }
let plots = [];
let toolsBuilt = false;

try {
  nameInput.value = localStorage.getItem('pocket-garden-name') || '';
} catch {}

joinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  playerName = nameInput.value.trim();
  if (!playerName) return;
  try {
    localStorage.setItem('pocket-garden-name', playerName);
  } catch {}
  joinForm.hidden = true;
  game.hidden = false;
  connect();
});

function connect() {
  const events = new EventSource(`/events?name=${encodeURIComponent(playerName)}`);
  events.onmessage = (event) => render(JSON.parse(event.data));
  events.onerror = () => setStatus('Lost connection to the garden, retrying…', true);
  events.onopen = () => setStatus('Pick a tool, then click a garden plot.');
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
}

function buildTools(plants) {
  const tools = [
    ...Object.entries(plants).map(([key, plant]) => ({
      label: `${plant.stages[3]} Plant ${plant.name}`,
      tool: { type: 'plant', plant: key },
    })),
    { label: '💧 Water', tool: { type: 'water' } },
    { label: '🧺 Harvest', tool: { type: 'harvest' } },
  ];
  for (const { label, tool } of tools) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      selectedTool = tool;
      for (const b of toolsEl.children) b.setAttribute('aria-pressed', String(b === button));
    });
    toolsEl.appendChild(button);
  }
  toolsEl.children[0].click();
}

function buildGrid(size) {
  gridEl.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  gridEl.style.gridTemplateRows = `repeat(${size}, 1fr)`;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const plot = document.createElement('button');
      plot.type = 'button';
      plot.className = 'plot';
      plot.addEventListener('click', () => act(x, y));
      const label = document.createElement('span');
      const water = document.createElement('div');
      water.className = 'water';
      plot.append(label, water);
      gridEl.appendChild(plot);
      plots.push({ plot, label, water });
    }
  }
}

async function act(x, y) {
  if (!selectedTool) return;
  try {
    const response = await fetch('/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...selectedTool, x, y, player: playerName }),
    });
    const result = await response.json();
    setStatus(result.ok ? 'Pick a tool, then click a garden plot.' : result.error, !result.ok);
  } catch {
    setStatus('Could not reach the garden server.', true);
  }
}

function fillList(id, items) {
  const list = document.getElementById(id);
  list.replaceChildren(
    ...items.map((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      return li;
    }),
  );
}

function render(state) {
  if (!toolsBuilt) {
    buildTools(state.plants);
    buildGrid(state.size);
    toolsBuilt = true;
  }

  const stageNames = ['seed', 'sprout', 'growing', 'ready to harvest'];
  state.tiles.forEach((tile, i) => {
    const { plot, label, water } = plots[i];
    if (!tile) {
      label.textContent = '';
      water.style.width = '0';
      plot.className = 'plot';
      plot.title = 'Empty plot';
      return;
    }
    const plant = state.plants[tile.type];
    label.textContent = plant.stages[tile.stage];
    water.style.width = `${(tile.water / state.maxWater) * 100}%`;
    plot.className = 'plot' + (tile.water > 0 ? ' wet' : '') + (tile.stage === 3 ? ' ready' : '');
    const thirsty = tile.stage < 3 && tile.water === 0 ? ', needs water' : '';
    plot.title = `${plant.name}: ${stageNames[tile.stage]}${thirsty} (planted by ${tile.plantedBy})`;
  });

  const { goal } = state;
  document.getElementById('goal-text').textContent =
    `Harvest ${goal.target} points together: ${goal.progress} / ${goal.target}`;
  document.getElementById('goal-bar').style.width = `${Math.min(100, (goal.progress / goal.target) * 100)}%`;
  document.getElementById('goal-done').textContent =
    goal.completed > 0 ? `Goals completed: ${goal.completed} 🎉` : '';

  fillList('players', state.players.map((name) => (name === playerName ? `${name} (you)` : name)));
  const scores = Object.entries(state.scores).sort((a, b) => b[1] - a[1]);
  fillList('scores', scores.length ? scores.map(([name, points]) => `${name}: ${points}`) : ['No harvests yet']);
  fillList('log', state.log.length ? state.log.map((e) => `${e.player} ${e.text}`) : ['The garden is quiet…']);
}
