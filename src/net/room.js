// The only file that talks to PeerJS.
//
// A "room" object looks the same for the host and for friends:
//
//   room.code        'k3x9q2'
//   room.me          { id, name, isHost }
//   room.isHost      true / false
//   room.players     [{ id, name, isHost }]
//   room.phase       'lobby' | 'playing'
//   room.toyId       id of the running toy, or null
//
//   room.on(event, fn)          -> returns a function that removes the listener
//   room.sendToHost(msg)        -> any player: send a message to the host
//   room.sendToClients(msg, id) -> host only: send to everyone, or to one player
//   room.startToy(toyId)        -> host only
//   room.stopToy()              -> host only
//   room.leave()
//
// Events:
//   'players'           (players)        the player list changed
//   'toyStart'          (toyId)          mount this toy
//   'toyStop'           ()               back to the lobby
//   'closed'            (reason)         the room is over for us
//   'toyMessageAtHost'  (msg, fromId)    a toy message arrived at the host
//   'toyMessageAtClient'(msg)            a toy message arrived at a client
//
// The host is also a player. Its client side talks to its host side directly,
// without the network ("local loopback"), so both follow the same code path.

import { Peer } from 'peerjs'

export const MAX_PLAYERS = 6

const ID_PREFIX = 'frens-'
const CODE_LETTERS = 'abcdefghjkmnpqrstuvwxyz23456789'

// Which PeerJS signaling server to use.
// Empty = the free public server (0.peerjs.com).
// To use your own, create a .env.local file with:
//   VITE_PEER_HOST=localhost
//   VITE_PEER_PORT=9000
function peerOptions() {
  const host = import.meta.env.VITE_PEER_HOST
  if (!host) return {}
  return {
    host,
    port: Number(import.meta.env.VITE_PEER_PORT || 443),
    secure: import.meta.env.VITE_PEER_SECURE === 'true',
    path: import.meta.env.VITE_PEER_PATH || '/',
  }
}

function randomCode() {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]
  }
  return code
}

// The parts shared by host and friend: state + a tiny event system.
function makeRoomBase(code) {
  const listeners = {}

  const room = {
    code,
    me: null,
    isHost: false,
    players: [],
    phase: 'lobby',
    toyId: null,

    on(event, fn) {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(fn)
      return () => {
        listeners[event] = listeners[event].filter((f) => f !== fn)
      }
    },

    emit(event, ...args) {
      for (const fn of listeners[event] || []) fn(...args)
    },
  }

  // What every client does with a message coming from the host.
  // Used by friends (over the network) and by the host (local loopback).
  room.handleAtClient = (msg) => {
    if (msg.kind === 'toy') {
      room.emit('toyMessageAtClient', msg)
      return
    }

    if (msg.type === 'players') {
      room.players = msg.data.players
      room.emit('players', room.players)
    } else if (msg.type === 'toyStart') {
      room.phase = 'playing'
      room.toyId = msg.data.toyId
      room.emit('toyStart', room.toyId)
    } else if (msg.type === 'toyStop') {
      room.phase = 'lobby'
      room.toyId = null
      room.emit('toyStop')
    }
  }

  return room
}

// ---------------------------------------------------------------------------
// HOST
// ---------------------------------------------------------------------------

