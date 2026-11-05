// Client half of Gartic, drawn entirely on the FR-6 screen.
// Only the current drawer can draw; everyone else just paints what arrives.
//
// Screen layout (640 x 360):
//
//   ┌──────────────── top bar: round · hint · time ────────────────┐
//   │ ┌──────── board 400x300 ────────┐  ┌── players ──┐           │
//   │ │                               │  ├── chat ─────┤           │
//   │ └───────────────────────────────┘  │             │           │
//   │  tools (drawer) / status            └── [typing] ┘           │
//   └──────────────────────────────────────────────────────────────┘
//
// Menus and dialogs are drawn on the screen too. They can be clicked, and also
// used with the FR-6 buttons (arrows + Ⓐ).
//
// Typing: a hidden <input> catches the keyboard (and opens the phone keyboard);
// what is typed is drawn on the screen with the system font.

import { createScreen, createLayer, SCREEN_W, SCREEN_H } from '../../hw/screen.js'
import { createInput } from '../../hw/input.js'
import { PALETTE, playerColorName } from '../../hw/palette.js'
import {
  BOARD_W,
  BOARD_H,
  COLORS,
  PAPER,
  SIZES,
  ROUND_OPTIONS,
  DEFAULT_ROUNDS,
  DRAW_TIME_OPTIONS,
  DEFAULT_DRAW_TIME,
  SEND_STROKE_EVERY_MS,
  MAX_CHAT_LENGTH,
} from './constants.js'
import { THEMES, normalize, parseCustomWords } from './words.js'

// --- layout (screen pixels) ---

const TOP_H = 28 // top bar
const BX = 8 // board
const BY = 34
const RX = 416 // right column
const RW = 216
const PLAYERS_Y = 34
const ROW_H = 14
const CHAT_Y = 130
const CHAT_H = 204
const FIELD_Y = 338 // typing box, and tools row under the board
const FIELD_H = 18
const MAX_CUSTOM_WORDS_LENGTH = 300

// Message colors on the dark chat panel.
const KIND_COLORS = { normal: 'paper', system: 'mint', secret: 'violet', close: 'amber' }

