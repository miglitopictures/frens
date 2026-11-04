// Destructible terrain.
//
// The terrain is a "mask": one byte per pixel, 1 = solid, 0 = air.
// It is generated from a number (the seed), so every browser that gets the same
// seed builds exactly the same map. Only the seed travels over the network.

import { WORLD_W, WORLD_H } from './constants.js'

// Small seeded random number generator (mulberry32).
// Same seed -> same sequence of numbers, on every computer.
export function seededRandom(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createTerrain(seed) {
  const W = WORLD_W
  const H = WORLD_H
  const mask = new Uint8Array(W * H)
  const random = seededRandom(seed)

  // Surface height = a base line plus a few sine waves of different sizes.
  const waves = [
    { amp: 60 + random() * 50, freq: 1 + random() * 1.5, phase: random() * Math.PI * 2 },
    { amp: 20 + random() * 25, freq: 3 + random() * 4, phase: random() * Math.PI * 2 },
    { amp: 4 + random() * 6, freq: 12 + random() * 10, phase: random() * Math.PI * 2 },
  ]
  const EDGE = 90 // near the left/right edges the land sinks into the water

  function surfaceAt(x) {
    let h = H * 0.55
    for (const w of waves) {
      h += w.amp * Math.sin((x / W) * w.freq * Math.PI * 2 + w.phase)
    }
    const distToEdge = Math.min(x, W - 1 - x)
    if (distToEdge < EDGE) {
      const t = 1 - distToEdge / EDGE
      h += (H - h) * t * t
    }
    return Math.max(120, h)
  }

  for (let x = 0; x < W; x++) {
    const top = Math.ceil(surfaceAt(x))
    for (let y = top; y < H; y++) mask[y * W + x] = 1
  }

  const terrain = {
    mask,

    isSolid(x, y) {
      x = Math.floor(x)
      y = Math.floor(y)
      if (x < 0 || x >= W) return true // invisible side walls
      if (y < 0 || y >= H) return false // open sky above, water below
      return mask[y * W + x] === 1
    },

    // Remove a circle of terrain (explosions, caves).
    carve(cx, cy, r) {
      const x0 = Math.max(0, Math.floor(cx - r))
      const x1 = Math.min(W - 1, Math.ceil(cx + r))
      const y0 = Math.max(0, Math.floor(cy - r))
      const y1 = Math.min(H - 1, Math.ceil(cy + r))
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - cx
          const dy = y - cy
          if (dx * dx + dy * dy <= r * r) mask[y * W + x] = 0
        }
      }
    },
  }

  // A few caves under the surface, to make the map more interesting.
  const caves = 2 + Math.floor(random() * 3)
  for (let i = 0; i < caves; i++) {
    const cx = EDGE + random() * (W - EDGE * 2)
    const cy = surfaceAt(cx) + 50 + random() * 60
    terrain.carve(cx, cy, 18 + random() * 22)
  }

  return terrain
}
