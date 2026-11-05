// The FR-6 boot: the logo builds itself out of pixels, then a short chime.
//
// - Plays once per browser session (sessionStorage).
// - Any key or click skips it.
// - Skipped when the system asks for reduced motion.
// - It is an overlay on top of the app, so the app is already ready underneath.
//
// Note: browsers block sound until the user clicks or presses a key on the page,
// so on a first visit the chime is usually silent. That's fine.

import { pixelLogo } from './pixel-logo.js'

const SEEN_KEY = 'frens:booted'
const CHIME_AT = 900 // ms
const DONE_AT = 1300 // ms, then a 220ms fade

function alreadyBooted() {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

function markBooted() {
  try {
    sessionStorage.setItem(SEEN_KEY, '1')
  } catch {
    // Storage blocked. The boot will just play again next time.
  }
}

export function boot() {
  if (alreadyBooted()) return
  markBooted()
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const overlay = document.createElement('div')
  overlay.className = 'boot'
  const model = document.createElement('p')
  model.className = 'boot-model'
  model.textContent = 'FR-6'
  overlay.append(pixelLogo('FRENS', { pixel: 14, animate: true }), model)
  document.body.append(overlay)

  const timers = [setTimeout(chime, CHIME_AT), setTimeout(finish, DONE_AT)]

  function finish() {
    timers.forEach(clearTimeout)
    window.removeEventListener('keydown', finish)
    window.removeEventListener('pointerdown', finish)
    overlay.classList.add('done')
    setTimeout(() => overlay.remove(), 220)
  }

  window.addEventListener('keydown', finish)
  window.addEventListener('pointerdown', finish)
}

// Two short square-wave notes, DS style.
function chime() {
  try {
    const audio = new AudioContext()
    if (audio.state !== 'running') {
      audio.close()
      return
    }
    note(audio, 1318.5, 0, 0.12) // E6
    note(audio, 1975.5, 0.1, 0.35) // B6
    setTimeout(() => audio.close(), 800)
  } catch {
    // No Web Audio. No chime.
  }
}

function note(audio, frequency, at, length) {
  const start = audio.currentTime + at
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = 'square'
  osc.frequency.value = frequency
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(0.05, start + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length)
  osc.connect(gain).connect(audio.destination)
  osc.start(start)
  osc.stop(start + length + 0.02)
}
