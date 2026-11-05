// Client half of Worms: draws the game on the FR-6 screen and sends button input.
// It never decides anything: positions, turns and wind come from the host.
//
// The world (1200 x 600) is bigger than the screen (640 x 360), so a camera
// follows the active worm, or the shot while it flies.
//
// Buttons:  ← → walk · ↑ ↓ aim · Ⓑ jump · hold Ⓐ to charge, release to fire

import { createScreen, SCREEN_W, SCREEN_H } from '../../hw/screen.js'
import { createInput } from '../../hw/input.js'
import { rgb } from '../../hw/palette.js'
import { createTerrain } from './terrain.js'
import {
  WORLD_W,
  WORLD_H,
  WATER_Y,
  WORM_RADIUS,
  WIND_MAX,
  TURN_TIMES,
  DEFAULT_TURN_TIME,
} from './constants.js'

// --- art: Minhocas' own look, every color from the FR-6 palette ---

const GRASS = rgb('lime')
const GRASS_DARK = rgb('green')
const DIRT = rgb('brown')
const DIRT_DARK = rgb('bark')

const CLOUD = {
  colors: { w: 'paper', i: 'ice' },
  pixels: [
    '....wwww........',
    '..wwwwwwww.www..',
    '.wwwwwwwwwwwwww.',
    'wwwwwwwwwwwwwwww',
    '.iiiiiiiiiiiiii.',
  ],
}

// Bobbing arrow over the worm whose turn it is.
const POINTER = {
  colors: { k: 'black', w: 'paper' },
  pixels: ['kkkkkkk', 'kwwwwwk', '.kwwwk.', '..kwk..', '...k...'],
}

const CROSSHAIR = {
  colors: { k: 'black', w: 'paper' },
  pixels: ['...k...', '...w...', '.......', 'kw...wk', '.......', '...w...', '...k...'],
}

// Clouds drift slowly and move less than the ground when the camera moves (parallax).
const CLOUDS = [
  { x: 40, y: 34 },
  { x: 300, y: 70 },
  { x: 520, y: 24 },
  { x: 760, y: 88 },
]

const HELP = '← → anda · ↑ ↓ mira · Ⓑ pula · segure Ⓐ e solte pra atirar'

