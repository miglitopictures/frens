// Host half of Gartic: turn order, timers and the drawing log.
//
// Messages
//   client -> host:  hi {}                       (just mounted, send me the game)
//                    start { rounds, drawTime }  (host's client only)
//                    draw { color, size, points } (drawer only: a piece of a stroke)
//                    clear {}                    (drawer only)
//                    again {}                    (host's client only: back to setup)
//   host -> client:  setup {}
//                    state { phase, round, rounds, drawerId, timeLeft }
//                    draw { color, size, points }
//                    strokes { list }            (the whole drawing, for late joiners)
//                    clear {}
//
// Phases:  drawing  ->  between (shows "end of turn")  ->  drawing ... -> over

import {
  ROUND_OPTIONS,
  DEFAULT_ROUNDS,
  DRAW_TIME_OPTIONS,
  DEFAULT_DRAW_TIME,
  BETWEEN_TURNS,
} from './constants.js'

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

  function now() {
    return performance.now()
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
    if (!nextDrawer()) {
      game.phase = 'over'
      game.drawerId = null
      sendState()
      return
    }
    game.phase = 'drawing'
    game.endsAt = now() + game.drawTime * 1000
    game.strokes = []
    ctx.send('clear', {})
    sendState()
  }

  function endTurn() {
    game.phase = 'between'
    game.endsAt = now() + BETWEEN_TURNS * 1000
    sendState()
  }

  // Checked 4 times per second.
  function tick() {
    if (!game || game.phase === 'over') return

    if (game.phase === 'drawing' && !isPresent(game.drawerId)) {
      endTurn() // the drawer left
    } else if (now() >= game.endsAt) {
      if (game.phase === 'drawing') endTurn()
      else startTurn()
    } else {
      sendState() // keeps the countdown fresh
    }
  }

  function stateMessage() {
    return {
      phase: game.phase,
      round: Math.min(game.round, game.rounds),
      rounds: game.rounds,
      drawerId: game.drawerId,
      timeLeft: Math.max(0, Math.ceil((game.endsAt - now()) / 1000)),
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
      phase: 'drawing',
      rounds: ROUND_OPTIONS.includes(data.rounds) ? data.rounds : DEFAULT_ROUNDS,
      drawTime: DRAW_TIME_OPTIONS.includes(data.drawTime) ? data.drawTime : DEFAULT_DRAW_TIME,
      order: ctx.players.map((p) => p.id),
      round: 1,
      turnIndex: -1,
      drawerId: null,
      endsAt: 0,
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
