# Frens — Style Guide

Frens is a **fantasy handheld console**. Think Nintendo DSi menu, in night mode.

The look has two layers, and they never mix:

| Layer | What it is | Feels like |
|---|---|---|
| **Console** | the platform: home, lobby, status bar, menus | smooth, rounded, soft, dark |
| **Hardware** | the limits every toy is drawn inside | pixel art, fixed palette, bitmap font |

The console is the "operating system". The toys are "cartridges" made for the same
machine. Each toy can have its own art direction, but it must respect the hardware,
which is what makes them all look like they belong to the same console.

---

## The console: FR-6

- Name: **Frens**. Model: **FR-6** (six players, one machine).
- On first load the console plays a short **boot**: the FR-6 logo builds itself
  out of pixels in the 6 player colors, with a short chime. Max ~1.5 s, any key or
  click skips it, it plays once per browser session.

---

## 1. Console (the platform)

### Mood

- Dark charcoal background with a faint square grid (the DSi "graph paper", at night).
- Rounded panels sitting on top of the grid. No hard borders, no drop shadows.
- Lots of air. Few elements per screen.
- Big, friendly, rounded type.

### Your color is your accent

Every player has one of the 6 **player colors** (see Hardware). On your screen,
the console's accent color **is your player color**: buttons, focus rings,
selection outlines, the cursor. Two friends in the same room see the same
lobby in different colors.

### Tokens

All console values live in `src/tokens.css` as CSS variables. Never write a raw
hex value in console CSS; use a variable.

**Surfaces**

| Variable | Value | Use |
|---|---|---|
| `--bg` | `#121419` | page background |
| `--grid` | `#1a1d24` | grid lines on the background |
| `--panel` | `#1e222a` | cards, bars, inputs |
| `--panel-2` | `#282d37` | hover, raised panel, secondary button |
| `--line` | `#333946` | the rare divider, empty slots |

**Text**

| Variable | Value | Use |
|---|---|---|
| `--text` | `#e9ebf1` | main text |
| `--text-2` | `#9aa0ae` | secondary text, descriptions |
| `--text-3` | `#646b7a` | hints, disabled |

**Accent and status**

| Variable | Value | Use |
|---|---|---|
| `--accent` | your player color | primary button, focus, selection |
| `--on-accent` | `#0b0c10` | text on top of `--accent` |
| `--error` | `#ff8a80` | error text (always with a `⚠`, never color alone) |

**Type**

- Font: **Nunito** (rounded sans). Two weights only: 500 (regular) and 800 (bold).
- Sizes: `--fs-s` 13px · `--fs-m` 15px · `--fs-l` 18px · `--fs-xl` 24px · `--fs-xxl` 32px.
- Sentence case. Short words. UI text in Portuguese.

**Shape and space**

- Radius: `--r-s` 8px (small controls) · `--r-m` 14px (panels) · `--r-l` 22px (big cards, toy icons) · `--r-pill` 999px (buttons, chips).
- Spacing steps: 4 · 8 · 12 · 16 · 24 · 32 px (`--s-1` … `--s-6`).

**Motion**

- Quick and springy, like the DSi menu sliding.
- `--t-fast` 120ms (hover, press) · `--t-base` 220ms (move, open).
- `--ease-spring`: `cubic-bezier(.34, 1.56, .64, 1)`: a small overshoot, for things that move or grow.
- `--ease-out`: `cubic-bezier(.2, .8, .2, 1)`: for fades.
- Press = scale down to 0.96. Selected toy = scale up and the accent outline appears.

### Components

- **Status bar** (top, always visible in a room): room code · 6 player slots
  (filled dots in player colors, empty ring for a free slot) · copy link (host) · clock · leave.
- **Player cards** (lobby): one card per color slot, in slot order. Empty slots are
  dashed and say "livre".
- **Toy carousel** (lobby): toys in a horizontal row, like cartridges. The selected
  one is bigger, has the accent outline, and its **banner** shows above
  (icon, name, description, player count). Arrows / click to move, Ⓐ to start.
- **Buttons**: pill shaped. Primary = `--accent` fill. Secondary = `--panel-2`.
  Max one primary per screen. Primary buttons may show their key glyph: `Ⓐ Começar`.
- **Inputs**: `--panel` fill, no border, accent focus ring.
- **Screen bezel**: when a toy is running, its screen sits inside a `--panel`
  frame with `--r-l` corners. The console UI stays outside the bezel.

