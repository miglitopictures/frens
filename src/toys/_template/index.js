// Toy template. Copy this folder to start a new toy.
// It is NOT in the registry, so it never shows up in the app.
//
// A toy has two halves:
//   host(ctx)   runs ONLY on the host's browser. It owns the truth (state, rules, score).
//   client(ctx) runs on EVERY browser, including the host's. It draws the UI and sends input.
//
// Clients talk only to the host. The host talks to clients.
// Full contract: docs/TOYS.md

export default {
  id: 'template',
  name: 'Template',
  description: 'Um toy de exemplo',
  minPlayers: 1,
  maxPlayers: 6,

  host(ctx) {
    // ctx.players                    -> [{ id, name, isHost }]
    // ctx.send(type, data)           -> send to all clients
    // ctx.sendTo(playerId, type, data) -> send to one client
    // ctx.on(type, (data, fromId) => {}) -> receive from clients
    // ctx.onPlayersChange((players) => {})
    // ctx.end()                      -> go back to the lobby

    let count = 0

    ctx.on('click', (data, fromId) => {
      count += 1
      ctx.send('count', { count, lastClickBy: fromId })
    })

    // Someone joined mid-game: send them the current state.
    ctx.onPlayersChange((players) => {
      ctx.send('count', { count, lastClickBy: null })
    })

    return {
      stop() {
        // Clear timers, intervals, etc.
      },
    }
  },

  client(ctx) {
    // ctx.root                        -> <div> that belongs to this toy
    // ctx.me                          -> { id, name, isHost }
    // ctx.players                     -> [{ id, name, isHost }]
    // ctx.send(type, data)            -> send to the host
    // ctx.on(type, (data, fromId) => {}) -> receive from the host (fromId = original sender)
    // ctx.onPlayersChange((players) => {})

    ctx.root.innerHTML = `
      <button>Clique</button>
      <p>Cliques: <span>0</span></p>
    `
    const button = ctx.root.querySelector('button')
    const label = ctx.root.querySelector('span')

    button.addEventListener('click', () => {
      ctx.send('click', {})
    })

    ctx.on('count', (data) => {
      label.textContent = data.count
    })

    return {
      stop() {
        ctx.root.innerHTML = ''
      },
    }
  },
}