export function wormsClient(ctx) {
  const screen = createScreen(ctx.root)
  const input = createInput()

  let terrain = null
  let terrainImage = null // offscreen canvas with the terrain already drawn
  let teams = []
  let state = null // null = setup screen
  let turnTime = DEFAULT_TURN_TIME // chosen on the setup screen (host)
  const shown = {} // wormId (or 'shot') -> { x, y } smoothed position
  let booms = [] // explosions being animated: { x, y, r, startedAt }
  const camera = { x: 0, y: 0 } // top-left of the screen, in world pixels
  let snapCamera = true // jump straight to the target instead of gliding

  // --- network ---

  ctx.on('setup', () => {
    state = null
    terrain = null
    terrainImage = null
  })

  ctx.on('game', (data) => {
    teams = data.teams
    terrain = createTerrain(data.seed)
    for (const c of data.craters) terrain.carve(c.x, c.y, c.r)
    terrainImage = drawTerrainImage(terrain)
    snapCamera = true
  })

  ctx.on('boom', (data) => {
    if (!terrain) return
    terrain.carve(data.x, data.y, data.r)
    terrainImage = drawTerrainImage(terrain)
    booms.push({ ...data, startedAt: performance.now() })
  })

  ctx.on('state', (data) => {
    state = data
  })

  // --- input ---

  function isMyTurn() {
    if (!state || state.phase !== 'playing') return false
    const worm = state.worms.find((w) => w.id === state.activeWormId)
    return Boolean(worm && teams[worm.team] && teams[worm.team].playerId === ctx.me.id)
  }

  const ARROWS = ['left', 'right', 'up', 'down']

  function sendArrows() {
    if (!isMyTurn()) return
    const { left, right, up, down } = input.held
    ctx.send('input', { left, right, up, down })
  }

  input.onPress((button) => {
    // Setup screen: the host picks the turn time with ◀ ▶ and starts with Ⓐ.
    if (!state) {
      if (!ctx.me.isHost) return
      const i = TURN_TIMES.indexOf(turnTime)
      if (button === 'left') turnTime = TURN_TIMES[Math.max(0, i - 1)]
      if (button === 'right') turnTime = TURN_TIMES[Math.min(TURN_TIMES.length - 1, i + 1)]
      if (button === 'a') ctx.send('start', { turnTime })
      return
    }

    if (state.phase === 'over') {
      if (button === 'a' && ctx.me.isHost) ctx.send('again', {})
      return
    }

    if (ARROWS.includes(button)) sendArrows()
    else if (button === 'b' && isMyTurn()) ctx.send('jump', {})
    else if (button === 'a' && isMyTurn()) ctx.send('charge', {})
  })

  input.onRelease((button) => {
    if (!state || state.phase !== 'playing') return
    if (ARROWS.includes(button)) sendArrows()
    else if (button === 'a' && isMyTurn()) ctx.send('fire', {})
  })

  // --- drawing ---

  let frame = 0
  function draw() {
    frame = requestAnimationFrame(draw)

    if (!state || !terrainImage) {
      drawSetup()
      return
    }

    updateCamera()
    const cx = Math.floor(camera.x)
    const cy = Math.floor(camera.y)

    drawSky(cx)
    screen.context.drawImage(terrainImage, -cx, -cy)

    for (const worm of state.worms) {
      if (!worm.alive) continue
      const pos = smooth(worm.id, worm, 40)
      const isActive = worm.id === state.activeWormId
      drawWorm(worm, pos.x - cx, pos.y - cy, isActive)
      if (isActive && !state.fired) drawAim(worm, pos.x - cx, pos.y - cy)
    }

    if (state.shot) {
      const pos = smooth('shot', state.shot, 80)
      screen.circle(pos.x - cx, pos.y - cy, 2, 'black')
      screen.pixel(pos.x - cx - 1, pos.y - cy - 1, 'paper')
    } else {
      delete shown.shot
    }

    drawBooms(cx, cy)
    drawWater(cy)
    drawHud()
    if (state.phase === 'over') drawGameOver()
  }

  // The host sends positions 20x per second; glide towards them so it looks smooth.
  // If the jump is bigger than `snap` pixels, just teleport.
  function smooth(id, target, snap) {
    const pos = shown[id]
    if (!pos || Math.hypot(pos.x - target.x, pos.y - target.y) > snap) {
      shown[id] = { x: target.x, y: target.y }
    } else {
      pos.x += (target.x - pos.x) * 0.35
      pos.y += (target.y - pos.y) * 0.35
    }
    return shown[id]
  }

  // The camera follows the shot while it flies, otherwise the active worm.
  function updateCamera() {
    const target = state.shot || state.worms.find((w) => w.id === state.activeWormId)
    if (!target) return
    const goalX = clamp(target.x - SCREEN_W / 2, 0, WORLD_W - SCREEN_W)
    const goalY = clamp(target.y - SCREEN_H * 0.55, 0, WORLD_H - SCREEN_H)
    if (snapCamera) {
      camera.x = goalX
      camera.y = goalY
      snapCamera = false
    } else {
      camera.x += (goalX - camera.x) * 0.1
      camera.y += (goalY - camera.y) * 0.1
    }
  }

  function drawSky(cx) {
    // Dither only paints half the pixels, so always paint a solid color under it.
    screen.rect(0, 0, SCREEN_W, 200, 'sky')
    screen.dither(0, 150, SCREEN_W, 50, 'ice')
    screen.rect(0, 200, SCREEN_W, SCREEN_H - 200, 'ice')

    const drift = performance.now() / 250
    const span = SCREEN_W + 64
    for (const cloud of CLOUDS) {
      const x = ((((cloud.x + drift - cx * 0.4) % span) + span) % span) - 32
      screen.sprite(CLOUD, x, cloud.y, { scale: 2 })
    }
  }

  function drawWater(cy) {
    const top = WATER_Y - cy
    if (top >= SCREEN_H) return
    const wave = Math.floor(performance.now() / 150) % 8
    screen.rect(0, top + 2, SCREEN_W, SCREEN_H, 'blue')
    screen.dither(0, top + 10, SCREEN_W, SCREEN_H, 'navy')
    for (let x = -8; x < SCREEN_W; x += 8) screen.rect(x + wave, top, 4, 2, 'ice')
  }

  // Text with a 1-pixel black outline, so it reads on sky and on ground.
  function outlined(str, x, y, color) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      screen.text(str, x + dx, y + dy, { color: 'black', align: 'center' })
    }
    screen.text(str, x, y, { color, align: 'center' })
  }

  function drawWorm(worm, x, y, isActive) {
    const team = teams[worm.team]
    const color = team ? team.color : 'gray'

    screen.circle(x, y, WORM_RADIUS + 1, 'black')
    screen.circle(x, y, WORM_RADIUS, color)

    // eye, on the side it is facing
    const eyeX = Math.floor(x) + worm.facing * 2
    screen.rect(eyeX - 1, y - 4, 3, 3, 'paper')
    screen.pixel(eyeX + worm.facing, y - 3, 'black')

    outlined(worm.name, x, y - 34, color)
    outlined(String(worm.hp), x, y - 23, 'paper')

    if (isActive) {
      const bob = Math.round(Math.sin(performance.now() / 150) * 2)
      screen.sprite(POINTER, x - 3, y - 44 + bob)
    }
  }

  // Crosshair where the worm is aiming, plus the power line while charging.
  function drawAim(worm, x, y) {
    const dirX = Math.cos(worm.aim) * worm.facing
    const dirY = Math.sin(worm.aim)

    if (state.charge !== null) {
      const color = state.charge < 0.5 ? 'amber' : state.charge < 0.8 ? 'orange' : 'coral'
      const length = 10 + state.charge * 40
      screen.line(x + dirX * 10, y + dirY * 10, x + dirX * length, y + dirY * length, color, 3)
    }

    screen.sprite(CROSSHAIR, x + dirX * 32 - 3, y + dirY * 32 - 3)
  }

  // Explosions in 4 flat steps: flash, fire, embers, smoke.
  function drawBooms(cx, cy) {
    const DURATION = 400
    const now = performance.now()
    booms = booms.filter((b) => now - b.startedAt < DURATION)
    for (const b of booms) {
      const t = (now - b.startedAt) / DURATION
      const x = b.x - cx
      const y = b.y - cy
      if (t < 0.25) screen.circle(x, y, b.r * 0.8, 'cream')
      else if (t < 0.5) screen.circle(x, y, b.r, 'amber')
      else if (t < 0.75) screen.circle(x, y, b.r * 0.85, 'orange')
      else screen.circle(x, y, b.r * 0.5, 'slate')
    }
  }

  function drawHud() {
    screen.dither(0, 0, SCREEN_W, 18, 'black')

    const worm = state.worms.find((w) => w.id === state.activeWormId)
    if (state.phase === 'playing' && worm) {
      const team = teams[worm.team]
      let x = 8
      const part = (str, color) => {
        screen.text(str, x, 3, { color })
        x += screen.measureText(str)
      }
      part('Vez de ', 'paper')
      part(worm.name, team ? team.color : 'paper')
      if (isMyTurn()) part(' (você!)', 'paper')
      part(' · ', 'gray')
      part(state.timeLeft + 's', state.timeLeft <= 5 ? 'coral' : 'paper')
    }

    // Wind: an arrow whose length shows the strength.
    const cx = SCREEN_W - 70
    const cy = 9
    const length = Math.round((state.wind / WIND_MAX) * 40)
    screen.text('vento', cx - 52, 3, { color: 'silver', align: 'right' })
    screen.rect(cx - 41, cy, 83, 1, 'slate')
    screen.line(cx, cy, cx + length, cy, 'paper', 2)
    if (Math.abs(length) > 3) {
      const dir = Math.sign(length)
      screen.line(cx + length, cy, cx + length - dir * 4, cy - 4, 'paper')
      screen.line(cx + length, cy, cx + length - dir * 4, cy + 4, 'paper')
    }

    if (isMyTurn()) {
      screen.dither(0, SCREEN_H - 16, SCREEN_W, 16, 'black')
      screen.text(HELP, SCREEN_W / 2, SCREEN_H - 14, { color: 'paper', align: 'center' })
    }
  }

  function drawGameOver() {
    screen.dither(0, 0, SCREEN_W, SCREEN_H, 'black')
    const title = state.winner ? `${state.winner} venceu!` : 'Ninguém venceu'
    screen.text(title, SCREEN_W / 2 + 2, 132, { color: 'black', scale: 3, align: 'center' })
    screen.text(title, SCREEN_W / 2, 130, { color: 'cream', scale: 3, align: 'center' })
    drawPrompt(ctx.me.isHost ? 'Ⓐ jogar de novo' : 'Esperando o host…', 200)
  }

  function drawSetup() {
    drawSky(0)
    screen.rect(0, 296, SCREEN_W, SCREEN_H - 296, 'brown')
    screen.rect(0, 292, SCREEN_W, 4, 'lime')
    screen.rect(0, 296, SCREEN_W, 2, 'green')

    screen.text('MINHOCAS', SCREEN_W / 2 + 3, 63, { color: 'blue', scale: 5, align: 'center' })
    screen.text('MINHOCAS', SCREEN_W / 2, 60, { color: 'paper', scale: 5, align: 'center' })
    screen.text('Cada jogador comanda 3 minhocas. Último time vivo vence.', SCREEN_W / 2, 130, {
      color: 'navy',
      align: 'center',
    })

    if (ctx.me.isHost) {
      screen.text(`◀  turno de ${turnTime}s  ▶`, SCREEN_W / 2, 168, {
        color: 'navy',
        scale: 2,
        align: 'center',
      })
      drawPrompt('Ⓐ começar', 214)
    } else {
      drawPrompt('Esperando o host começar…', 214)
    }

    screen.text(HELP, SCREEN_W / 2, 320, { color: 'sand', align: 'center' })
  }

  // A blinking line of text, scale 2.
  function drawPrompt(str, y) {
    if (Math.floor(performance.now() / 500) % 2 === 0) return
    screen.text(str, SCREEN_W / 2, y, { color: 'paper', scale: 2, align: 'center' })
  }

  // --- start ---

  draw()
  ctx.send('hi', {})

  return {
    stop() {
      cancelAnimationFrame(frame)
      input.destroy()
      screen.destroy()
    },
  }
}

