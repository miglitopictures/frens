// Client half of Worms: draws the game and sends keyboard input.
// It never decides anything: positions, turns and wind come from the host.

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

const SKY = '#bde0fe'
const DIRT = [139, 94, 60]
const GRASS = [76, 149, 108]
const WATER = 'rgba(29, 78, 137, 0.85)'

export function wormsClient(ctx) {
  ctx.root.innerHTML = `
    <style>
      .worms canvas { width: 100%; display: block; border: 2px solid #1a1a1a; border-radius: 8px; }
      .worms-stage { position: relative; }
      .worms-over {
        position: absolute; inset: 0; display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 12px;
        background: rgba(255, 255, 255, 0.75); font-size: 1.4rem;
      }
      .worms-setup { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
      .worms-setup select { font: inherit; padding: 6px; }
      .worms-help { margin-top: 8px; }
    </style>
    <div class="worms">
      <div class="worms-setup"></div>
      <div class="worms-stage" hidden>
        <canvas width="${WORLD_W}" height="${WORLD_H}"></canvas>
        <div class="worms-over" hidden>
          <strong class="worms-winner"></strong>
          <button class="worms-again">Jogar de novo</button>
        </div>
      </div>
      <p class="worms-help muted">← → anda · Enter pula</p>
    </div>
  `

  const $ = (selector) => ctx.root.querySelector(selector)
  const canvas = $('canvas')
  const g = canvas.getContext('2d')

  let terrain = null
  let terrainImage = null // offscreen canvas with the terrain already drawn
  let teams = []
  let state = null
  const shown = {} // wormId -> { x, y } smoothed position on screen

  // --- screens ---

  function showSetup() {
    state = null
    terrain = null
    $('.worms-stage').hidden = true
    $('.worms-setup').hidden = false

    if (!ctx.me.isHost) {
      $('.worms-setup').innerHTML = '<p>Esperando o host iniciar a partida...</p>'
      return
    }

    const options = TURN_TIMES.map(
      (t) => `<option value="${t}" ${t === DEFAULT_TURN_TIME ? 'selected' : ''}>${t} segundos</option>`,
    ).join('')
    $('.worms-setup').innerHTML = `
      <p>Cada jogador comanda um time de 3 minhocas. Último time vivo vence.</p>
      <label>Tempo do turno <select>${options}</select></label>
      <button>Iniciar partida</button>
    `
    $('.worms-setup button').addEventListener('click', () => {
      ctx.send('start', { turnTime: Number($('.worms-setup select').value) })
    })
  }

  function showGame() {
    $('.worms-setup').hidden = true
    $('.worms-stage').hidden = false
  }

  $('.worms-again').hidden = !ctx.me.isHost
  $('.worms-again').addEventListener('click', () => ctx.send('again', {}))

  // --- network ---

  ctx.on('setup', showSetup)

  ctx.on('game', (data) => {
    teams = data.teams
    terrain = createTerrain(data.seed)
    for (const c of data.craters) terrain.carve(c.x, c.y, c.r)
    terrainImage = drawTerrainImage(terrain)
    showGame()
  })

  ctx.on('state', (data) => {
    state = data
    $('.worms-over').hidden = data.phase !== 'over'
    $('.worms-winner').textContent = data.winner ? `${data.winner} venceu!` : 'Ninguém venceu'
  })

  // --- input ---

  function isMyTurn() {
    if (!state || state.phase !== 'playing') return false
    const worm = state.worms.find((w) => w.id === state.activeWormId)
    return Boolean(worm && teams[worm.team] && teams[worm.team].playerId === ctx.me.id)
  }

  const keys = { left: false, right: false }
  const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' ']

  function onKey(event) {
    if (!state || !GAME_KEYS.includes(event.key)) return
    event.preventDefault() // don't scroll the page
    const down = event.type === 'keydown'

    if (event.key === 'Enter' && down && !event.repeat && isMyTurn()) {
      ctx.send('jump', {})
      return
    }

    const before = keys.left + ',' + keys.right
    if (event.key === 'ArrowLeft') keys.left = down
    if (event.key === 'ArrowRight') keys.right = down
    const changed = before !== keys.left + ',' + keys.right
    if (changed && isMyTurn()) ctx.send('input', keys)
  }

  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)

  // --- drawing ---

  let frame = 0
  function draw() {
    frame = requestAnimationFrame(draw)
    if (!state || !terrainImage) return

    g.fillStyle = SKY
    g.fillRect(0, 0, WORLD_W, WORLD_H)
    g.drawImage(terrainImage, 0, 0)

    for (const worm of state.worms) {
      if (!worm.alive) continue
      const pos = smooth(worm)
      drawWorm(worm, pos, worm.id === state.activeWormId)
    }

    g.fillStyle = WATER
    g.fillRect(0, WATER_Y, WORLD_W, WORLD_H - WATER_Y)

    drawHud()
  }

  // The host sends positions 20x per second; glide towards them so it looks smooth.
  function smooth(worm) {
    const pos = shown[worm.id]
    if (!pos || Math.hypot(pos.x - worm.x, pos.y - worm.y) > 40) {
      shown[worm.id] = { x: worm.x, y: worm.y }
    } else {
      pos.x += (worm.x - pos.x) * 0.35
      pos.y += (worm.y - pos.y) * 0.35
    }
    return shown[worm.id]
  }

  function drawWorm(worm, pos, isActive) {
    const team = teams[worm.team]
    const color = team ? team.color : '#000'

    // body
    g.fillStyle = color
    g.beginPath()
    g.arc(pos.x, pos.y, WORM_RADIUS, 0, Math.PI * 2)
    g.fill()

    // eye, on the side it is facing
    g.fillStyle = '#fff'
    g.beginPath()
    g.arc(pos.x + worm.facing * 2.5, pos.y - 2, 2, 0, Math.PI * 2)
    g.fill()

    // name and hp
    g.font = '11px system-ui, sans-serif'
    g.textAlign = 'center'
    g.fillStyle = color
    g.fillText(worm.name, pos.x, pos.y - 20)
    g.fillStyle = '#1a1a1a'
    g.fillText(String(worm.hp), pos.x, pos.y - 9)

    // arrow over the worm whose turn it is
    if (isActive) {
      const bob = Math.sin(performance.now() / 150) * 2
      const top = pos.y - 40 + bob
      g.fillStyle = '#1a1a1a'
      g.beginPath()
      g.moveTo(pos.x - 6, top)
      g.lineTo(pos.x + 6, top)
      g.lineTo(pos.x, top + 8)
      g.fill()
    }
  }

  function drawHud() {
    g.textAlign = 'left'
    g.font = '16px system-ui, sans-serif'
    g.fillStyle = '#1a1a1a'

    const worm = state.worms.find((w) => w.id === state.activeWormId)
    if (state.phase === 'playing' && worm) {
      const mine = isMyTurn() ? ' (você!)' : ''
      g.fillText(`Vez de ${worm.name}${mine}  ·  ${state.timeLeft}s`, 16, 28)
    }

    // Wind: an arrow whose length shows the strength.
    const cx = WORLD_W - 90
    const cy = 22
    const length = (state.wind / WIND_MAX) * 60
    g.textAlign = 'center'
    g.font = '12px system-ui, sans-serif'
    g.fillText('vento', cx, cy + 22)
    g.strokeStyle = '#1a1a1a'
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(cx, cy)
    g.lineTo(cx + length, cy)
    g.stroke()
    if (Math.abs(length) > 4) {
      const dir = Math.sign(length)
      g.beginPath()
      g.moveTo(cx + length, cy)
      g.lineTo(cx + length - dir * 7, cy - 5)
      g.lineTo(cx + length - dir * 7, cy + 5)
      g.fill()
    }
  }

  // --- start ---

  showSetup()
  draw()
  ctx.send('hi', {})

  return {
    stop() {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    },
  }
}

// Paints the terrain mask into an offscreen canvas once, so each frame is just
// one drawImage. Must be repainted after craters (step 4b).
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
      const color = depth <= 4 ? GRASS : DIRT
      data[i * 4] = color[0]
      data[i * 4 + 1] = color[1]
      data[i * 4 + 2] = color[2]
      data[i * 4 + 3] = 255
    }
  }

  ig.putImageData(pixels, 0, 0)
  return image
}
