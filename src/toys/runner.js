// Runs the two halves of a toy and builds the `ctx` object each one receives.
// Toys never see the room or PeerJS, only `ctx`. See docs/TOYS.md.
//
// Toy messages on the wire look like:
//   { kind: 'toy', toyId: 'cursors', type: 'move', data: {...}, from: 'peer-id' }
// `from` is who originally sent it, so forwarded messages keep their author.

function toyMessage(toy, type, data, from) {
  return { kind: 'toy', toyId: toy.id, type, data, from }
}

// Starts the host half. Only called on the host's browser.
export function runToyHost(room, toy) {
  const handlers = {}
  const playerListeners = []

  const ctx = {
    get players() {
      return room.players
    },
    send(type, data) {
      room.sendToClients(toyMessage(toy, type, data, room.me.id))
    },
    sendTo(playerId, type, data) {
      room.sendToClients(toyMessage(toy, type, data, room.me.id), playerId)
    },
    on(type, fn) {
      handlers[type] = fn
    },
    onPlayersChange(fn) {
      playerListeners.push(fn)
    },
    end() {
      room.stopToy()
    },
  }

  const offMessage = room.on('toyMessageAtHost', (msg, fromId) => {
    if (msg.toyId !== toy.id) return

    if (toy.host) {
      const handler = handlers[msg.type]
      if (handler) handler(msg.data, fromId)
    } else {
      // Toy without a host half: forward every message to everyone.
      room.sendToClients(toyMessage(toy, msg.type, msg.data, fromId))
    }
  })

  const offPlayers = room.on('players', (players) => {
    for (const fn of playerListeners) fn(players)
  })

  const instance = toy.host ? toy.host(ctx) : null

  return {
    stop() {
      offMessage()
      offPlayers()
      if (instance && instance.stop) instance.stop()
    },
  }
}

// Starts the client half. Called on every browser, including the host's.
export function runToyClient(room, toy, root) {
  const handlers = {}
  const playerListeners = []

  const ctx = {
    root,
    me: room.me,
    get players() {
      return room.players
    },
    send(type, data) {
      room.sendToHost(toyMessage(toy, type, data, room.me.id))
    },
    on(type, fn) {
      handlers[type] = fn
    },
    onPlayersChange(fn) {
      playerListeners.push(fn)
    },
  }

  const offMessage = room.on('toyMessageAtClient', (msg) => {
    if (msg.toyId !== toy.id) return
    const handler = handlers[msg.type]
    if (handler) handler(msg.data, msg.from)
  })

  const offPlayers = room.on('players', (players) => {
    for (const fn of playerListeners) fn(players)
  })

  const instance = toy.client(ctx)

  return {
    stop() {
      offMessage()
      offPlayers()
      if (instance && instance.stop) instance.stop()
      root.innerHTML = ''
    },
  }
}
