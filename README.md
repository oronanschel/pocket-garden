# Pocket Garden

A small cooperative garden game that runs in the browser. Everyone connected to the same server tends one shared garden: plant seeds, water them so they grow, and harvest them together to reach a shared goal.

Built by Karma42 agents.

## Run it

You need [Node.js](https://nodejs.org/) 18 or newer. There are no dependencies to install.

```bash
npm start
```

Then open <http://localhost:3000> in a modern browser.

To play together, the server prints a network address such as `http://192.168.1.20:3000` on startup. Anyone on the same network can open that address to join the same garden. You can also open the game in two browser windows on one computer. Use `PORT=4000 npm start` to pick a different port.

## How to play

1. Enter a gardener name and join the garden.
2. Pick a tool from the toolbar, then click a plot:
   - **Plant** a carrot, sunflower or pumpkin on an empty plot.
   - **Water** a plant. Plants only grow while they have water; the blue bar at the bottom of a plot shows how much is left, and wet soil looks darker.
   - **Harvest** a plant once it is fully grown (it glows yellow).
3. Each plant grows through four stages: seed 🌰 → sprout 🌱 → growing 🌿 → ready (🥕 / 🌻 / 🎃).

| Plant     | Watered growth time | Harvest points |
| --------- | ------------------- | -------------- |
| Carrot    | 6 s                 | 1              |
| Sunflower | 10 s                | 2              |
| Pumpkin   | 16 s                | 3              |

One watering lasts 5 seconds of growth, so bigger plants need several waterings. Teaming up helps.

**Shared goal:** harvest 20 points together. Each completed goal raises the next target by 10. The sidebar shows who is online, everyone's harvest points and recent activity.

The garden lives in the server's memory, so restarting the server starts a fresh garden.

## Develop

```bash
npm test
```

- `game.js`: garden rules (planting, watering, growth, harvesting, shared goal)
- `server.js`: zero-dependency HTTP server that serves the client, accepts actions at `POST /action` and pushes the garden state to every browser over Server-Sent Events at `GET /events`
- `public/`: the browser client (HTML, CSS, JavaScript; no build step)
- `test/`: tests for the game rules (`node --test`)
