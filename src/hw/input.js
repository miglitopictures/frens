// The FR-6 buttons. Every toy uses the same keys (docs/STYLEGUIDE.md):
//
//   up / down / left / right   arrows or W A S D
//   a                          Z or Space
//   b                          X
//   start                      Enter
//
//   const input = createInput()
//   if (input.held.left) ...                 // is it down right now?
//   input.onPress((button) => { ... })       // called once when a button goes down
//   input.onRelease((button) => { ... })     // called once when it goes up
//   input.destroy()                          // in stop()
//
// While a text field (input, textarea) has focus, keys go to the field, not to the buttons.
// The stylus (mouse / touch) is not here: use pointer events with screen.toScreen().

const KEYS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  W: 'up',
  s: 'down',
  S: 'down',
  a: 'left',
  A: 'left',
  d: 'right',
  D: 'right',
  z: 'a',
  Z: 'a',
  ' ': 'a',
  x: 'b',
  X: 'b',
  Enter: 'start',
}

export const BUTTONS = ['up', 'down', 'left', 'right', 'a', 'b', 'start']

function isTyping(target) {
  return target && target.closest && target.closest('input, textarea, select')
}

export function createInput() {
  const held = {}
  for (const button of BUTTONS) held[button] = false
  const pressListeners = []
  const releaseListeners = []

  function onKeyDown(event) {
    if (isTyping(event.target)) return
    const button = KEYS[event.key]
    if (!button) return
    event.preventDefault() // no page scrolling with arrows / space
    if (held[button]) return // key repeat
    held[button] = true
    for (const fn of pressListeners) fn(button)
  }

  function onKeyUp(event) {
    const button = KEYS[event.key]
    if (!button || !held[button]) return
    held[button] = false
    for (const fn of releaseListeners) fn(button)
  }

  // Window lost focus: let go of everything, so nothing stays stuck down.
  function releaseAll() {
    for (const button of BUTTONS) {
      if (!held[button]) continue
      held[button] = false
      for (const fn of releaseListeners) fn(button)
    }
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', releaseAll)

  return {
    held,
    onPress(fn) {
      pressListeners.push(fn)
    },
    onRelease(fn) {
      releaseListeners.push(fn)
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', releaseAll)
    },
  }
}
