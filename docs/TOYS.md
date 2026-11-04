# How to build a toy

A toy is one folder in `src/toys/` with an `index.js` that exports an object.

## Adding a toy in 3 steps

1. Copy `src/toys/_template/` to `src/toys/<your-id>/`.
2. Change `id`, `name`, `description`, and write `host` and `client`.
3. Register it in `src/toys/registry.js`:

```js
import myToy from './my-toy/index.js'

export const toys = [
  myToy,
]
```

That's it. The lobby lists it automatically.

## The contract

```js
export default {
  id: 'gartic',            // unique, used in messages and URLs
  name: 'Gartic',          // shown in the lobby
  description: '...',      // one line, shown in the lobby
  minPlayers: 2,           // "Começar" is disabled below this
  maxPlayers: 6,           // never more than 6

  host(ctx)   { return { stop() {} } },  // optional
  client(ctx) { return { stop() {} } },  // required
}
```

### Two halves

| | `host(ctx)` | `client(ctx)` |
|---|---|---|
| Runs on | only the host's browser | every browser, **including the host's** |
| Job | owns the truth: state, rules, turns, score, physics | draws the screen, reads input |
| Talks to | all clients | only the host |

Why split it? The host is also a player. With two halves the host's own screen
works exactly like a friend's screen, and there is never an `if (isHost)` buried in
drawing code.

A toy with no rules (e.g. a shared canvas) can skip `host`. Then the platform
uses a default host that **forwards every client message to all clients**,
keeping the original sender as `fromId`. See `src/toys/cursors/` for an example.

### `host(ctx)`

| Field | What it does |
|---|---|
| `ctx.players` | Current players `[{ id, name, isHost }]` |
| `ctx.send(type, data)` | Send to **all** clients (host's own client included) |
| `ctx.sendTo(playerId, type, data)` | Send to **one** client |
| `ctx.on(type, (data, fromId) => {})` | Receive a message from a client |
| `ctx.onPlayersChange((players) => {})` | Someone joined or left |
| `ctx.end()` | Stop the toy and go back to the lobby |

### `client(ctx)`

| Field | What it does |
|---|---|
| `ctx.root` | A `<div>` that belongs to this toy. Put your DOM / canvas here |
| `ctx.me` | This player `{ id, name, isHost }` |
| `ctx.players` | Current players |
| `ctx.send(type, data)` | Send to the host |
| `ctx.on(type, (data, fromId) => {})` | Receive a message from the host. `fromId` is who originally sent it (the host, or the friend whose message the host forwarded) |
| `ctx.onPlayersChange((players) => {})` | Someone joined or left |

### `stop()`

Both halves return `{ stop() }`. The platform calls it when the toy ends.
Clean up there: `clearInterval`, `cancelAnimationFrame`, event listeners.
The platform empties `ctx.root` after `stop()`.

## Rules of thumb

- **Messages are plain JSON.** No classes, no functions, no `Map`.
- **Late joiners.** In `host`, use `onPlayersChange` to send the current state to
  newcomers (`ctx.sendTo(id, 'state', ...)`).
- **Real-time toys** (Worms, TowerFall): clients send *inputs* (`{ left: true }`),
  the host simulates and sends *state* ~20 times per second. Clients only draw.
- **Turn-based / event toys** (Gartic): send small *events* (`stroke`, `guess`),
  not the whole state every frame.
- **Keep message types short and lowercase**: `stroke`, `guess`, `state`, `input`.
