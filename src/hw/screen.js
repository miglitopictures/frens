// The FR-6 screen: 640 x 360 pixels, scaled up by a whole number with sharp pixels.
//
// Every drawing function takes palette color NAMES ('coral', 'paper'...), never hex.
// Using a name that is not in the palette throws an error: that's the strict palette.
//
//   const screen = createScreen(ctx.root)
//   screen.clear('night')
//   screen.rect(10, 10, 50, 20, 'coral')
//   screen.text('Olá!', 10, 40, { color: 'paper', scale: 2 })
//   screen.destroy()   // in stop()
//
// A "layer" is an offscreen image with the same drawing functions, for things
// you paint once and show many times (a drawing board, a map):
//
//   const board = createLayer(400, 300)
//   board.line(0, 0, 50, 50, 'black', 3)
//   screen.drawLayer(board, 8, 30)
//
// Coordinates are whole pixels; numbers are rounded down.
// Full list of functions: docs/TOYS.md, section "The hardware".

import { PALETTE } from './palette.js'
import { LINE_HEIGHT, layoutText, measureText, wrapText } from './font.js'

export const SCREEN_W = 640
export const SCREEN_H = 360

export function hex(name) {
  const color = PALETTE[name]
  if (!color) throw new Error(`"${name}" is not an FR-6 palette color`)
  return color
}

// --- the drawing functions, shared by the screen and by layers ---

function createPainter(g, width, height) {
  g.imageSmoothingEnabled = false
  const f = Math.floor

  // dither patterns (checkerboard), one per color, made on first use
  const patterns = {}
  function ditherPattern(name) {
    if (!patterns[name]) {
      const tile = document.createElement('canvas')
      tile.width = 2
      tile.height = 2
      const t = tile.getContext('2d')
      t.fillStyle = hex(name)
      t.fillRect(0, 0, 1, 1)
      t.fillRect(1, 1, 1, 1)
      patterns[name] = g.createPattern(tile, 'repeat')
    }
    return patterns[name]
  }

  function rect(x, y, w, h, color) {
    g.fillStyle = hex(color)
    g.fillRect(f(x), f(y), f(w), f(h))
  }

  function pixel(x, y, color) {
    rect(x, y, 1, 1, color)
  }

  // Filled circle, built from horizontal lines so it stays on the pixel grid.
  function circle(cx, cy, r, color) {
    cx = f(cx)
    cy = f(cy)
    r = f(r)
    g.fillStyle = hex(color)
    for (let dy = -r; dy <= r; dy++) {
      const dx = f(Math.sqrt(r * r - dy * dy))
      g.fillRect(cx - dx, cy + dy, dx * 2 + 1, 1)
    }
  }

  // Line from (x0, y0) to (x1, y1). size > 1 stamps a filled circle on every step.
  function line(x0, y0, x1, y1, color, size = 1) {
    x0 = f(x0)
    y0 = f(y0)
    x1 = f(x1)
    y1 = f(y1)
    const dx = Math.abs(x1 - x0)
    const dy = -Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1
    const sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    const radius = f(size / 2)
    g.fillStyle = hex(color)
    for (;;) {
      if (size <= 1) g.fillRect(x0, y0, 1, 1)
      else circle(x0, y0, radius, color)
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * err
      if (e2 >= dy) {
        err += dy
        x0 += sx
      }
      if (e2 <= dx) {
        err += dx
        y0 += sy
      }
    }
  }

  // 1-pixel outline of a rectangle.
  function frame(x, y, w, h, color) {
    rect(x, y, w, 1, color)
    rect(x, y + h - 1, w, 1, color)
    rect(x, y, 1, h, color)
    rect(x + w - 1, y, 1, h, color)
  }

  // Half the pixels of the area, in a checkerboard. The FR-6 way to do "50% transparent".
  // The other half is NOT painted: draw a solid color under it if the area changes.
  function dither(x, y, w, h, color) {
    g.fillStyle = ditherPattern(color)
    g.fillRect(f(x), f(y), f(w), f(h))
  }

  // Pixel art, same format as a toy icon: { colors: { k: 'ink' }, pixels: ['k.k', ...] }
  // colors can be overridden per call, e.g. to tint a sprite with a player color.
  function sprite(art, x, y, { scale = 1, colors = {} } = {}) {
    x = f(x)
    y = f(y)
    art.pixels.forEach((row, py) => {
      ;[...row].forEach((char, px) => {
        const name = colors[char] || art.colors[char]
        if (!name) return
        g.fillStyle = hex(name)
        g.fillRect(x + px * scale, y + py * scale, scale, scale)
      })
    })
  }

  // Text in the system font. (x, y) = top-left of the line box (LINE_HEIGHT * scale tall).
  // align: 'left' | 'center' | 'right' (relative to x). Supports '\n'.
  function text(str, x, y, { color = 'paper', scale = 1, align = 'left' } = {}) {
    g.fillStyle = hex(color)
    String(str)
      .split('\n')
      .forEach((lineText, i) => {
        const w = measureText(lineText, scale)
        let left = f(x)
        if (align === 'center') left = f(x - w / 2)
        if (align === 'right') left = f(x - w)
        layoutText(lineText, left, f(y) + i * LINE_HEIGHT * scale, scale, (px, py) =>
          g.fillRect(px, py, scale, scale),
        )
      })
  }

  function clear(color = 'black') {
    rect(0, 0, width, height, color)
  }

  // Paint a layer (see createLayer) at (x, y).
  function drawLayer(layer, x, y) {
    g.drawImage(layer.canvas, f(x), f(y))
  }

  return {
    width,
    height,
    lineHeight: LINE_HEIGHT,
    // For special cases only (e.g. drawing an offscreen image).
    // Colors still have to come from the palette.
    context: g,

    clear,
    pixel,
    rect,
    frame,
    line,
    circle,
    dither,
    sprite,
    text,
    drawLayer,
    measureText,
    wrapText,
  }
}

