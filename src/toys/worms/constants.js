// All the numbers of the game in one place, so they are easy to tweak.
// Units: pixels and seconds.

export const WORLD_W = 1200
export const WORLD_H = 600
export const WATER_Y = 570 // below this line is water: worms drown

export const WORMS_PER_TEAM = 3
export const WORM_RADIUS = 6

export const GRAVITY = 600 // px/s²
export const MAX_FALL_SPEED = 500
export const WALK_SPEED = 45
export const MAX_CLIMB = 2 // pixels up for each pixel forward (~63° slopes)
export const JUMP_VY = 200
export const JUMP_VX = 80

export const WIND_MAX = 100 // strongest wind
export const WIND_ACCEL = 1.5 // projectile sideways acceleration per wind unit (px/s²)

// Aiming and shooting
export const AIM_SPEED = 1.6 // radians per second while holding ↑ or ↓
export const CHARGE_TIME = 1.2 // seconds holding Space to reach full power (fires by itself)
export const MAX_SHOT_SPEED = 650 // px/s at full power
export const RETREAT_TIME = 3 // seconds to run away after the explosion

// Explosion (bazooka)
export const EXPLOSION_RADIUS = 32 // hole in the terrain
export const DAMAGE_RADIUS = 50 // worms closer than this get hurt
export const MAX_DAMAGE = 50 // at the center
export const KNOCKBACK = 320 // px/s push at the center

export const TURN_TIMES = [15, 30, 45, 60] // seconds, the host picks one
export const DEFAULT_TURN_TIME = 30

export const TICK = 1 / 60 // physics step
export const SEND_EVERY_MS = 50 // host sends state ~20 times per second

export const TEAM_COLORS = ['#e4572e', '#29335c', '#f3a712', '#669bbc', '#4c956c', '#8e5572']