export function createRoom({ name, password }) {
  return new Promise((resolve, reject) => {
    const code = randomCode()
    const room = makeRoomBase(code)
    const peer = new Peer(ID_PREFIX + code, peerOptions())
    const conns = {} // playerId -> PeerJS DataConnection

    room.isHost = true

    peer.on('open', (id) => {
      room.me = { id, name, isHost: true }
      room.players = [room.me]
      resolve(room)
    })

    peer.on('error', (err) => {
      console.error('[room] host error', err.type, err)
      // Only matters if we never opened. After that, errors are per-connection.
      reject(new Error('Não foi possível criar a sala (' + err.type + ')'))
    })

    peer.on('connection', (conn) => {
      conn.on('data', (msg) => handleFromFriend(conn, msg))
      conn.on('close', () => removePlayer(conn.peer))
      conn.on('error', () => removePlayer(conn.peer))
    })

    function handleFromFriend(conn, msg) {
      const fromId = conn.peer

      if (msg.kind === 'sys' && msg.type === 'hello') {
        acceptOrReject(conn, msg.data)
        return
      }

      // Ignore anything from someone who never said a valid hello.
      if (!conns[fromId]) return

      if (msg.kind === 'toy') {
        room.emit('toyMessageAtHost', msg, fromId)
      }
    }

    function acceptOrReject(conn, data) {
      if ((data.password || '') !== (password || '')) {
        conn.send({ kind: 'sys', type: 'reject', data: { reason: 'Senha errada' } })
        setTimeout(() => conn.close(), 500)
        return
      }
      if (room.players.length >= MAX_PLAYERS) {
        conn.send({ kind: 'sys', type: 'reject', data: { reason: 'A sala está cheia' } })
        setTimeout(() => conn.close(), 500)
        return
      }

      const player = { id: conn.peer, name: data.name || 'Anônimo', isHost: false }
      conns[player.id] = conn
      room.players = [...room.players, player]

      conn.send({
        kind: 'sys',
        type: 'welcome',
        data: { you: player, players: room.players, phase: room.phase, toyId: room.toyId },
      })
      broadcastPlayers()
    }

    function removePlayer(id) {
      if (!conns[id]) return
      delete conns[id]
      room.players = room.players.filter((p) => p.id !== id)
      broadcastPlayers()
    }

    function broadcastPlayers() {
      room.sendToClients({ kind: 'sys', type: 'players', data: { players: room.players } })
    }

    // --- public API (host) ---

    room.sendToHost = (msg) => {
      // Local loopback: the host's own client talking to the host.
      room.emit('toyMessageAtHost', msg, room.me.id)
    }

    room.sendToClients = (msg, toId) => {
      for (const id in conns) {
        if (toId === undefined || toId === id) conns[id].send(msg)
      }
      if (toId === undefined || toId === room.me.id) {
        room.handleAtClient(msg) // local loopback
      }
    }

    room.startToy = (toyId) => {
      room.sendToClients({ kind: 'sys', type: 'toyStart', data: { toyId } })
    }

    room.stopToy = () => {
      room.sendToClients({ kind: 'sys', type: 'toyStop', data: {} })
    }

    room.leave = () => {
      peer.destroy()
    }
  })
}

// ---------------------------------------------------------------------------
// FRIEND
// ---------------------------------------------------------------------------

export function joinRoom({ code, name, password }) {
  return new Promise((resolve, reject) => {
    const room = makeRoomBase(code)
    const peer = new Peer(peerOptions())
    let conn = null
    let joined = false
    let left = false

    function fail(reason) {
      if (!joined) reject(new Error(reason))
      else if (!left) room.emit('closed', reason)
      left = true
      peer.destroy()
    }

    peer.on('error', (err) => {
      console.error('[room] friend error', err.type, err)
      if (err.type === 'peer-unavailable') fail('Sala não encontrada')
      else fail('Erro de conexão (' + err.type + ')')
    })

    peer.on('open', () => {
      conn = peer.connect(ID_PREFIX + code, { serialization: 'json', reliable: true })

      conn.on('open', () => {
        conn.send({ kind: 'sys', type: 'hello', data: { name, password } })
      })

      conn.on('data', (msg) => {
        if (msg.kind === 'sys' && msg.type === 'welcome') {
          joined = true
          room.me = msg.data.you
          room.players = msg.data.players
          room.phase = msg.data.phase
          room.toyId = msg.data.toyId
          resolve(room)
          return
        }
        if (msg.kind === 'sys' && msg.type === 'reject') {
          fail(msg.data.reason)
          return
        }
        room.handleAtClient(msg)
      })

      conn.on('close', () => fail('O host saiu'))
    })

    // --- public API (friend) ---

    room.sendToHost = (msg) => {
      if (conn && conn.open) conn.send(msg)
    }

    room.sendToClients = () => {
      console.warn('[room] only the host can send to clients')
    }

    room.startToy = () => {}
    room.stopToy = () => {}

    room.leave = () => {
      left = true
      peer.destroy()
    }
  })
}
