// Host half of Gartic: turns, words, guesses, hints, scores and the drawing log.
//
// Messages
//   client -> host:  hi {}                        (just mounted, send me the game)
//                    start { rounds, drawTime, themes, customWords }  (host only)
//                    choose { index }             (drawer picks one of the 3 words)
//                    draw { color, size, points } (drawer only: a piece of a stroke)
//                    clear {}                     (drawer only)
//                    chat { text }                (a guess or just talking)
//                    again {}                     (host only: back to setup)
//   host -> client:  setup {}
//                    state { phase, round, rounds, drawerId, timeLeft,
//                            hint, word, scores, guessed }
//                    choices { words }            (only to the drawer)
//                    word { word }                (only to the drawer and to who guessed)
//                    chat { name, text, kind }    kind: 'normal' | 'system' | 'secret' | 'close'
//                    draw / strokes { list } / clear
//
// Phases:  choosing -> drawing -> between ("the word was...") -> choosing ... -> over
//
// The secret word NEVER goes in `state` while people are guessing.
// `hint` is the word with the hidden letters replaced by "_".

import {
  ROUND_OPTIONS,
  DEFAULT_ROUNDS,
  DRAW_TIME_OPTIONS,
  DEFAULT_DRAW_TIME,
  BETWEEN_TURNS,
  CHOOSE_TIME,
  WORD_CHOICES,
  HINT_AT,
  GUESS_POINTS,
  MIN_POINTS,
  DRAWER_POINTS,
  MAX_CHAT_LENGTH,
} from './constants.js'
import { THEMES, normalize, editDistance, parseCustomWords } from './words.js'