// A "random" number that is always the same for the same (x, y): texture without noise() calls.
function speckle(x, y) {
  let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

// Paints the terrain mask into an offscreen canvas once, so each frame is just
// one drawImage. Repainted after every explosion.
//   top 2 px: light grass · next 2: dark grass · below: dirt with dark specks
function drawTerrainImage(terrain) {
  const image = document.createElement('canvas')
  image.width = WORLD_W
  image.height = WORLD_H
  const ig = image.getContext('2d')
  const pixels = ig.createImageData(WORLD_W, WORLD_H)
  const data = pixels.data

  for (let x = 0; x < WORLD_W; x++) {
    let depth = 0 // how many solid pixels since the last air pixel above
    for (let y = 0; y < WORLD_H; y++) {
      const i = y * WORLD_W + x
      if (!terrain.mask[i]) {
        depth = 0
        continue
      }
      depth++
      let color = DIRT
      if (depth <= 2) color = GRASS
      else if (depth <= 4) color = GRASS_DARK
      else if (speckle(x, y) % 7 === 0) color = DIRT_DARK
      data[i * 4] = color[0]
      data[i * 4 + 1] = color[1]
      data[i * 4 + 2] = color[2]
      data[i * 4 + 3] = 255
    }
  }

  ig.putImageData(pixels, 0, 0)
  return image
}
