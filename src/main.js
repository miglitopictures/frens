// Entry point.
// For now it only proves that the toy registry loads.
// Step 2 will turn this into a small router: home screen <-> room screen.

import { toys } from './toys/registry.js'

const app = document.querySelector('#app')

app.innerHTML = `
  <h1>Frens</h1>
  <p>Toys registrados: ${toys.length}</p>
`
