// The list of every toy the platform knows about.
// To add a toy: create src/toys/<id>/index.js and add one import + one entry here.
// See docs/TOYS.md.

import cursors from './cursors/index.js'

export const toys = [
  cursors,
]

export function findToy(id) {
  return toys.find((toy) => toy.id === id)
}
