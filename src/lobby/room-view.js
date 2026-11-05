// Room screen:
//   status bar   room code, 6 player slots, copy link, clock, leave
//   lobby        player cards + toy carousel (host) or a waiting message (friends)
//   playing      the running toy, inside the screen bezel

import { MAX_PLAYERS } from '../net/room.js'
import { toys, findToy } from '../toys/registry.js'
import { runToyHost, runToyClient } from '../toys/runner.js'
import { playerColor } from '../hw/palette.js'
import { iconCanvas } from '../console/icon.js'

export function renderRoom(app, room, { onExit }) {
  app.innerHTML = `
    <div class="room">
      <header class="status">
        <span class="chip">Sala <strong class="code"></strong></span>
        <span class="slots"></span>
        <strong class="toy-name"></strong>
        <span class="spacer"></span>
        <button class="btn small back">Voltar ao lobby</button>
        <button class="btn small copy host-only">Copiar link</button>
        <span class="clock"></span>
        <button class="btn small leave">Sair</button>
      </header>

      <section class="lobby">
        <ul class="players"></ul>

        <div class="picker host-only">
          <div class="banner"></div>
          <div class="carousel" role="listbox" aria-label="Toys"></div>
          <div class="actions">
            <button class="btn primary start"><span class="key">Ⓐ</span><span class="text">Começar</span></button>
            <span class="hint">← → escolher · Ⓐ (Z) começar</span>
          </div>
        </div>

        <p class="waiting panel friend-only">Esperando o host escolher um toy…</p>
      </section>

      <section class="playing">
        <div class="bezel"><div class="toy-root"></div></div>
      </section>
    </div>
  `

  const $ = (selector) => app.querySelector(selector)
  const link = location.origin + location.pathname + '#/room/' + room.code

  // Your player color is the console's accent color.
  document.documentElement.style.setProperty('--accent', playerColor(room.me.color))

  $('.code').textContent = room.code
  for (const el of app.querySelectorAll('.host-only')) el.hidden = !room.isHost
  for (const el of app.querySelectorAll('.friend-only')) el.hidden = room.isHost

  // --- clock ---

  function renderClock() {
    $('.clock').textContent = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  const clockTimer = setInterval(renderClock, 10000)

  // --- players: status bar slots + lobby cards ---
  // Slots are ordered by color (player.color is a fixed slot 0..5).

  function renderPlayers() {
    const slots = $('.slots')
    const cards = $('.players')
    slots.innerHTML = ''
    cards.innerHTML = ''

    for (let slot = 0; slot < MAX_PLAYERS; slot++) {
      const player = room.players.find((p) => p.color === slot)

      const dot = document.createElement('span')
      dot.className = player ? 'slot on' : 'slot'
      dot.style.setProperty('--c', playerColor(slot))
      dot.title = player ? player.name : 'livre'
      slots.append(dot)

      const card = document.createElement('li')
      card.className = player ? 'player' : 'player empty'
      card.style.setProperty('--c', playerColor(slot))
      if (player) {
        // Your own card gets a ring in your color.
        if (player.id === room.me.id) card.classList.add('me')
        const name = document.createElement('strong')
        name.textContent = player.name
        card.append(name)
        if (player.isHost) {
          const tag = document.createElement('span')
          tag.className = 'tag'
          tag.textContent = 'host'
          card.append(tag)
        }
      } else {
        card.textContent = 'livre'
      }
      cards.append(card)
    }

    $('.slots').setAttribute('aria-label', `${room.players.length} de ${MAX_PLAYERS} jogadores`)
    updateStartButton()
  }

  // --- toy picker (host) ---

  let selectedIndex = 0
  const carts = []

  function buildCarousel() {
    const list = $('.carousel')
    toys.forEach((toy, i) => {
      const cart = document.createElement('button')
      cart.className = 'cart'
      cart.setAttribute('role', 'option')
      cart.setAttribute('aria-label', toy.name)
      cart.append(iconCanvas(toy))
      cart.addEventListener('click', () => select(i))
      list.append(cart)
      carts.push(cart)
    })
  }

  function select(index) {
    if (toys.length === 0) return
    selectedIndex = Math.max(0, Math.min(toys.length - 1, index))
    carts.forEach((cart, i) => {
      cart.classList.toggle('selected', i === selectedIndex)
      cart.setAttribute('aria-selected', i === selectedIndex)
    })
    carts[selectedIndex].scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
    renderBanner()
    updateStartButton()
  }

  function renderBanner() {
    const banner = $('.banner')
    const toy = toys[selectedIndex]
    banner.innerHTML = ''
    if (!toy) {
      banner.textContent = 'Nenhum toy instalado'
      return
    }

    const info = document.createElement('div')
    info.className = 'info'
    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = toy.name
    const description = document.createElement('span')
    description.className = 'desc'
    description.textContent = toy.description
    const count = document.createElement('span')
    count.className = 'count'
    count.textContent =
      toy.minPlayers === toy.maxPlayers
        ? `${toy.minPlayers} jogadores`
        : `${toy.minPlayers}–${toy.maxPlayers} jogadores`
    info.append(name, description, count)
    banner.append(iconCanvas(toy, 'icon big'), info)

    // Restart the small "swap" animation.
    banner.classList.remove('swap')
    void banner.offsetWidth
    banner.classList.add('swap')
  }

  function updateStartButton() {
    const toy = toys[selectedIndex]
    const count = room.players.length
    const ok = toy && count >= toy.minPlayers && count <= toy.maxPlayers
    const text = $('.start .text')
    $('.start').disabled = !ok
    if (!toy) text.textContent = 'Começar'
    else if (count < toy.minPlayers) text.textContent = `Precisa de ${toy.minPlayers} jogadores`
    else if (count > toy.maxPlayers) text.textContent = `Máximo de ${toy.maxPlayers} jogadores`
    else text.textContent = 'Começar'
  }

  function startSelectedToy() {
    const toy = toys[selectedIndex]
    if (!toy || $('.start').disabled) return
    // Host half first, so it is ready before any client message arrives.
    hostRun = runToyHost(room, toy)
    room.startToy(toy.id)
  }

  // Keyboard in the lobby: ← → pick a toy, Ⓐ (Z) starts.
  // Space / Enter also start, unless a button has focus (then they press that button).
  function onKey(event) {
    if (!room.isHost || room.phase !== 'lobby') return
    if (event.target.closest('input, textarea, select')) return

    if (event.key === 'ArrowLeft') select(selectedIndex - 1)
    else if (event.key === 'ArrowRight') select(selectedIndex + 1)
    else if (event.key === 'z' || event.key === 'Z') startSelectedToy()
    else if ((event.key === ' ' || event.key === 'Enter') && !event.target.closest('button')) {
      event.preventDefault()
      startSelectedToy()
    }
  }
  window.addEventListener('keydown', onKey)

  // --- running a toy ---

  let hostRun = null
  let clientRun = null

  function showPhase() {
    const playing = room.phase === 'playing'
    $('.lobby').hidden = playing
    $('.playing').hidden = !playing
    $('.toy-name').hidden = !playing
    $('.back').hidden = !(playing && room.isHost)
    // While playing, the page uses the full width so the screen can scale up.
    app.classList.toggle('wide', playing)
  }

  function mountClient(toyId) {
    const toy = findToy(toyId)
    if (!toy) {
      $('.toy-root').textContent = 'Toy desconhecido: ' + toyId
      return
    }
    $('.toy-name').textContent = toy.name
    clientRun = runToyClient(room, toy, $('.toy-root'))
  }

  function unmountAll() {
    if (clientRun) clientRun.stop()
    if (hostRun) hostRun.stop()
    clientRun = null
    hostRun = null
  }

  $('.start').addEventListener('click', startSelectedToy)
  $('.back').addEventListener('click', () => room.stopToy())

  $('.copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(link)
      $('.copy').textContent = 'Copiado ✓'
    } catch {
      // Clipboard blocked: show the link so it can be copied by hand.
      prompt('Copie o link:', link)
    }
    setTimeout(() => ($('.copy').textContent = 'Copiar link'), 1500)
  })

  // --- room events ---

  const offs = [
    room.on('players', renderPlayers),
    room.on('toyStart', (toyId) => {
      showPhase()
      mountClient(toyId)
    }),
    room.on('toyStop', () => {
      unmountAll()
      showPhase()
    }),
    room.on('closed', (reason) => exit(reason)),
  ]

  function exit(reason) {
    for (const off of offs) off()
    app.classList.remove('wide')
    window.removeEventListener('keydown', onKey)
    clearInterval(clockTimer)
    unmountAll()
    room.leave()
    onExit(reason)
  }

  $('.leave').addEventListener('click', () => exit(null))
  window.addEventListener('beforeunload', () => room.leave())

  // --- first render ---

  renderClock()
  buildCarousel()
  select(0)
  renderPlayers()
  showPhase()
  // Joined in the middle of a game: go straight into the toy.
  if (room.phase === 'playing') mountClient(room.toyId)
}
