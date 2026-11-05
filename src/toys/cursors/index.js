// Cursors: everyone sees everyone's mouse. The test toy for the platform
// and for the FR-6 hardware (screen, palette, font).
//
// It has no host half: the platform forwards every message to everyone,
// so each client sends its own position and draws all the positions it receives
// (including its own, which comes back through the host).

import { createScreen } from '../../hw/screen.js'
import { PALETTE, playerColorName } from '../../hw/palette.js'

// Mouse pointer, drawn at 2x. 'c' = the player's color, 'k' = outline.
const ARROW = {
  colors: { k: 'black', c: 'paper' },
  pixels: [
    'k.......',
    'kk......',
    'kck.....',
    'kcck....',
    'kccck...',
    'kcccck..',
    'kccccck.',
    'kcccckkk',
    'kckck...',
    'kk.kck..',
    'k...kk..',
  ],
}

const FONT_SAMPLE = 'FR-6 · Olá, ação! Você é ótimo? 0123456789'

export default {
  id: 'cursors',
  name: 'Cursores',
  description: 'Todo mundo vê o mouse de todo mundo. Toy de teste.',
  minPlayers: 1,
  maxPlayers: 6,
  icon: {
    colors: { a: 'amber', c: 'coral', k: 'ink', m: 'mint', n: 'night', w: 'paper' },
    pixels: [
      'nnnnnnnnnnnnnnnn',
      'nwnnnnnnnnnnnnnn',
      'nwwnnnnnnnnmmnnn',
      'nwkwnnnnnnnmmnnn',
      'nwkkwnnnnnnnnnnn',
      'nwkkkwnnnnnnnnnn',
      'nwkkkkwnnnnnnnnn',
      'nwkkkkkwnnnnnnnn',
      'nwkkwwwwnnnnnnnn',
      'nwkwnnnnnnnnnnnn',
      'nwwnnnnnnnnnnnnn',
      'nwnnnnnnnnnnaann',
      'nnnnnccnnnnnaann',
      'nnnnnccnnnnnnnnn',
      'nnnnnnnnnnnnnnnn',
      'nnnnnnnnnnnnnnnn',
    ],
  },

  client(ctx) {
    const screen = createScreen(ctx.root)
    screen.canvas.style.cursor = 'none'

    // playerId -> { x, y } in screen pixels
    const cursors = {}

    // --- input: send our position, at most ~30 times per second ---

    let lastSent = 0
    function onMove(event) {
      const now = performance.now()
      if (now - lastSent < 33) return
      lastSent = now
      ctx.send('move', screen.toScreen(event))
    }
    screen.canvas.addEventListener('pointermove', onMove)

    // --- network: someone moved ---

    ctx.on('move', (data, fromId) => {
      cursors[fromId] = data
    })

    ctx.onPlayersChange((players) => {
      for (const id in cursors) {
        if (!players.some((p) => p.id === id)) delete cursors[id]
      }
    })

    // --- draw ---

    function drawBackground() {
      screen.clear('night')
      for (let y = 8; y < screen.height; y += 16) {
        for (let x = 8; x < screen.width; x += 16) screen.pixel(x, y, 'purple')
      }
      screen.text('CURSORES', 16, 12, { color: 'violet', scale: 2 })
      screen.text('Mexa o mouse. Todo mundo vê.', 16, 40, { color: 'silver' })
    }

    // The hardware test strip: font sample + all 32 palette colors.
    function drawTestStrip() {
      screen.dither(0, 300, screen.width, 60, 'black')
      screen.text(FONT_SAMPLE, 16, 306, { color: 'paper' })
      const names = Object.keys(PALETTE)
      const size = 18
      names.forEach((name, i) => {
        screen.rect(16 + i * size, 326, size, 18, name)
      })
    }

    function drawCursor(player, { x, y }) {
      const color = playerColorName(player.color)
      screen.sprite(ARROW, x, y, { scale: 2, colors: { c: color } })

      const label = player.name + (player.id === ctx.me.id ? ' (você)' : '')
      const width = screen.measureText(label) + 6
      screen.rect(x + 14, y + 22, width, 13, color)
      screen.text(label, x + 17, y + 22, { color: 'black' })
    }

    let frame = 0
    function draw() {
      drawBackground()
      drawTestStrip()
      for (const id in cursors) {
        const player = ctx.players.find((p) => p.id === id)
        if (player) drawCursor(player, cursors[id])
      }
      frame = requestAnimationFrame(draw)
    }
    draw()

    return {
      stop() {
        cancelAnimationFrame(frame)
        screen.canvas.removeEventListener('pointermove', onMove)
        screen.destroy()
      },
    }
  },
}