export function garticHost(ctx) {
  let game = null // null = setup screen
  let timer = null

  function isHostPlayer(id) {
    const player = ctx.players.find((p) => p.id === id)
    return Boolean(player && player.isHost)
  }

  function isPresent(id) {
    return ctx.players.some((p) => p.id === id)
  }

  function nameOf(id) {
    const player = ctx.players.find((p) => p.id === id)
    return player ? player.name : '?'
  }

  function now() {
    return performance.now()
  }

  function systemChat(text) {
    ctx.send('chat', { name: '', text, kind: 'system' })
  }

  // --- words ---

  function buildWordPool(themeIds, customText) {
    const pool = []
    for (const theme of THEMES) {
      if (themeIds.includes(theme.id)) pool.push(...theme.words)
    }
    pool.push(...parseCustomWords(customText))
    const unique = [...new Set(pool)]
    // Nothing chosen? Use every theme so the game still works.
    return unique.length > 0 ? unique : THEMES.flatMap((t) => t.words)
  }

  // Picks words that were not used yet in this game.
  function pickChoices() {
    let fresh = game.pool.filter((w) => !game.used.includes(w))
    if (fresh.length < WORD_CHOICES) {
      game.used = [] // ran out: allow repeats
      fresh = [...game.pool]
    }
    const choices = []
    while (choices.length < WORD_CHOICES && fresh.length > 0) {
      const index = Math.floor(Math.random() * fresh.length)
      choices.push(fresh.splice(index, 1)[0])
    }
    return choices
  }

  // The word with hidden letters as "_" (spaces and hyphens stay visible).
  function hintFor(word, revealed) {
    return [...word].map((ch, i) => (ch === ' ' || ch === '-' || revealed.includes(i) ? ch : '_')).join('')
  }

  // Reveals letters as time passes (see HINT_AT).
  function updateHints() {
    const chars = [...game.word]
    const letters = chars.map((ch, i) => i).filter((i) => chars[i] !== ' ' && chars[i] !== '-')
    const maxReveals = Math.max(0, Math.min(HINT_AT.length, letters.length - 2))
    const passed = 1 - (game.endsAt - now()) / (game.drawTime * 1000)
    const shouldHave = Math.min(maxReveals, HINT_AT.filter((t) => passed >= t).length)

    while (game.revealed.length < shouldHave) {
      const hidden = letters.filter((i) => !game.revealed.includes(i))
      game.revealed.push(hidden[Math.floor(Math.random() * hidden.length)])
    }
  }

  // --- turns ---

  // Moves to the next player who is still in the room.
  // Returns false when there is nobody left to draw (game over).
  function nextDrawer() {
    while (true) {
      game.turnIndex++
      if (game.turnIndex >= game.order.length) {
        game.turnIndex = 0
        game.round++
        if (game.round > game.rounds) return false
      }
      const id = game.order[game.turnIndex]
      if (isPresent(id)) {
        game.drawerId = id
        return true
      }
    }
  }

  function startTurn() {
    game.word = null
    game.revealed = []
    game.guessed = [] // player ids, in the order they guessed

    if (!nextDrawer()) {
      // Game over. The last drawing stays on screen so it can be saved.
      game.phase = 'over'
      game.drawerId = null
      sendState()
      return
    }

    game.strokes = []
    ctx.send('clear', {})

    game.phase = 'choosing'
    game.choices = pickChoices()
    game.endsAt = now() + CHOOSE_TIME * 1000
    ctx.sendTo(game.drawerId, 'choices', { words: game.choices })
    sendState()
  }

  function startDrawing(word) {
    game.phase = 'drawing'
    game.word = word
    game.used.push(word)
    game.endsAt = now() + game.drawTime * 1000
    ctx.sendTo(game.drawerId, 'word', { word })
    sendState()
  }

  function endTurn() {
    game.phase = 'between'
    game.endsAt = now() + BETWEEN_TURNS * 1000
    sendState()
  }

  function everyoneGuessed() {
    const guessers = ctx.players.filter((p) => p.id !== game.drawerId)
    return guessers.length > 0 && guessers.every((p) => game.guessed.includes(p.id))
  }

  // Checked 4 times per second.
  function tick() {
    if (!game || game.phase === 'over') return
    const drawerLeft = !isPresent(game.drawerId)

    if (game.phase === 'choosing') {
      if (drawerLeft) endTurn()
      else if (now() >= game.endsAt) startDrawing(game.choices[0]) // took too long
      else sendState()
    } else if (game.phase === 'drawing') {
      if (drawerLeft || now() >= game.endsAt || everyoneGuessed()) endTurn()
      else {
        updateHints()
        sendState()
      }
    } else if (game.phase === 'between') {
      if (now() >= game.endsAt) startTurn()
      else sendState()
    }
  }

  // --- guesses ---

  function handleChat(text, fromId) {
    const name = nameOf(fromId)
    const guessing = game && game.phase === 'drawing'

    if (!guessing) {
      ctx.send('chat', { name, text, kind: 'normal' })
      return
    }

    // The drawer and those who already guessed: only they see each other's messages.
    const knowsWord = fromId === game.drawerId || game.guessed.includes(fromId)
    if (knowsWord) {
      if (fromId === game.drawerId) return // the drawer doesn't chat while drawing
      for (const id of [game.drawerId, ...game.guessed]) {
        ctx.sendTo(id, 'chat', { name, text, kind: 'secret' })
      }
      return
    }

    const guess = normalize(text)
    const answer = normalize(game.word)

    if (guess === answer) {
      const position = game.guessed.length
      game.guessed.push(fromId)
      addPoints(fromId, position < GUESS_POINTS.length ? GUESS_POINTS[position] : MIN_POINTS)
      addPoints(game.drawerId, DRAWER_POINTS)
      systemChat(`${name} acertou!`)
      ctx.sendTo(fromId, 'word', { word: game.word })
      sendState()
      return
    }

    ctx.send('chat', { name, text, kind: 'normal' })
    if (answer.length >= 4 && editDistance(guess, answer) === 1) {
      ctx.sendTo(fromId, 'chat', { name: '', text: `"${text}" está perto!`, kind: 'close' })
    }
  }

  function addPoints(id, points) {
    game.scores[id] = (game.scores[id] || 0) + points
  }

  // --- state ---

  function stateMessage() {
    const showWord = game.phase === 'between' || game.phase === 'over'
    return {
      phase: game.phase,
      round: Math.min(game.round, game.rounds),
      rounds: game.rounds,
      drawerId: game.drawerId,
      timeLeft: Math.max(0, Math.ceil((game.endsAt - now()) / 1000)),
      hint: game.phase === 'drawing' ? hintFor(game.word, game.revealed) : null,
      word: showWord ? game.word : null,
      scores: game.scores,
      guessed: game.guessed,
    }
  }

  function sendState() {
    ctx.send('state', stateMessage())
  }

  // --- messages ---

  ctx.on('hi', (data, fromId) => {
    if (!game) return // client already starts on the setup screen
    ctx.sendTo(fromId, 'state', stateMessage())
    ctx.sendTo(fromId, 'strokes', { list: game.strokes })
  })

  ctx.on('start', (data, fromId) => {
    if (!isHostPlayer(fromId) || game) return
    game = {
      phase: 'choosing',
      rounds: ROUND_OPTIONS.includes(data.rounds) ? data.rounds : DEFAULT_ROUNDS,
      drawTime: DRAW_TIME_OPTIONS.includes(data.drawTime) ? data.drawTime : DEFAULT_DRAW_TIME,
      pool: buildWordPool(data.themes || [], data.customWords),
      used: [],
      order: ctx.players.map((p) => p.id),
      round: 1,
      turnIndex: -1,
      drawerId: null,
      endsAt: 0,
      choices: [],
      word: null,
      revealed: [],
      guessed: [],
      scores: {},
      strokes: [],
    }
    startTurn()
    timer = setInterval(tick, 250)
  })

  ctx.on('again', (data, fromId) => {
    if (!isHostPlayer(fromId)) return
    clearInterval(timer)
    game = null
    ctx.send('setup', {})
  })

  ctx.on('choose', (data, fromId) => {
    if (!game || game.phase !== 'choosing' || fromId !== game.drawerId) return
    const word = game.choices[data.index]
    if (word) startDrawing(word)
  })

  ctx.on('draw', (data, fromId) => {
    if (!game || game.phase !== 'drawing' || fromId !== game.drawerId) return
    const piece = { color: data.color, size: data.size, points: data.points }
    game.strokes.push(piece)
    ctx.send('draw', piece)
  })

  ctx.on('clear', (data, fromId) => {
    if (!game || game.phase !== 'drawing' || fromId !== game.drawerId) return
    game.strokes = []
    ctx.send('clear', {})
  })

  ctx.on('chat', (data, fromId) => {
    const text = String(data.text || '').trim().slice(0, MAX_CHAT_LENGTH)
    if (text) handleChat(text, fromId)
  })

  // Newcomers join the end of the drawing order. (Leavers are skipped in nextDrawer.)
  ctx.onPlayersChange((players) => {
    if (!game) return
    for (const p of players) {
      if (!game.order.includes(p.id)) game.order.push(p.id)
    }
  })

  return {
    stop() {
      clearInterval(timer)
    },
  }
}
