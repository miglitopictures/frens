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
  icon: { colors, pixels },// pixel icon for the lobby carousel, see below

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
| `ctx.players` | Current players `[{ id, name, isHost, color }]` (`color` = player color slot 0..5) |
| `ctx.send(type, data)` | Send to **all** clients (host's own client included) |
| `ctx.sendTo(playerId, type, data)` | Send to **one** client |
| `ctx.on(type, (data, fromId) => {})` | Receive a message from a client |
| `ctx.onPlayersChange((players) => {})` | Someone joined or left |
| `ctx.end()` | Stop the toy and go back to the lobby |

### `client(ctx)`

| Field | What it does |
|---|---|
| `ctx.root` | A `<div>` that belongs to this toy. Put your DOM / canvas here |
| `ctx.me` | This player `{ id, name, isHost, color }` |
| `ctx.players` | Current players |
| `ctx.send(type, data)` | Send to the host |
| `ctx.on(type, (data, fromId) => {})` | Receive a message from the host. `fromId` is who originally sent it (the host, or the friend whose message the host forwarded) |
| `ctx.onPlayersChange((players) => {})` | Someone joined or left |

### `icon`

A small pixel-art picture (16 × 16, or 8 × 8) shown in the lobby carousel.
Colors must come from the FR-6 palette (`src/hw/palette.js`, docs/STYLEGUIDE.md).

```js
icon: {
  colors: { '.': 'paper', k: 'ink', a: 'amber' }, // character -> palette color name
  pixels: [
    '................',
    '..kk....aa......',
    // ... one string per row
  ],
},
```

A character that is not in `colors` is a transparent pixel.

### `stop()`

Both halves return `{ stop() }`. The platform calls it when the toy ends.
Clean up there: `clearInterval`, `cancelAnimationFrame`, event listeners.
The platform empties `ctx.root` after `stop()`.

## The hardware

Toys draw on the FR-6 hardware (art rules in docs/STYLEGUIDE.md). Import what you need:

```js
import { createScreen } from '../../hw/screen.js'
import { createInput } from '../../hw/input.js'
import { PALETTE, playerColorName } from '../../hw/palette.js'
```

### Screen: `createScreen(ctx.root)`

A 640 x 360 canvas, scaled up by a whole number. **Colors are palette names**
(`'coral'`, `'paper'`...). A name that is not in the palette throws an error.

| Function | What it does |
|---|---|
| `clear(color)` | Fill the whole screen |
| `pixel(x, y, color)` | One pixel |
| `rect(x, y, w, h, color)` | Filled rectangle |
| `frame(x, y, w, h, color)` | 1-pixel rectangle outline |
| `line(x0, y0, x1, y1, color, size = 1)` | Line; `size` > 1 = round brush |
| `circle(x, y, r, color)` | Filled circle |
| `dither(x, y, w, h, color)` | Checkerboard fill: the FR-6 "50% transparent" |
| `sprite(art, x, y, { scale, colors })` | Pixel art (same format as `icon`). `colors` overrides letters, e.g. `{ c: playerColorName(p.color) }` |
| `text(str, x, y, { color, scale, align })` | System font. `(x, y)` = top-left of the line box. `align`: left / center / right. `\n` = new line |
| `measureText(str, scale)` | Width in pixels |
| `wrapText(str, maxWidth, scale)` | Split into lines that fit |
| `drawLayer(layer, x, y)` | Paint a layer (see below) |
| `toScreen(pointerEvent)` | Mouse / touch position in screen pixels `{ x, y }` |
| `width`, `height`, `lineHeight` | 640, 360, 12 |
| `canvas` | The `<canvas>`, for pointer events |
| `context` | The raw 2D context, for special cases. Colors still come from `PALETTE` |
| `destroy()` | Call it in `stop()` |

Coordinates are whole pixels (numbers are rounded down). Draw every frame
with `requestAnimationFrame`, or only when something changes. Both are fine.

**Dither paints only half the pixels.** Always paint a solid color under a dithered
area, or old frames will show through it.

### Layers: `createLayer(width, height)`

An offscreen image with the same drawing functions as the screen. Use it for
things you paint once and show every frame: a drawing board, a map, a background.

```js
import { createLayer } from '../../hw/screen.js'
const board = createLayer(400, 300)
board.clear('paper')
board.line(10, 10, 90, 40, 'black', 3)
screen.drawLayer(board, 8, 34) // every frame
```

### Typing text

The FR-6 has no text boxes on screen. To type (chat, guesses), add a hidden
`<input class="hw-keyboard">` to `ctx.root`, focus it, and draw its `value` on the
screen with `screen.text`. It also opens the keyboard on phones.
See `src/toys/gartic/client.js` (`field`, `drawTypedText`).

### Clickable things

Draw a button, then remember its rectangle; on `pointerdown`, check which
rectangle was hit. Gartic rebuilds the list every frame (`clickable(...)`).

### Buttons: `createInput()`

| Button | Keys |
|---|---|
| `up` `down` `left` `right` | arrows or W A S D |
| `a` | Z or Space |
| `b` | X |
| `start` | Enter |

```js
const input = createInput()
input.held.left                      // true while held
input.onPress((button) => {})        // once, when it goes down
input.onRelease((button) => {})      // once, when it goes up
input.destroy()                      // in stop()
```

While a text field has focus, keys go to the field. The stylus is just pointer
events on `screen.canvas` + `screen.toScreen(event)`.

### Player colors

`player.color` is a slot 0..5. `playerColorName(player.color)` gives the palette
name to draw with. Use player colors only to show "which player".

See `src/toys/cursors/` for a small toy that uses all of this.

## Rules of thumb

- **Messages are plain JSON.** No classes, no functions, no `Map`.
- **Late joiners.** In `host`, use `onPlayersChange` to send the current state to
  newcomers (`ctx.sendTo(id, 'state', ...)`).
- **Real-time toys** (Worms, TowerFall): clients send *inputs* (`{ left: true }`),
  the host simulates and sends *state* ~20 times per second. Clients only draw.
- **Turn-based / event toys** (Gartic): send small *events* (`stroke`, `guess`),
  not the whole state every frame.
- **Keep message types short and lowercase**: `stroke`, `guess`, `state`, `input`.