### Icons and symbols

Monochrome only. Use text glyphs (`✓ ⚠ ✗ → ▶ Ⓐ Ⓑ`) or pixel icons. No colored emoji.

---

## 2. Hardware (the limits every toy shares)

These are the rules of the machine. A toy that breaks them is a bug.

### Screen

- **640 × 360** logical pixels. Every toy draws at this size.
- Drawn on a canvas, then scaled up by a **whole number** (×1, ×2, ×3…) with sharp
  pixels (`image-rendering: pixelated`). On screens narrower than 640px it
  scales down to fit (the only time the scale is not a whole number).
- No anti-aliasing inside toys: no blurry lines, no smooth gradients.
  Shapes are drawn on the pixel grid.
- 60 frames per second.

### Palette (strict)

The FR-6 has **32 colors**. Toys may use **only** these. A toy picks the ones it
needs (a good toy uses 16 or fewer). No transparency except fully on or off;
fake it with dithering.

The palette lives in `src/hw/palette.js`. Toys refer to colors by name.

| # | Name | Hex | | # | Name | Hex |
|---|---|---|---|---|---|---|
| 0 | `black` | `#0b0c10` | | 16 | `forest` | `#1f3d2c` |
| 1 | `ink` | `#262833` | | 17 | `green` | `#3f7d4a` |
| 2 | `slate` | `#4a4e5e` | | 18 | `mint` ★ | `#4fd6a0` |
| 3 | `gray` | `#7d8296` | | 19 | `lime` | `#b8f0a8` |
| 4 | `silver` | `#b9bdcb` | | 20 | `deepteal` | `#134a4f` |
| 5 | `paper` | `#f4f1e8` | | 21 | `teal` | `#2a9d8f` |
| 6 | `wine` | `#5c1f2e` | | 22 | `navy` | `#172440` |
| 7 | `red` | `#c23b3b` | | 23 | `blue` | `#2856a8` |
| 8 | `coral` ★ | `#ff6b57` | | 24 | `sky` ★ | `#4fb3ff` |
| 9 | `peach` | `#ffb3a0` | | 25 | `ice` | `#b8e4ff` |
| 10 | `bark` | `#4a2c22` | | 26 | `night` | `#2e2048` |
| 11 | `brown` | `#8a5233` | | 27 | `purple` | `#6a4fc2` |
| 12 | `orange` | `#d98a4a` | | 28 | `violet` ★ | `#a78bfa` |
| 13 | `sand` | `#ffd3a1` | | 29 | `plum` | `#8a2b6b` |
| 14 | `amber` ★ | `#ffc23d` | | 30 | `pink` ★ | `#ff7eb6` |
| 15 | `cream` | `#fff1a8` | | 31 | `blush` | `#ffc4dc` |

★ = player color.

### Player colors

Six colors, fixed for the whole system, in join order:

1. `coral` · 2. `sky` · 3. `amber` · 4. `mint` · 5. `violet` · 6. `pink`

If you are `sky` in the lobby, you are `sky` in every toy: your worms, your
cursor, your name in the chat. Toys must use these for "who is who" and should
avoid using them for anything else.

### System font

- One built-in **bitmap font**, 5 × 7 pixels per glyph (8 px line height).
- Covers ASCII plus Portuguese accents (á à â ã é ê í ó ô õ ú ç).
- Drawn at scale ×1, ×2 or ×3 only. Toys do not load other fonts.

### Controls

Every toy uses the same buttons, so players never relearn the basics.

| Button | Keyboard | Typical use |
|---|---|---|
| D-pad | Arrows (or WASD) | move, aim, navigate |
| Ⓐ | Z or Space | confirm, jump, fire |
| Ⓑ | X | back, cancel, secondary action |
| Start | Enter | pause / menu |
| Stylus | mouse / touch | draw, point, click |

Text typing (chat, guesses) is the one exception: a text field takes the keyboard
while it has focus.

### Sound (later)

A few chiptune channels (square, triangle, noise). Defined when we get there.

---

## Checklist for a new toy

- [ ] Draws at 640 × 360 on the hardware screen.
- [ ] Uses only palette colors, by name. Ideally 16 or fewer.
- [ ] Player colors only mean "which player".
- [ ] Text uses the system font.
- [ ] Controls follow the table above.
- [ ] Has a 16 × 16 (or 8 × 8) pixel icon for the carousel (see docs/TOYS.md).
