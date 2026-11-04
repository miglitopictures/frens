// Client half of Gartic: canvas, tools, chat and the screens.
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
  MAX_CHAT_LENGTH,
} from './constants.js'
import { THEMES } from './words.js'

export function garticClient(ctx) {
  ctx.root.innerHTML = `
    <style>
      .gartic-setup { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; max-width: 520px; }
      .gartic-setup select { font: inherit; padding: 6px; }
      .gartic-setup fieldset { border: 2px solid #1a1a1a; border-radius: 8px; display: flex; flex-wrap: wrap; gap: 6px 16px; }
      .gartic-setup textarea { font: inherit; width: 100%; min-height: 70px; padding: 8px; border: 2px solid #1a1a1a; border-radius: 8px; }
      .gartic-top { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; min-height: 1.6em; }
      .gartic-hint { font-family: ui-monospace, monospace; font-size: 1.3rem; letter-spacing: 0.25em; }
      .gartic-main { display: grid; grid-template-columns: 1fr 240px; gap: 12px; }
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
        background: rgba(255, 255, 255, 0.9); border-radius: 8px; font-size: 1.2rem;
      }
      .gartic-overlay ol { text-align: left; margin: 0; }
      .gartic-choices { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
      .gartic-tools { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
      .gartic-tools button { padding: 6px 10px; }
      .gartic-tools .swatch { width: 32px; height: 32px; padding: 0; }
      .gartic-tools .selected { outline: 3px solid #1a1a1a; outline-offset: 2px; }
      .gartic-side { display: flex; flex-direction: column; gap: 8px; min-height: 0; }
      .gartic-players { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
      .gartic-players li {
        display: flex; justify-content: space-between; padding: 6px 8px;
        border: 2px solid #1a1a1a; border-radius: 8px; background: #fff;
      }
      .gartic-players li.drawing { background: #1a1a1a; color: #fff; }
      .gartic-players li.guessed { background: #d8f0e0; }
      .gartic-chat { display: flex; flex-direction: column; border: 2px solid #1a1a1a; border-radius: 8px; background: #fff; }
      .gartic-messages { list-style: none; margin: 0; padding: 8px; height: 260px; overflow-y: auto; font-size: 0.9rem; }
      .gartic-messages li { margin-bottom: 4px; word-wrap: break-word; }
      .gartic-messages .system { font-weight: bold; color: #2d6a4f; }
      .gartic-messages .secret { color: #2d6a4f; }
      .gartic-messages .close { color: #b36b00; font-style: italic; }
      .gartic-chat form { display: flex; border-top: 2px solid #1a1a1a; }
      .gartic-chat input { border: 0; border-radius: 0 0 8px 8px; }
    </style>

    <div class="gartic-setup"></div>

    <div class="gartic-game" hidden>
      <div class="gartic-top">
        <strong class="gartic-status"></strong>
        <span class="gartic-hint"></span>
        <span class="gartic-time"></span>
      </div>
      <div class="gartic-main">
        <div>
          <div class="gartic-board">
            <canvas width="${CANVAS_W}" height="${CANVAS_H}"></canvas>
            <div class="gartic-overlay" hidden></div>
          </div>
          <div class="gartic-tools" hidden></div>
        </div>
        <div class="gartic-side">
          <ul class="gartic-players"></ul>
          <div class="gartic-chat">
            <ul class="gartic-messages"></ul>
            <form><input maxlength="${MAX_CHAT_LENGTH}" placeholder="Seu chute..." /></form>
          </div>
        </div>
      </div>
    </div>
  `

  const $ = (selector) => ctx.root.querySelector(selector)
  const canvas = $('canvas')
  const g = canvas.getContext('2d')

  let state = null
  let myWord = null // the secret word, if I'm drawing or already guessed it
  let choices = [] // the 3 words, if I'm choosing

  function nameOf(id) {
    const player = ctx.players.find((p) => p.id === id)
    return player ? player.name : '?'
  }

  function amDrawer() {
    return Boolean(state && state.drawerId === ctx.me.id)
  }

  function amDrawing() {
    return Boolean(state && state.phase === 'drawing' && amDrawer())
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

  // --- setup screen ---

  function showSetup() {
    state = null
    myWord = null
    $('.gartic-game').hidden = true
    $('.gartic-setup').hidden = false
    $('.gartic-messages').innerHTML = ''

    if (!ctx.me.isHost) {
      $('.gartic-setup').innerHTML = '<p>Esperando o host iniciar a partida...</p>'
      return
    }

    const options = (list, chosen, label) =>
      list.map((v) => `<option value="${v}" ${v === chosen ? 'selected' : ''}>${v} ${label}</option>`).join('')
    const themeBoxes = THEMES.map(
      (t) => `<label><input type="checkbox" value="${t.id}" checked /> ${t.name}</label>`,
    ).join('')

    $('.gartic-setup').innerHTML = `
      <p>Um desenha, os outros adivinham. Cada jogador desenha uma vez por rodada.</p>
      <label>Rodadas <select class="rounds">${options(ROUND_OPTIONS, DEFAULT_ROUNDS, '')}</select></label>
      <label>Tempo pra desenhar <select class="time">${options(DRAW_TIME_OPTIONS, DEFAULT_DRAW_TIME, 'segundos')}</select></label>
      <fieldset>
        <legend>Temas</legend>
        ${themeBoxes}
      </fieldset>
      <label style="width: 100%">Palavras próprias (opcional, separadas por vírgula ou linha)
        <textarea class="custom" placeholder="ex: tio do pavê, churrasco da firma, gato da Ana"></textarea>
      </label>
      <p class="muted">Desmarque todos os temas pra jogar só com as suas palavras.</p>
      <button>Iniciar partida</button>
    `
    $('.gartic-setup button').addEventListener('click', () => {
      const themes = [...ctx.root.querySelectorAll('.gartic-setup input[type=checkbox]:checked')].map(
        (box) => box.value,
      )
      ctx.send('start', {
        rounds: Number($('.gartic-setup .rounds').value),
        drawTime: Number($('.gartic-setup .time').value),
        themes,
        customWords: $('.gartic-setup .custom').value,
      })
    })
  }

  // --- game screen ---

  function renderGame() {
    $('.gartic-setup').hidden = true
    $('.gartic-game').hidden = false

    // Top line: round, who draws, the hint and the time.
    let status = `Rodada ${state.round}/${state.rounds}`
    let hint = ''
    if (state.phase === 'choosing') {
      status += amDrawer() ? ' · Escolha uma palavra' : ` · ${nameOf(state.drawerId)} está escolhendo...`
    } else if (state.phase === 'drawing') {
      if (amDrawer()) {
        status += ' · Desenhe:'
        hint = myWord || ''
      } else if (myWord) {
        status += ' · Você acertou!'
        hint = myWord
      } else {
        status += ` · ${nameOf(state.drawerId)} está desenhando`
        hint = state.hint
      }
    }
    $('.gartic-status').textContent = status
    $('.gartic-hint').textContent = hint
    $('.gartic-time').textContent = state.phase === 'over' ? '' : `${state.timeLeft}s`

    // Tools
    $('.gartic-board').classList.toggle('can-draw', amDrawing())
    const toolsWereHidden = $('.gartic-tools').hidden
    $('.gartic-tools').hidden = !amDrawing()
    if (toolsWereHidden && amDrawing()) renderTools()

    // Chat input: the drawer can't chat while drawing.
    const input = $('.gartic-chat input')
    input.disabled = amDrawing()
    input.placeholder = amDrawing() ? 'Você está desenhando' : 'Seu chute...'

    renderOverlay()
    renderPlayers()
  }

  // The overlay only rebuilds when its content changes, so buttons keep working.
  let overlayKey = ''
  function renderOverlay() {
    const overlay = $('.gartic-overlay')
    const key = [state.phase, state.drawerId, choices.join(','), state.word].join('|')
    overlay.hidden = state.phase === 'drawing'
    if (key === overlayKey) return
    overlayKey = key
    overlay.innerHTML = ''

    const text = (t, tag = 'p') => {
      const el = document.createElement(tag)
      el.textContent = t
      overlay.append(el)
      return el
    }

    if (state.phase === 'choosing' && amDrawer()) {
      text('Escolha uma palavra pra desenhar:')
      const row = document.createElement('div')
      row.className = 'gartic-choices'
      choices.forEach((word, index) => {
        const button = document.createElement('button')
        button.textContent = word
        button.addEventListener('click', () => ctx.send('choose', { index }))
        row.append(button)
      })
      overlay.append(row)
    } else if (state.phase === 'choosing') {
      text(`${nameOf(state.drawerId)} está escolhendo uma palavra...`)
    } else if (state.phase === 'between') {
      text(state.word ? 'A palavra era' : 'Turno cancelado')
      if (state.word) text(state.word, 'strong')
    } else if (state.phase === 'over') {
      text('Fim de jogo!', 'strong')
      const list = document.createElement('ol')
      for (const p of ranking()) {
        const li = document.createElement('li')
        li.textContent = `${p.name} — ${p.score} pontos`
        list.append(li)
      }
      overlay.append(list)
      if (ctx.me.isHost) {
        const again = document.createElement('button')
        again.textContent = 'Jogar de novo'
        again.addEventListener('click', () => ctx.send('again', {}))
        overlay.append(again)
      }
    }
  }

  function ranking() {
    return ctx.players
      .map((p) => ({ name: p.name, score: (state && state.scores[p.id]) || 0 }))
      .sort((a, b) => b.score - a.score)
  }

  function renderPlayers() {
    const list = $('.gartic-players')
    list.innerHTML = ''
    for (const p of ctx.players) {
      const li = document.createElement('li')
      const name = document.createElement('span')
      const score = document.createElement('span')
      name.textContent = p.name + (p.id === ctx.me.id ? ' (você)' : '')
      score.textContent = state ? (state.scores[p.id] || 0) + ' pts' : ''
      li.append(name, score)
      if (state && state.phase === 'drawing') {
        if (p.id === state.drawerId) li.className = 'drawing'
        else if (state.guessed.includes(p.id)) li.className = 'guessed'
      }
      list.append(li)
    }
  }

  // --- chat ---

  function addMessage({ name, text, kind }) {
    const list = $('.gartic-messages')
    const li = document.createElement('li')
    li.className = kind
    if (name) {
      const who = document.createElement('strong')
      who.textContent = name + ': '
      li.append(who)
    }
    li.append(document.createTextNode(text))
    list.append(li)
    while (list.children.length > 100) list.firstChild.remove()
    list.scrollTop = list.scrollHeight
  }

  $('.gartic-chat form').addEventListener('submit', (event) => {
    event.preventDefault()
    const input = $('.gartic-chat input')
    const text = input.value.trim()
    if (text) ctx.send('chat', { text })
    input.value = ''
  })

  // --- network ---

  ctx.on('setup', showSetup)

  ctx.on('state', (data) => {
    const wasDrawing = amDrawing()
    if (data.phase === 'choosing' && (!state || state.phase !== 'choosing')) {
      myWord = null // a new turn started
    }
    if (data.phase !== 'choosing') choices = []
    state = data
    if (wasDrawing && !amDrawing()) onUp() // time ran out mid-stroke
    renderGame()
  })

  ctx.on('choices', (data) => {
    choices = data.words
    if (state) renderGame()
  })

  ctx.on('word', (data) => {
    myWord = data.word
    if (state) renderGame()
  })

  ctx.on('chat', addMessage)

  ctx.on('draw', (piece) => {
    if (amDrawing()) return // I already painted my own strokes
    paint(piece)
  })

  ctx.on('strokes', (data) => {
    clearCanvas()
    for (const piece of data.list) paint(piece)
  })

  ctx.on('clear', clearCanvas)

  ctx.onPlayersChange(() => {
    if (state) renderPlayers()
  })

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
