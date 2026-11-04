// Client half of Gartic: the canvas, the tools and the screens.
// Only the current drawer can draw; everyone else just paints what arrives.

import {
  CANVAS_W,
  CANVAS_H,
  COLORS,
  ERASER,
  SIZES,
  ROUND_OPTIONS,
  DEFAULT_ROUNDS,
  DRAW_TIME_OPTIONS,
  DEFAULT_DRAW_TIME,
  SEND_STROKE_EVERY_MS,
} from './constants.js'

export function garticClient(ctx) {
  ctx.root.innerHTML = `
    <style>
      .gartic-setup { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
      .gartic-setup select { font: inherit; padding: 6px; }
      .gartic-top { display: flex; justify-content: space-between; margin-bottom: 8px; min-height: 1.5em; }
      .gartic-main { display: grid; grid-template-columns: 1fr 200px; gap: 12px; }
      @media (max-width: 700px) { .gartic-main { grid-template-columns: 1fr; } }
      .gartic-board { position: relative; }
      .gartic-board canvas {
        width: 100%; display: block; background: #fff; touch-action: none;
        border: 2px solid #1a1a1a; border-radius: 8px;
      }
      .gartic-board.can-draw canvas { cursor: crosshair; }
      .gartic-overlay {
        position: absolute; inset: 0; display: flex; flex-direction: column; gap: 12px;
        align-items: center; justify-content: center; text-align: center;
        background: rgba(255, 255, 255, 0.85); border-radius: 8px; font-size: 1.3rem;
      }
      .gartic-tools { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
      .gartic-tools button { padding: 6px 10px; }
      .gartic-tools .swatch { width: 32px; height: 32px; padding: 0; }
      .gartic-tools .selected { outline: 3px solid #1a1a1a; outline-offset: 2px; }
      .gartic-players { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
      .gartic-players li { padding: 6px 8px; border: 2px solid #1a1a1a; border-radius: 8px; background: #fff; }
      .gartic-players li.drawing { background: #1a1a1a; color: #fff; }
    </style>

    <div class="gartic-setup"></div>

    <div class="gartic-game" hidden>
      <div class="gartic-top">
        <strong class="gartic-status"></strong>
        <span class="gartic-time"></span>
      </div>
      <div class="gartic-main">
        <div>
          <div class="gartic-board">
            <canvas width="${CANVAS_W}" height="${CANVAS_H}"></canvas>
            <div class="gartic-overlay" hidden>
              <span class="gartic-overlay-text"></span>
              <button class="gartic-again" hidden>Jogar de novo</button>
            </div>
          </div>
          <div class="gartic-tools" hidden></div>
        </div>
        <ul class="gartic-players"></ul>
      </div>
    </div>
  `

  const $ = (selector) => ctx.root.querySelector(selector)
  const canvas = $('canvas')
  const g = canvas.getContext('2d')

  let state = null

  function nameOf(id) {
    const player = ctx.players.find((p) => p.id === id)
    return player ? player.name : '?'
  }

  function amDrawing() {
    return Boolean(state && state.phase === 'drawing' && state.drawerId === ctx.me.id)
  }

  // --- painting (used for my own strokes and for the ones that arrive) ---

  function clearCanvas() {
    g.fillStyle = '#fff'
    g.fillRect(0, 0, CANVAS_W, CANVAS_H)
  }

  // points = [x0, y0, x1, y1, ...] in logical canvas coordinates
  function paint(piece) {
    const p = piece.points
    g.strokeStyle = piece.color
    g.fillStyle = piece.color
    g.lineWidth = piece.size
    g.lineCap = 'round'
    g.lineJoin = 'round'

    if (p.length === 2) {
      // A single click: a dot.
      g.beginPath()
      g.arc(p[0], p[1], piece.size / 2, 0, Math.PI * 2)
      g.fill()
      return
    }
    g.beginPath()
    g.moveTo(p[0], p[1])
    for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1])
    g.stroke()
  }

  // --- tools (only visible for the drawer) ---

  let color = COLORS[0]
  let size = SIZES[1]

  function renderTools() {
    const tools = $('.gartic-tools')
    tools.innerHTML = ''

    for (const c of COLORS) {
      const button = document.createElement('button')
      button.className = 'swatch' + (c === color ? ' selected' : '')
      button.style.background = c
      button.title = 'Cor'
      button.addEventListener('click', () => {
        color = c
        renderTools()
      })
      tools.append(button)
    }

    const eraser = document.createElement('button')
    eraser.textContent = 'Borracha'
    eraser.className = color === ERASER ? 'selected' : ''
    eraser.addEventListener('click', () => {
      color = ERASER
      renderTools()
    })
    tools.append(eraser)

    SIZES.forEach((s, i) => {
      const button = document.createElement('button')
      button.textContent = ['P', 'M', 'G'][i]
      button.title = 'Tamanho do pincel'
      button.className = s === size ? 'selected' : ''
      button.addEventListener('click', () => {
        size = s
        renderTools()
      })
      tools.append(button)
    })

    const clear = document.createElement('button')
    clear.textContent = 'Limpar'
    clear.addEventListener('click', () => {
      clearCanvas()
      ctx.send('clear', {})
    })
    tools.append(clear)
  }

  // --- drawing with the mouse / finger / pen ---

  let drawing = false
  let pending = [] // points not sent yet
  let lastPoint = null // last point already sent, so pieces connect

  function toCanvas(event) {
    const rect = canvas.getBoundingClientRect()
    return [
      Math.round(((event.clientX - rect.left) / rect.width) * CANVAS_W),
      Math.round(((event.clientY - rect.top) / rect.height) * CANVAS_H),
    ]
  }

  function onDown(event) {
    if (!amDrawing()) return
    drawing = true
    canvas.setPointerCapture(event.pointerId)
    const [x, y] = toCanvas(event)
    lastPoint = null
    pending = [x, y]
    paint({ color, size, points: pending })
  }

  function onMove(event) {
    if (!drawing) return
    const [x, y] = toCanvas(event)
    const px = pending.length ? pending[pending.length - 2] : lastPoint[0]
    const py = pending.length ? pending[pending.length - 1] : lastPoint[1]
    if (Math.abs(x - px) + Math.abs(y - py) < 2) return // ignore tiny moves
    paint({ color, size, points: [px, py, x, y] }) // draw locally right away
    pending.push(x, y)
  }

  function onUp() {
    if (!drawing) return
    drawing = false
    flush()
    lastPoint = null
  }

  // Sends the points collected so far as one piece of the stroke.
  function flush() {
    if (pending.length === 0) return
    const points = lastPoint ? [...lastPoint, ...pending] : pending
    ctx.send('draw', { color, size, points })
    lastPoint = pending.slice(-2)
    pending = []
  }

  const flushTimer = setInterval(() => {
    if (drawing) flush()
  }, SEND_STROKE_EVERY_MS)

  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)

  // --- screens ---

  function showSetup() {
    state = null
    $('.gartic-game').hidden = true
    $('.gartic-setup').hidden = false

    if (!ctx.me.isHost) {
      $('.gartic-setup').innerHTML = '<p>Esperando o host iniciar a partida...</p>'
      return
    }

    const options = (list, chosen, label) =>
      list.map((v) => `<option value="${v}" ${v === chosen ? 'selected' : ''}>${v} ${label}</option>`).join('')

    $('.gartic-setup').innerHTML = `
      <p>Um desenha, os outros adivinham. Cada jogador desenha uma vez por rodada.</p>
      <label>Rodadas <select class="rounds">${options(ROUND_OPTIONS, DEFAULT_ROUNDS, '')}</select></label>
      <label>Tempo pra desenhar <select class="time">${options(DRAW_TIME_OPTIONS, DEFAULT_DRAW_TIME, 'segundos')}</select></label>
      <button>Iniciar partida</button>
    `
    $('.gartic-setup button').addEventListener('click', () => {
      ctx.send('start', {
        rounds: Number($('.gartic-setup .rounds').value),
        drawTime: Number($('.gartic-setup .time').value),
      })
    })
  }

  function renderGame() {
    $('.gartic-setup').hidden = true
    $('.gartic-game').hidden = false

    const drawer = nameOf(state.drawerId)
    let status = `Rodada ${state.round}/${state.rounds}`
    if (state.phase === 'drawing') {
      status += amDrawing() ? ' · Sua vez de desenhar!' : ` · ${drawer} está desenhando`
    }
    $('.gartic-status').textContent = status
    $('.gartic-time').textContent = state.phase === 'over' ? '' : `${state.timeLeft}s`

    $('.gartic-board').classList.toggle('can-draw', amDrawing())
    const toolsWereHidden = $('.gartic-tools').hidden
    $('.gartic-tools').hidden = !amDrawing()
    if (toolsWereHidden && amDrawing()) renderTools()

    const overlay = $('.gartic-overlay')
    overlay.hidden = state.phase === 'drawing'
    if (state.phase === 'between') $('.gartic-overlay-text').textContent = 'Fim do turno!'
    if (state.phase === 'over') $('.gartic-overlay-text').textContent = 'Fim de jogo!'
    $('.gartic-again').hidden = !(state.phase === 'over' && ctx.me.isHost)

    renderPlayers()
  }

  function renderPlayers() {
    const list = $('.gartic-players')
    list.innerHTML = ''
    for (const p of ctx.players) {
      const li = document.createElement('li')
      li.textContent = p.name + (p.id === ctx.me.id ? ' (você)' : '')
      if (state && state.phase === 'drawing' && p.id === state.drawerId) li.className = 'drawing'
      list.append(li)
    }
  }

  $('.gartic-again').addEventListener('click', () => ctx.send('again', {}))

  // --- network ---

  ctx.on('setup', showSetup)

  ctx.on('state', (data) => {
    const wasDrawing = amDrawing()
    state = data
    if (wasDrawing && !amDrawing()) onUp() // time ran out mid-stroke
    renderGame()
  })

  ctx.on('draw', (piece) => {
    if (amDrawing()) return // I already painted my own strokes
    paint(piece)
  })

  ctx.on('strokes', (data) => {
    clearCanvas()
    for (const piece of data.list) paint(piece)
  })

  ctx.on('clear', clearCanvas)

  ctx.onPlayersChange(renderPlayers)

  // --- start ---

  clearCanvas()
  showSetup()
  ctx.send('hi', {})

  return {
    stop() {
      clearInterval(flushTimer)
    },
  }
}
