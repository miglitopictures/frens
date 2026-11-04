// Cursors: everyone sees everyone's mouse. A test toy for the platform.
//
// It has no host half: the platform forwards every message to everyone,
// so each client sends its own position and draws all the positions it receives
// (including its own, which comes back through the host).

const COLORS = ['#e4572e', '#29335c', '#f3a712', '#669bbc', '#4c956c', '#8e5572']

function colorFor(players, id) {
  const index = players.findIndex((p) => p.id === id)
  return COLORS[(index >= 0 ? index : 0) % COLORS.length]
}

export default {
  id: 'cursors',
  name: 'Cursores',
  description: 'Todo mundo vê o mouse de todo mundo. Toy de teste.',
  minPlayers: 1,
  maxPlayers: 6,

  client(ctx) {
    const canvas = document.createElement('canvas')
    canvas.width = 900
    canvas.height = 560
    canvas.style.width = '100%'
    canvas.style.background = '#fff'
    canvas.style.border = '2px solid #1a1a1a'
    canvas.style.borderRadius = '8px'
    canvas.style.cursor = 'none'
    ctx.root.append(canvas)
    const g = canvas.getContext('2d')

    // playerId -> { x, y } in 0..1 (so it works at any screen size)
    const cursors = {}

    // --- input: send our position, at most ~30 times per second ---

    let lastSent = 0
    function onMove(event) {
      const now = performance.now()
      if (now - lastSent < 33) return
      lastSent = now
      const rect = canvas.getBoundingClientRect()
      ctx.send('move', {
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
      })
    }
    canvas.addEventListener('pointermove', onMove)

    // --- network: someone moved ---

    ctx.on('move', (data, fromId) => {
      cursors[fromId] = data
    })

    ctx.onPlayersChange((players) => {
      for (const id in cursors) {
        if (!players.some((p) => p.id === id)) delete cursors[id]
      }
    })

    // --- draw ---

    let frame = 0
    function draw() {
      g.clearRect(0, 0, canvas.width, canvas.height)
      g.font = '14px system-ui, sans-serif'
      for (const id in cursors) {
        const player = ctx.players.find((p) => p.id === id)
        if (!player) continue
        const x = cursors[id].x * canvas.width
        const y = cursors[id].y * canvas.height
        g.fillStyle = colorFor(ctx.players, id)
        g.beginPath()
        g.arc(x, y, 8, 0, Math.PI * 2)
        g.fill()
        g.fillText(player.name + (id === ctx.me.id ? ' (você)' : ''), x + 12, y + 4)
      }
      frame = requestAnimationFrame(draw)
    }
    draw()

    return {
      stop() {
        cancelAnimationFrame(frame)
        canvas.removeEventListener('pointermove', onMove)
      },
    }
  },
}
