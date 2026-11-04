// Home screen (create a room) and join screen (opened from a room link).

import { createRoom, joinRoom } from '../net/room.js'

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
  app.innerHTML = `
    <div class="card">
      <h1>Frens</h1>
      <h2></h2>
      <p class="muted"></p>
      <form>
        <label>Seu nome
          <input name="name" maxlength="20" required />
        </label>
        <label>Senha
          <input name="password" type="password" maxlength="40" />
        </label>
        <button type="submit"></button>
        <p class="error"></p>
      </form>
    </div>
  `
  app.querySelector('h2').textContent = title
  app.querySelector('.muted').textContent = subtitle
  app.querySelector('button').textContent = button

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
    subtitle: 'Até 6 pessoas. A senha é opcional: mande o link e diga a senha pros amigos.',
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