// An offscreen image you can draw on, then show with screen.drawLayer(layer, x, y).
export function createLayer(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return { canvas, ...createPainter(canvas.getContext('2d'), width, height) }
}

export function createScreen(root) {
  const canvas = document.createElement('canvas')
  canvas.className = 'hw-screen'
  canvas.width = SCREEN_W
  canvas.height = SCREEN_H
  canvas.tabIndex = 0 // so it can take keyboard focus
  root.append(canvas)

  // --- scaling: the biggest whole number that fits; below 1x, shrink to fit ---

  function fit() {
    const top = canvas.getBoundingClientRect().top + window.scrollY
    const availableW = root.clientWidth
    const availableH = window.innerHeight - top - 24
    let scale = Math.min(availableW / SCREEN_W, Math.max(availableH, 180) / SCREEN_H)
    if (scale >= 1) scale = Math.floor(scale)
    canvas.style.width = SCREEN_W * scale + 'px'
    canvas.style.height = SCREEN_H * scale + 'px'
  }
  const observer = new ResizeObserver(fit)
  observer.observe(root)
  window.addEventListener('resize', fit)
  fit()

  // Pointer event -> screen pixel { x, y } (can be outside 0..639 / 0..359).
  function toScreen(event) {
    const box = canvas.getBoundingClientRect()
    return {
      x: Math.floor(((event.clientX - box.left) / box.width) * SCREEN_W),
      y: Math.floor(((event.clientY - box.top) / box.height) * SCREEN_H),
    }
  }

  return {
    canvas,
    ...createPainter(canvas.getContext('2d'), SCREEN_W, SCREEN_H),
    toScreen,

    destroy() {
      observer.disconnect()
      window.removeEventListener('resize', fit)
      canvas.remove()
    },
  }
}
