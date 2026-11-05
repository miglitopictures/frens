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
  icon: {
    colors: { '.': 'paper', a: 'amber', c: 'coral', g: 'silver', k: 'ink', o: 'orange', p: 'pink', s: 'sand' },
    pixels: [
      'gggggggggggggggg',
      'g..............g',
      'g..........pp..g',
      'g.........paap.g',
      'g........aaaap.g',
      'g.......aaaao..g',
      'g......aaaao...g',
      'g.....aaaao....g',
      'g....saaao.....g',
      'g....kssa......g',
      'g...kkks.......g',
      'g.kk...........g',
      'gk..kk..k......g',
      'g.....kk.kk.cc.g',
      'g...........cc.g',
      'gggggggggggggggg',
    ],
  },
  host: garticHost,
  client: garticClient,
}
