// Home screen (create a room) and join screen (opened from a room link).

import { createRoom, joinRoom } from '../net/room.js'
import { pixelLogo } from '../console/pixel-logo.js'

function savedName() {
  try {
    return localStorage.getItem('frens:name') || ''
  } catch {
    return ''
  }
}

function saveName(name) {
  try {
    localStorage.setItem('frens:name', name)
  } catch {
    // Storage blocked (private window, etc.). Not important.
  }
}

// Shared form used by both screens.
// `onSubmit({ name, password })` must return a Promise that resolves to a room.
function renderForm(app, { title, subtitle, button, onSubmit, onRoom }) {
  // Outside a room there is no player color yet: use the default accent.
  document.documentElement.style.removeProperty('--accent')

  app.innerHTML = `
    <div class="home">
      <div class="panel">
        <h2></h2>
        <p class="muted"></p>
        <form class="form">
          <label class="label">Seu nome
            <input class="field" name="name" maxlength="20" required autocomplete="nickname" />
          </label>
          <label class="label">Senha
            <input class="field" name="password" type="password" maxlength="40" placeholder="opcional" />
          </label>
          <button class="btn primary" type="submit"><span class="key">Ⓐ</span><span class="text"></span></button>
          <p class="error" role="alert"></p>
        </form>
      </div>
      <p class="footer">FR-6 · até 6 jogadores</p>
    </div>
  `
  app.querySelector('.home').prepend(pixelLogo('FRENS', { pixel: 10 }))
  app.querySelector('h2').textContent = title
  app.querySelector('.muted').textContent = subtitle
  app.querySelector('button .text').textContent = button

  const form = app.querySelector('form')
  const nameInput = form.elements.name
  const submitButton = form.querySelector('button')
  const errorText = form.querySelector('.error')

  nameInput.value = savedName()
  ;(nameInput.value ? form.elements.password : nameInput).focus()

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const name = nameInput.value.trim()
    const password = form.elements.password.value
    if (!name) return

    saveName(name)
    submitButton.disabled = true
    errorText.textContent = ''

    try {
      const room = await onSubmit({ name, password })
      onRoom(room)
    } catch (err) {
      errorText.textContent = err.message
      submitButton.disabled = false
    }
  })
}

export function renderHome(app, { onRoom }) {
  renderForm(app, {
    title: 'Criar uma sala',
    subtitle: 'Mande o link pros amigos. Se tiver senha, diga a senha também.',
    button: 'Criar sala',
    onSubmit: ({ name, password }) => createRoom({ name, password }),
    onRoom,
  })
}

export function renderJoin(app, code, { onRoom }) {
  renderForm(app, {
    title: 'Entrar na sala ' + code,
    subtitle: 'Se a sala não tem senha, deixe o campo vazio.',
    button: 'Entrar',
    onSubmit: ({ name, password }) => joinRoom({ code, name, password }),
    onRoom,
  })
}
