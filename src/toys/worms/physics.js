// Worm movement and collision. Runs only on the host.
//
// A worm is a circle. To know if it touches the ground we test 8 points
// around that circle against the terrain mask.

import {
  WORM_RADIUS,
  GRAVITY,
  MAX_FALL_SPEED,
  WALK_SPEED,
  MAX_CLIMB,
  JUMP_VY,
  JUMP_VX,
} from './constants.js'

const R = WORM_RADIUS
const D = WORM_RADIUS * 0.7
const POINTS = [
  [0, R], [0, -R], [R, 0], [-R, 0],
  [D, D], [-D, D], [D, -D], [-D, -D],
]

export function collides(terrain, x, y) {
  for (const [dx, dy] of POINTS) {
    if (terrain.isSolid(x + dx, y + dy)) return true
  }
  return false
}

export function isOnGround(terrain, worm) {
  return collides(terrain, worm.x, worm.y + 1)
}

// Moves the worm along one axis, 1 pixel at a time, stopping at walls/floor.
// Returns true if it hit something.
function moveAxis(terrain, worm, axis, amount) {
  const steps = Math.ceil(Math.abs(amount))
  if (steps === 0) return false
  const step = amount / steps

  for (let i = 0; i < steps; i++) {
    const nx = axis === 'x' ? worm.x + step : worm.x
    const ny = axis === 'y' ? worm.y + step : worm.y
    if (collides(terrain, nx, ny)) {
      if (axis === 'x') worm.vx = 0
      else worm.vy = 0
      return true
    }
    worm.x = nx
    worm.y = ny
  }
  return false
}

function walkOnePixel(terrain, worm, dir) {
  const nx = worm.x + dir
  for (let climb = 0; climb <= MAX_CLIMB; climb++) {
    if (!collides(terrain, nx, worm.y - climb)) {
      worm.x = nx
      worm.y -= climb
      // Stick to the ground when walking downhill.
      for (let i = 0; i <= MAX_CLIMB; i++) {
        if (collides(terrain, worm.x, worm.y + 1)) break
        worm.y += 1
      }
      return true
    }
  }
  return false
}

// input = { left, right } (only the active worm gets real input)
export function stepWorm(terrain, worm, input, dt) {
  // Stuck inside the terrain? Push it up a little each frame until it is free.
  if (collides(terrain, worm.x, worm.y)) {
    worm.y -= 1
    worm.vy = 0
    return
  }

  const grounded = isOnGround(terrain, worm) && worm.vy >= 0

  // Walking: only on the ground, one whole pixel at a time.
  // For each pixel forward the worm may climb up to MAX_CLIMB pixels,
  // so steep slopes are fine but walls are not.
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  if (grounded && dir !== 0) {
    worm.vx = 0
    worm.facing = dir
    worm.walkPending = (worm.walkPending || 0) + dir * WALK_SPEED * dt

    while (Math.abs(worm.walkPending) >= 1) {
      worm.walkPending -= dir
      if (!walkOnePixel(terrain, worm, dir)) {
        worm.walkPending = 0 // blocked by a wall
        break
      }
    }
  } else {
    worm.walkPending = 0
  }

  // Gravity and velocity (jumps, and later explosions).
  // Vertical first, so a jump leaves the ground before moving sideways
  // (otherwise jumping towards a slope hits the slope right away).
  worm.vy = Math.min(worm.vy + GRAVITY * dt, MAX_FALL_SPEED)
  const hitY = moveAxis(terrain, worm, 'y', worm.vy * dt)
  if (hitY) worm.vx = 0 // landed (or hit a ceiling): stop sliding
  moveAxis(terrain, worm, 'x', worm.vx * dt)
}

export function jump(terrain, worm) {
  if (!isOnGround(terrain, worm)) return
  worm.vy = -JUMP_VY
  worm.vx = worm.facing * JUMP_VX
}
