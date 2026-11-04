// Worms clone: teams of 3 worms, turns, destructible terrain, wind.
//
//   constants.js  all the numbers (sizes, speeds, times)
//   terrain.js    map generated from a seed + carve() for craters
//   physics.js    worm movement and collision (host only)
//   host.js       game state, turns, simulation loop
//   client.js     drawing and keyboard input

import { wormsHost } from './host.js'
import { wormsClient } from './client.js'

export default {
  id: 'worms',
  name: 'Minhocas',
  description: 'Times de 3 minhocas, por turnos, com terreno destrutível.',
  minPlayers: 1, // 1 = practice mode, walk around alone
  maxPlayers: 6,
  host: wormsHost,
  client: wormsClient,
}
