// Worm movement and collision. Runs only on the host.
//
// A worm is a circle. To know if it touches the ground we test 8 points
// around that circle against the terrain mask.

import {
  WORLD_W,
  WATER_Y,
  WORM_RADIUS,
  GRAVITY,
  MAX_FALL_SPEED,
  WALK_SPEED,
  MAX_CLIMB,
  JUMP_VY,
  JUMP_VX,
  WIND_ACCEL,
  EXPLOSION_RADIUS,
  DAMAGE_RADIUS,
  MAX_DAMAGE,
  KNOCKBACK,
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

// --- projectiles and explosions ---

// Moves a projectile one tick. Gravity pulls it down, wind pushes it sideways.
// Returns:
//   null        still flying
//   'lost'      left the map or fell in the water
//   { x, y }    hit the terrain or a worm: explode here
export function stepProjectile(terrain, shot, wind, worms, dt) {
  shot.vx += wind * WIND_ACCEL * dt
  shot.vy += GRAVITY * dt
  shot.age += dt

  // Move in small steps (2 px) so fast shots don't pass through thin walls.
  const distance = Math.hypot(shot.vx, shot.vy) * dt
  const steps = Math.max(1, Math.ceil(distance / 2))

  for (let i = 0; i < steps; i++) {
    shot.x += (shot.vx * dt) / steps
    shot.y += (shot.vy * dt) / steps

    if (shot.x < 0 || shot.x >= WORLD_W || shot.y > WATER_Y) return 'lost'
    if (shot.y >= 0 && terrain.isSolid(shot.x, shot.y)) return { x: shot.x, y: shot.y }

    for (const worm of worms) {
      if (!worm.alive) continue
      // Don't explode on the shooter right as it leaves the barrel.
      if (worm.id === shot.ownerId && shot.age < 0.2) continue
      if (Math.hypot(worm.x - shot.x, worm.y - shot.y) < WORM_RADIUS + 2) {
        return { x: shot.x, y: shot.y }
      }
    }
  }
  return null
}

// Opens a crater and hurts/pushes the worms nearby.
// Closer to the center = more damage and a stronger push.
export function explode(terrain, worms, x, y) {
  terrain.carve(x, y, EXPLOSION_RADIUS)

  for (const worm of worms) {
    if (!worm.alive) continue
    const dx = worm.x - x
    const dy = worm.y - y
    const distance = Math.hypot(dx, dy)
    if (distance >= DAMAGE_RADIUS) continue

    const strength = 1 - distance / DAMAGE_RADIUS
    worm.hp = Math.max(0, worm.hp - Math.round(MAX_DAMAGE * strength))
    if (worm.hp === 0) worm.alive = false

    // Push away from the center, and always a bit upwards so it flies.
    const length = distance || 1
    worm.vx += (dx / length) * KNOCKBACK * strength
    worm.vy = Math.min((dy / length) * KNOCKBACK * strength, 0) - 150 * strength
  }
}
