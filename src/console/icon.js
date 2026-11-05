// Draws a toy's pixel icon on a tiny canvas. CSS scales it up with sharp pixels.
//
// A toy icon is (see docs/TOYS.md):
//   icon: {
//     colors: { '.': 'paper', k: 'ink' },   // character -> palette color name
//     pixels: ['........', '..kk....', ...], // one string per row, 8x8 or 16x16
//   }
// A character missing from `colors` is a transparent pixel.

import { PALETTE } from '../hw/palette.js'

export function iconCanvas(toy, className = 'icon') {
  const canvas = document.createElement('canvas')
  canvas.className = className
  canvas.setAttribute('aria-hidden', 'true')

  const icon = toy.icon
  if (!icon) {
    canvas.width = 1
    canvas.height = 1
    return canvas
  }

  canvas.height = icon.pixels.length
  canvas.width = icon.pixels[0].length
  const g = canvas.getContext('2d')

  icon.pixels.forEach((row, y) => {
    ;[...row].forEach((char, x) => {
      const color = PALETTE[icon.colors[char]]
      if (!color) return
      g.fillStyle = color
      g.fillRect(x, y, 1, 1)
    })
  })

  return canvas
}
