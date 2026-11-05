// Entry point and tiny router.
//
//   (no hash)          -> home: create a room
//   #/room/<code>      -> join screen for that room
//
// The host's own URL does not change after creating a room. If it did, a page
// refresh would make the host try to join its own (now gone) room.

import { renderHome, renderJoin } from './lobby/home.js'
import { renderRoom } from './lobby/room-view.js'
import { boot } from './console/boot.js'

const app = document.querySelector('#app')

function roomCodeFromHash() {
  const match = location.hash.match(/^#\/room\/([a-z0-9]+)$/)
  return match ? match[1] : null
}

function showRoom(room) {
  renderRoom(app, room, { onExit: goHome })
}

function goHome(reason) {
  history.replaceState(null, '', location.pathname)
  renderHome(app, { onRoom: showRoom })
  if (reason) app.querySelector('.error').textContent = reason
}

function start() {
  const code = roomCodeFromHash()
  if (code) renderJoin(app, code, { onRoom: showRoom })
  else renderHome(app, { onRoom: showRoom })
}

start()
boot() // plays on top of the screen that is already rendered