export function garticClient(ctx) {
  const screen = createScreen(ctx.root)
  const input = createInput()
  const board = createLayer(BOARD_W, BOARD_H)
  const background = createLayer(SCREEN_W, SCREEN_H)
  paintBackground(background)
  board.clear(PAPER)

  // The hidden text field. Its value is drawn on the screen.
  const field = document.createElement('input')
  field.className = 'hw-keyboard'
  field.autocomplete = 'off'
  ctx.root.append(field)
  let typingFor = 'chat' // 'chat' | 'words'

  let state = null // null = setup screen
  let myWord = null // the secret word, if I'm drawing or already guessed it
  let choices = [] // the 3 words, if I'm choosing
  let choiceIndex = 0
  let messages = [] // chat: { id, name, text, kind }
  let lastTurn = { word: null, drawer: '' } // for the file name when saving the drawing

  // setup screen (host)
  const setup = {
    row: 0,
    rounds: DEFAULT_ROUNDS,
    drawTime: DEFAULT_DRAW_TIME,
    themes: THEMES.map((t) => t.id),
    customWords: '',
  }

  // drawing tools
  let color = COLORS[0]
  let size = SIZES[1]

  // Clickable areas, rebuilt every frame by the drawing code: { x, y, w, h, onClick }
  let hits = []
  function clickable(x, y, w, h, onClick) {
    hits.push({ x, y, w, h, onClick })
  }

  function nameOf(id) {
    const player = ctx.players.find((p) => p.id === id)
    return player ? player.name : '?'
  }

  function colorOf(id) {
    const player = ctx.players.find((p) => p.id === id)
    return player ? playerColorName(player.color) : 'paper'
  }

  function amDrawer() {
    return Boolean(state && state.drawerId === ctx.me.id)
  }

  function amDrawing() {
    return Boolean(state && state.phase === 'drawing' && amDrawer())
  }

  function isTyping() {
    return document.activeElement === field
  }

  // --- typing ---

  function startTyping(kind) {
    if (kind === 'words') {
      field.maxLength = MAX_CUSTOM_WORDS_LENGTH
      field.value = setup.customWords
    } else {
      field.maxLength = MAX_CHAT_LENGTH
      if (typingFor !== 'chat') field.value = ''
    }
    typingFor = kind
    field.focus({ preventScroll: true })
  }

  function stopTyping() {
    field.blur()
  }

  function canChat() {
    return Boolean(state) && !amDrawing() && state.phase !== 'over'
  }

  field.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') stopTyping()
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (typingFor === 'words') {
      setup.customWords = field.value
      stopTyping()
      return
    }
    const text = field.value.trim()
    if (text && canChat()) ctx.send('chat', { text })
    field.value = ''
  })

  field.addEventListener('input', () => {
    if (typingFor === 'words') setup.customWords = field.value
  })

  // Guessers type all the time, so the field stays focused for them.
  function autoFocusChat() {
    if (canChat() && !amDrawer()) startTyping('chat')
    else if (typingFor === 'chat') stopTyping()
  }

  // --- painting strokes on the board ---

  // points = [x0, y0, x1, y1, ...] in board pixels
  function paint(piece) {
    if (!PALETTE[piece.color]) return // not a palette color: ignore
    const p = piece.points
    const s = SIZES.includes(piece.size) ? piece.size : SIZES[1]
    if (p.length === 2) {
      if (s <= 1) board.pixel(p[0], p[1], piece.color)
      else board.circle(p[0], p[1], Math.floor(s / 2), piece.color)
      return
    }
    for (let i = 2; i < p.length; i += 2) {
      board.line(p[i - 2], p[i - 1], p[i], p[i + 1], piece.color, s)
    }
  }

  // --- drawing with the mouse / finger / pen ---

  let stroking = false
  let pending = [] // points not sent yet
  let lastPoint = null // last point already sent, so pieces connect

  function toBoard(event) {
    const { x, y } = screen.toScreen(event)
    return [x - BX, y - BY]
  }

  function insideBoard(x, y) {
    return x >= BX && x < BX + BOARD_W && y >= BY && y < BY + BOARD_H
  }

  function onPointerDown(event) {
    // Clicking the screen must not take the focus away from the text field.
    event.preventDefault()
    const { x, y } = screen.toScreen(event)

    if (amDrawing() && insideBoard(x, y)) {
      stroking = true
      screen.canvas.setPointerCapture(event.pointerId)
      const [bx, by] = toBoard(event)
      lastPoint = null
      pending = [bx, by]
      paint({ color, size, points: pending })
      return
    }

    // Clickable things drawn in the last frame (last one drawn = on top).
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i]
      if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) {
        h.onClick()
        return
      }
    }

    // Clicking the chat area starts typing.
    if (x >= RX && y >= CHAT_Y && canChat()) startTyping('chat')
  }

  function onPointerMove(event) {
    if (!stroking) return
    const [x, y] = toBoard(event)
    const px = pending.length ? pending[pending.length - 2] : lastPoint[0]
    const py = pending.length ? pending[pending.length - 1] : lastPoint[1]
    if (Math.abs(x - px) + Math.abs(y - py) < 1) return // ignore tiny moves
    paint({ color, size, points: [px, py, x, y] }) // draw locally right away
    pending.push(x, y)
  }

  function onPointerUp() {
    if (!stroking) return
    stroking = false
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
    if (stroking) flush()
  }, SEND_STROKE_EVERY_MS)

  screen.canvas.addEventListener('pointerdown', onPointerDown)
  screen.canvas.addEventListener('pointermove', onPointerMove)
  screen.canvas.addEventListener('pointerup', onPointerUp)
  screen.canvas.addEventListener('pointercancel', onPointerUp)

  // --- actions (shared by clicks and buttons) ---

  // The setup menu, one row per item.
  function setupRows() {
    return [
      { label: 'Rodadas', value: () => String(setup.rounds), change: (d) => (setup.rounds = step(ROUND_OPTIONS, setup.rounds, d)) },
      { label: 'Tempo pra desenhar', value: () => setup.drawTime + 's', change: (d) => (setup.drawTime = step(DRAW_TIME_OPTIONS, setup.drawTime, d)) },
      ...THEMES.map((theme) => ({
        label: theme.name,
        check: () => setup.themes.includes(theme.id),
        change: () => toggleTheme(theme.id),
      })),
      { label: 'Palavras próprias', value: customWordsLabel, change: () => startTyping('words') },
      { label: 'Ⓐ Começar', start: true, change: startGame },
    ]
  }

  function step(list, current, direction) {
    const i = list.indexOf(current)
    return list[(i + direction + list.length) % list.length]
  }

  function toggleTheme(id) {
    if (setup.themes.includes(id)) setup.themes = setup.themes.filter((t) => t !== id)
    else setup.themes = [...setup.themes, id]
  }

  function customWordsLabel() {
    const count = parseCustomWords(setup.customWords).length
    return count === 0 ? 'nenhuma' : count === 1 ? '1 palavra' : `${count} palavras`
  }

  function startGame() {
    stopTyping()
    ctx.send('start', {
      rounds: setup.rounds,
      drawTime: setup.drawTime,
      themes: setup.themes,
      customWords: setup.customWords,
    })
  }

  function chooseWord(index) {
    ctx.send('choose', { index })
  }

  function clearBoard() {
    board.clear(PAPER)
    ctx.send('clear', {})
  }

  // --- FR-6 buttons ---

  input.onPress((button) => {
    // Setup menu (host)
    if (!state) {
      if (!ctx.me.isHost) return
      const rows = setupRows()
      if (button === 'up') setup.row = (setup.row - 1 + rows.length) % rows.length
      if (button === 'down') setup.row = (setup.row + 1) % rows.length
      const row = rows[setup.row]
      if ((button === 'left' || button === 'right') && row.value && !row.start) {
        if (row.label !== 'Palavras próprias') row.change(button === 'left' ? -1 : 1)
      }
      if (button === 'a') row.change(1)
      return
    }

    // Picking a word
    if (state.phase === 'choosing' && amDrawer() && choices.length) {
      if (button === 'left' || button === 'up') choiceIndex = (choiceIndex + choices.length - 1) % choices.length
      if (button === 'right' || button === 'down') choiceIndex = (choiceIndex + 1) % choices.length
      if (button === 'a') chooseWord(choiceIndex)
      return
    }

    if (state.phase === 'over' && button === 'a' && ctx.me.isHost) ctx.send('again', {})
  })

  // --- network ---

  ctx.on('setup', () => {
    state = null
    myWord = null
    messages = []
    board.clear(PAPER)
    stopTyping()
  })

  ctx.on('state', (data) => {
    const wasDrawing = amDrawing()
    const oldPhase = state ? state.phase : null
    if (data.phase === 'choosing' && oldPhase !== 'choosing') {
      myWord = null // a new turn started
      choiceIndex = 0
    }
    if (data.phase === 'between' && oldPhase !== 'between') {
      lastTurn = { word: data.word, drawer: nameOf(data.drawerId) }
    }
    if (data.phase !== 'choosing') choices = []
    state = data
    if (wasDrawing && !amDrawing()) onPointerUp() // time ran out mid-stroke
    if (data.phase !== oldPhase) autoFocusChat()
  })

  ctx.on('choices', (data) => {
    choices = data.words
  })

  ctx.on('word', (data) => {
    myWord = data.word
  })

  ctx.on('chat', (message) => {
    messages.push(message)
    if (messages.length > 60) messages.shift()
  })

  ctx.on('draw', (piece) => {
    if (amDrawing()) return // I already painted my own strokes
    paint(piece)
  })

  ctx.on('strokes', (data) => {
    board.clear(PAPER)
    for (const piece of data.list) paint(piece)
  })

  ctx.on('clear', () => board.clear(PAPER))

  // --- saving the drawing (PNG at 2x, sharp pixels) ---

  function saveDrawing() {
    const out = document.createElement('canvas')
    out.width = BOARD_W * 2
    out.height = BOARD_H * 2
    const og = out.getContext('2d')
    og.imageSmoothingEnabled = false
    og.drawImage(board.canvas, 0, 0, out.width, out.height)
    const name = normalize(`${lastTurn.word || 'desenho'} ${lastTurn.drawer}`).replace(/[^a-z0-9]+/g, '-')
    const link = document.createElement('a')
    link.download = `frens-gartic-${name}.png`
    link.href = out.toDataURL('image/png')
    link.click()
  }

  // ===================================================================
  // Drawing the screen
  // ===================================================================

  const blink = () => Math.floor(performance.now() / 500) % 2 === 0

  // A flat button: dark, or amber when selected. Registers a click area.
  function button(label, x, y, w, h, { selected = false, onClick } = {}) {
    screen.rect(x, y, w, h, selected ? 'amber' : 'slate')
    screen.frame(x, y, w, h, 'black')
    screen.text(label, x + w / 2, y + Math.floor((h - 12) / 2), {
      color: selected ? 'black' : 'paper',
      align: 'center',
    })
    if (onClick) clickable(x, y, w, h, onClick)
  }

  function panel(x, y, w, h) {
    screen.rect(x, y, w, h, 'ink')
    screen.frame(x, y, w, h, 'black')
  }

  let frame = 0
  function draw() {
    frame = requestAnimationFrame(draw)
    hits = []
    screen.drawLayer(background, 0, 0)

    if (!state) {
      drawSetup()
      return
    }

    drawTopBar()
    drawBoard()
    drawPlayers()
    drawChat()
    drawField()
    if (amDrawing()) drawTools()
    else drawStatus()
    drawDialog()
  }

  function drawTopBar() {
    screen.rect(0, 0, SCREEN_W, TOP_H, 'ink')
    screen.rect(0, TOP_H, SCREEN_W, 1, 'black')
    screen.text(`Rodada ${state.round}/${state.rounds}`, 10, 8, { color: 'silver' })

    let hint = ''
    if (state.phase === 'drawing') hint = amDrawer() || myWord ? myWord || '' : state.hint || ''
    if (hint) {
      const spaced = [...hint].join(' ')
      const known = amDrawer() || myWord
      const big = screen.measureText(spaced, 2) <= 380 // long custom words: smaller
      screen.text(spaced, SCREEN_W / 2, big ? 2 : 8, {
        color: known ? 'mint' : 'cream',
        scale: big ? 2 : 1,
        align: 'center',
      })
    }

    if (state.phase !== 'over') {
      const color = state.timeLeft <= 10 ? 'coral' : 'paper'
      screen.text(state.timeLeft + 's', SCREEN_W - 10, 2, { color, scale: 2, align: 'right' })
    }
  }

  function drawBoard() {
    screen.rect(BX + 3, BY + 3, BOARD_W, BOARD_H, 'black') // shadow
    screen.drawLayer(board, BX, BY)
    screen.frame(BX - 1, BY - 1, BOARD_W + 2, BOARD_H + 2, 'black')
  }

  function drawPlayers() {
    const height = 6 * ROW_H + 6
    panel(RX, PLAYERS_Y, RW, height)
    ctx.players.forEach((p, i) => {
      const y = PLAYERS_Y + 3 + i * ROW_H
      const isDrawer = state.drawerId === p.id && state.phase !== 'over'
      const guessed = state.phase === 'drawing' && state.guessed.includes(p.id)
      if (isDrawer) screen.rect(RX + 1, y, RW - 2, ROW_H, 'slate')
      screen.circle(RX + 10, y + 7, 3, playerColorName(p.color))
      if (p.id === ctx.me.id) screen.circle(RX + 10, y + 7, 1, 'black')
      let label = p.name
      if (isDrawer) label += ' ✎'
      if (guessed) label += ' ✓'
      screen.text(label, RX + 18, y + 1, { color: guessed ? 'mint' : 'paper' })
      const score = (state.scores[p.id] || 0) + ' pts'
      screen.text(score, RX + RW - 6, y + 1, { color: 'silver', align: 'right' })
    })
  }

  // Chat: wrap every message, show the newest lines that fit.
  function drawChat() {
    panel(RX, CHAT_Y, RW, CHAT_H)
    const width = RW - 10
    const lines = []
    for (const m of messages) {
      const full = m.name ? `${m.name}: ${m.text}` : m.text
      screen.wrapText(full, width).forEach((text, i) => {
        lines.push({ text, color: KIND_COLORS[m.kind] || 'paper', name: i === 0 && m.name ? m.name + ':' : '', id: m.id })
      })
    }
    const fit = Math.floor((CHAT_H - 6) / screen.lineHeight)
    lines.slice(-fit).forEach((line, i) => {
      const y = CHAT_Y + 3 + i * screen.lineHeight
      screen.text(line.text, RX + 5, y, { color: line.color })
      // the name again, on top, in the player's color
      if (line.name) screen.text(line.name, RX + 5, y, { color: colorOf(line.id) })
    })
  }

  // The typing box under the chat.
  function drawField() {
    const active = canChat()
    const focused = isTyping() && typingFor === 'chat'
    screen.rect(RX, FIELD_Y, RW, FIELD_H, active ? 'paper' : 'slate')
    screen.frame(RX, FIELD_Y, RW, FIELD_H, focused ? 'amber' : 'black')
    clickable(RX, FIELD_Y, RW, FIELD_H, () => active && startTyping('chat'))

    if (!active) {
      const why = amDrawing() ? 'Você está desenhando' : ''
      screen.text(why, RX + 6, FIELD_Y + 3, { color: 'silver' })
      return
    }
    const value = typingFor === 'chat' ? field.value : ''
    if (!value && !focused) {
      screen.text('Clique pra chutar…', RX + 6, FIELD_Y + 3, { color: 'gray' })
      return
    }
    drawTypedText(value, RX + 6, FIELD_Y + 3, RW - 12, focused)
  }

  // Typed text, showing only the end when it's too long, plus a blinking cursor.
  function drawTypedText(value, x, y, width, focused) {
    let shown = value
    while (shown && screen.measureText(shown) > width - 4) shown = shown.slice(1)
    screen.text(shown, x, y, { color: 'ink' })
    if (focused && blink()) {
      const cx = x + screen.measureText(shown) + (shown ? 1 : 0)
      screen.rect(cx, y + 2, 1, 9, 'ink')
    }
  }

  function drawTools() {
    const y = FIELD_Y + 1
    COLORS.forEach((c, i) => {
      const x = BX + i * 16
      screen.rect(x, y, 14, 14, c)
      screen.frame(x, y, 14, 14, 'black')
      if (c === color) screen.frame(x - 2, y - 2, 18, 18, 'paper')
      clickable(x, y, 14, 14, () => (color = c))
    })

    // eraser: paints with the paper color
    const ex = BX + 264
    screen.rect(ex, y, 18, 14, 'ink')
    screen.rect(ex + 3, y + 3, 6, 8, 'pink')
    screen.rect(ex + 9, y + 3, 6, 8, PAPER)
    screen.frame(ex, y, 18, 14, color === PAPER ? 'amber' : 'black')
    clickable(ex, y, 18, 14, () => (color = PAPER))

    // sizes: a dot as big as the brush
    SIZES.forEach((s, i) => {
      const x = ex + 24 + i * 18
      screen.rect(x, y, 16, 14, 'ink')
      screen.frame(x, y, 16, 14, s === size ? 'amber' : 'black')
      if (s <= 1) screen.pixel(x + 8, y + 7, 'paper')
      else screen.circle(x + 8, y + 7, Math.min(5, Math.floor(s / 2)), 'paper')
      clickable(x, y, 16, 14, () => (size = s))
    })

    button('limpar', BX + BOARD_W - 50, y, 50, 14, { onClick: clearBoard })
  }

  // Under the board, when I'm not drawing: who is doing what.
  function drawStatus() {
    let text = ''
    if (state.phase === 'drawing') {
      text = myWord ? 'Você acertou! Agora é só torcer.' : `${nameOf(state.drawerId)} está desenhando. Chute no chat!`
    } else if (state.phase === 'choosing') {
      text = amDrawer() ? 'Sua vez de desenhar!' : `${nameOf(state.drawerId)} está escolhendo uma palavra…`
    }
    screen.text(text, BX, FIELD_Y + 3, { color: 'paper' })
  }

  // Dialogs on top of the board: choosing, "the word was", game over.
  function drawDialog() {
    const cx = BX + BOARD_W / 2

    if (state.phase === 'choosing') {
      screen.dither(BX, BY, BOARD_W, BOARD_H, 'black')
      if (amDrawer() && choices.length) {
        panel(cx - 120, BY + 60, 240, 150)
        screen.text('Escolha uma palavra:', cx, BY + 72, { align: 'center' })
        choices.forEach((word, i) => {
          button(word, cx - 100, BY + 96 + i * 30, 200, 24, {
            selected: i === choiceIndex,
            onClick: () => chooseWord(i),
          })
        })
      } else {
        panel(cx - 130, BY + 120, 260, 40)
        screen.text(`${nameOf(state.drawerId)} está escolhendo…`, cx, BY + 134, { align: 'center' })
      }
    }

    if (state.phase === 'between') {
      // At the bottom, so the drawing stays visible.
      panel(BX + 40, BY + BOARD_H - 74, BOARD_W - 80, 66)
      if (state.word) {
        screen.text('A palavra era', cx, BY + BOARD_H - 68, { color: 'silver', align: 'center' })
        screen.text(state.word, cx, BY + BOARD_H - 54, { color: 'cream', scale: 2, align: 'center' })
        button('salvar desenho', cx - 50, BY + BOARD_H - 26, 100, 14, { onClick: saveDrawing })
      } else {
        screen.text('Turno cancelado', cx, BY + BOARD_H - 48, { align: 'center' })
      }
    }

    if (state.phase === 'over') {
      screen.dither(BX, BY, BOARD_W, BOARD_H, 'black')
      panel(cx - 140, BY + 20, 280, 260)
      screen.text('Fim de jogo!', cx, BY + 30, { color: 'cream', scale: 2, align: 'center' })
      ranking().forEach((p, i) => {
        const y = BY + 70 + i * 18
        screen.text(`${i + 1}.`, cx - 110, y, { color: 'silver' })
        screen.text(p.name, cx - 90, y, { color: playerColorName(p.color) })
        screen.text(p.score + ' pts', cx + 110, y, { align: 'right' })
      })
      if (lastTurn.word) button('salvar desenho', cx - 60, BY + 196, 120, 16, { onClick: saveDrawing })
      if (ctx.me.isHost) {
        button('Ⓐ jogar de novo', cx - 70, BY + 222, 140, 24, {
          selected: true,
          onClick: () => ctx.send('again', {}),
        })
      } else if (blink()) {
        screen.text('Esperando o host…', cx, BY + 228, { color: 'silver', align: 'center' })
      }
    }
  }

  function ranking() {
    return ctx.players
      .map((p) => ({ name: p.name, color: p.color, score: (state && state.scores[p.id]) || 0 }))
      .sort((a, b) => b.score - a.score)
  }

  // --- setup screen ---

  function drawSetup() {
    screen.text('GARTIC', SCREEN_W / 2 + 3, 15, { color: 'black', scale: 5, align: 'center' })
    screen.text('GARTIC', SCREEN_W / 2, 12, { color: 'cream', scale: 5, align: 'center' })
    screen.text('Um desenha, os outros adivinham. Cada um desenha uma vez por rodada.', SCREEN_W / 2, 76, {
      color: 'paper',
      align: 'center',
    })

    if (!ctx.me.isHost) {
      if (blink()) screen.text('Esperando o host começar…', SCREEN_W / 2, 170, { scale: 2, align: 'center' })
      return
    }

    const rows = setupRows()
    const x = 170
    const w = 300
    const top = 98
    const rowH = 18
    panel(x - 6, top - 6, w + 12, rows.length * rowH + 12)

    rows.forEach((row, i) => {
      const y = top + i * rowH
      const selected = i === setup.row
      const onClick = () => {
        setup.row = i
        row.change(1)
      }
      clickable(x, y, w, rowH, onClick)

      if (row.start) {
        button(row.label, x + w / 2 - 60, y + 1, 120, 16, { selected: true })
        if (selected) screen.text('▶', x + w / 2 - 72, y + 3, { color: 'amber' })
        return
      }

      if (selected) screen.rect(x, y, w, rowH, 'slate')
      if (row.check) {
        screen.frame(x + 8, y + 4, 10, 10, 'silver')
        if (row.check()) screen.text('✓', x + 10, y + 1, { color: 'mint' })
        screen.text(row.label, x + 26, y + 3, { color: row.check() ? 'paper' : 'gray' })
      } else {
        screen.text(row.label, x + 8, y + 3, { color: 'paper' })
        const value = row.value()
        const adjustable = row.label !== 'Palavras próprias'
        const right = adjustable ? x + w - 18 : x + w - 8
        screen.text(value, right, y + 3, { color: 'cream', align: 'right' })
        if (selected && adjustable) {
          screen.text('◀', right - screen.measureText(value) - 10, y + 3, { color: 'amber' })
          screen.text('▶', x + w - 12, y + 3, { color: 'amber' })
        }
      }
    })

    // Custom words editor, under the menu while typing.
    const editing = isTyping() && typingFor === 'words'
    const hint = editing
      ? 'Separe por vírgula. Enter pra confirmar.'
      : '↑ ↓ escolhe · ◀ ▶ muda · Ⓐ confirma (ou clique)'
    if (editing) {
      screen.rect(40, 312, SCREEN_W - 80, 20, 'paper')
      screen.frame(40, 312, SCREEN_W - 80, 20, 'amber')
      drawTypedText(setup.customWords, 46, 316, SCREEN_W - 92, true)
    }
    screen.text(hint, SCREEN_W / 2, 340, { color: 'silver', align: 'center' })
  }

  // --- start ---

  draw()
  ctx.send('hi', {})

  return {
    stop() {
      cancelAnimationFrame(frame)
      clearInterval(flushTimer)
      input.destroy()
      field.remove()
      screen.destroy()
    },
  }
}

// Gartic's desk: dark teal with a dot grid.
function paintBackground(layer) {
  layer.clear('deepteal')
  for (let y = 4; y < SCREEN_H; y += 8) {
    for (let x = 4; x < SCREEN_W; x += 8) layer.pixel(x, y, 'teal')
  }
}
