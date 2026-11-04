// Room screen: top bar (link, players, toy controls) + the area where toys live.

import { MAX_PLAYERS } from '../net/room.js'
import { toys, findToy } from '../toys/registry.js'
import { runToyHost, runToyClient } from '../toys/runner.js'

export function renderRoom(app, room, { onExit }) {
  app.innerHTML = `
    <div class="room">
      <header class="bar">
        <div class="bar-row">
          <strong>Sala <span class="code"></span></strong>
          <span class="players"></span>
          <span class="spacer"></span>
          <button class="leave">Sair</button>
        </div>
        <div class="bar-row host-only">
          <input class="link" readonly />
          <button class="copy">Copiar link</button>
        </div>
      </header>

      <section class="lobby">
        <h2>Escolha um toy</h2>
        <div class="toy-list"></div>
        <p class="waiting muted">Esperando o host escolher um toy...</p>
        <button class="start">Começar</button>
      </section>

      <section class="playing">
        <div class="playing-bar host-only">
          <span class="toy-name"></span>
          <button class="back">Voltar ao lobby</button>
        </div>
        <div class="toy-root"></div>
      </section>
    </div>
  `

  const $ = (selector) => app.querySelector(selector)
  const link = location.origin + location.pathname + '#/room/' + room.code

  $('.code').textContent = room.code
  $('.link').value = link
  for (const el of app.querySelectorAll('.host-only')) el.hidden = !room.isHost
  $('.toy-list').hidden = !room.isHost
  $('.start').hidden = !room.isHost
  $('.waiting').hidden = room.isHost

  // --- toy picker (host) ---

  let selectedToyId = toys.length > 0 ? toys[0].id : null

  function renderToyList() {
    const list = $('.toy-list')
    list.innerHTML = ''
    for (const toy of toys) {
      const button = document.createElement('button')
      button.className = 'toy' + (toy.id === selectedToyId ? ' selected' : '')
      const title = document.createElement('strong')
      title.textContent = toy.name
      const description = document.createElement('span')
      description.textContent = toy.description
      button.append(title, description)
      button.addEventListener('click', () => {
        selectedToyId = toy.id
        renderToyList()
        updateStartButton()
      })
      list.append(button)
    }
  }

  function updateStartButton() {
    const toy = findToy(selectedToyId)
    const count = room.players.length
    const ok = toy && count >= toy.minPlayers && count <= toy.maxPlayers
    $('.start').disabled = !ok
    if (!toy) $('.start').textContent = 'Começar'
    else if (count < toy.minPlayers) $('.start').textContent = `Precisa de ${toy.minPlayers} jogadores`
    else if (count > toy.maxPlayers) $('.start').textContent = `Máximo de ${toy.maxPlayers} jogadores`
    else $('.start').textContent = 'Começar'
  }

  // --- players ---

  function renderPlayers() {
    const names = room.players.map((p) => p.name + (p.isHost ? ' (host)' : ''))
    $('.players').textContent = `${room.players.length}/${MAX_PLAYERS} · ${names.join(', ')}`
    updateStartButton()
  }

  // --- running a toy ---

  let hostRun = null
  let clientRun = null

  function showPhase() {
    $('.lobby').hidden = room.phase !== 'lobby'
    $('.playing').hidden = room.phase !== 'playing'
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

  $('.start').addEventListener('click', () => {
    const toy = findToy(selectedToyId)
    if (!toy) return
    // Host half first, so it is ready before any client message arrives.
    hostRun = runToyHost(room, toy)
    room.startToy(toy.id)
  })

  $('.back').addEventListener('click', () => room.stopToy())

  $('.copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(link)
      $('.copy').textContent = 'Copiado ✓'
    } catch {
      $('.link').select()
    }
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
    unmountAll()
    room.leave()
    onExit(reason)
  }

  $('.leave').addEventListener('click', () => exit(null))
  window.addEventListener('beforeunload', () => room.leave())

  // --- first render ---

  renderToyList()
  renderPlayers()
  showPhase()
  // Joined in the middle of a game: go straight into the toy.
  if (room.phase === 'playing') mountClient(room.toyId)
}
