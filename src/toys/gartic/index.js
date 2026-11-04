// Gartic clone: one player draws, the others guess.
//
//   constants.js  sizes, colors, times
//   host.js       turn order, timers, drawing log
//   client.js     canvas, tools and screens

import { garticHost } from './host.js'
import { garticClient } from './client.js'

export default {
  id: 'gartic',
  name: 'Gartic',
  description: 'Um desenha, os outros adivinham.',
  minPlayers: 2,
  maxPlayers: 6,
  host: garticHost,
  client: garticClient,
}
