// Host half of Worms: owns the game state and runs the physics.
//
// Messages
//   client -> host:  hi {}              (just mounted, send me the game)
//                    start { turnTime } (host's client only)
//                    input { left, right, up, down }
//                    jump {}
//                    charge {}          (Ⓐ pressed: start charging)
//                    fire {}            (Ⓐ released: shoot)
//                    again {}           (host's client only: back to setup)
//   host -> client:  setup {}           (show the setup screen)
//                    game { seed, craters, teams, turnTime }   (static info)
//                    state { phase, worms, activeWormId, timeLeft, wind,
//                            shot, charge, fired, winner }
//                    boom { x, y, r }   (an explosion: carve the terrain)
//
// A turn:  move/aim  ->  hold Ⓐ (charge)  ->  release (shot flies)
//          ->  explosion  ->  RETREAT_TIME seconds to run  ->  next turn

import { createTerrain } from './terrain.js'
import { stepWorm, jump, collides, stepProjectile, explode } from './physics.js'
import {
  WORLD_W,
  WATER_Y,
  WORMS_PER_TEAM,
  WORM_RADIUS,
  WIND_MAX,
  AIM_SPEED,
  CHARGE_TIME,
  MAX_SHOT_SPEED,
  RETREAT_TIME,
  EXPLOSION_RADIUS,
  TURN_TIMES,
  DEFAULT_TURN_TIME,
  TICK,
  SEND_EVERY_MS,
} from './constants.js'
import { playerColorName } from '../../hw/palette.js'

const NO_INPUT = { left: false, right: false, up: false, down: false }

export function wormsHost(ctx) {
  let game = null // null = setup screen
  let input = NO_INPUT
  let loop = null

  function isHostPlayer(id) {
    const player = ctx.players.find((p) => p.id === id)
    return Boolean(player && player.isHost)
  }

  function activeWorm() {
    return game.worms.find((w) => w.id === game.activeWormId)
  }

  function isActivePlayer(id) {
    if (!game || game.phase !== 'playing') return false
    const worm = activeWorm()
    return Boolean(worm && game.teams[worm.team].playerId === id)
  }

  // --- creating a game ---

  function newGame(turnTime) {
    const seed = Math.floor(Math.random() * 2 ** 31)
    const terrain = createTerrain(seed)

    const teams = ctx.players.map((player) => ({
      playerId: player.id,
      name: player.name,
      color: playerColorName(player.color), // palette name, e.g. 'sky'
      next: 0, // which of its worms plays next
    }))

    const worms = []
    teams.forEach((team, teamIndex) => {
      for (let i = 0; i < WORMS_PER_TEAM; i++) {
        const spot = findSpawn(terrain, worms)
        worms.push({
          id: worms.length,
          team: teamIndex,
          name: team.name + ' ' + (i + 1),
          x: spot.x,
          y: spot.y,
          vx: 0,
          vy: 0,
          hp: 100,
          alive: true,
          facing: Math.random() < 0.5 ? -1 : 1,
          aim: -0.4, // radians: 0 = straight ahead, negative = up
        })
      }
    })

    return {
      phase: 'playing',
      seed,
      terrain, // host only, never sent
      craters: [],
      turnTime,
      teams,
      worms,
      turnTeam: -1,
      activeWormId: null,
      turnEndsAt: 0,
      wind: 0,
      chargeStartedAt: null, // set while Space is held
      fired: false, // already shot this turn?
      shot: null, // the projectile in the air
      winner: null,
    }
  }

  // Random spot on the surface, above water, not too close to other worms.
  function findSpawn(terrain, worms) {
    for (let tries = 0; tries < 200; tries++) {
      const x = 100 + Math.random() * (WORLD_W - 200)
      let y = 0
      while (!terrain.isSolid(x, y) && y < WATER_Y) y++
      if (y >= WATER_Y - 10) continue
      const tooClose = worms.some((w) => Math.abs(w.x - x) < 40)
      if (tooClose && tries < 150) continue
      y = y - WORM_RADIUS - 1
      // On a steep slope the sides of the worm may still touch: go up until free.
      while (collides(terrain, x, y) && y > 0) y--
      return { x, y }
    }
    return { x: WORLD_W / 2, y: 50 }
  }

  // --- turns ---

  function startNextTurn() {
    const teams = game.teams
    game.chargeStartedAt = null
    game.fired = false
    game.shot = null
    input = NO_INPUT

    for (let i = 1; i <= teams.length; i++) {
      const teamIndex = (game.turnTeam + i) % teams.length
      const worm = nextWormOf(teamIndex)
      if (worm) {
        game.turnTeam = teamIndex
        game.activeWormId = worm.id
        game.turnEndsAt = performance.now() + game.turnTime * 1000
        game.wind = Math.round((Math.random() * 2 - 1) * WIND_MAX)
        return
      }
    }
    game.activeWormId = null
  }

  function nextWormOf(teamIndex) {
    const team = game.teams[teamIndex]
    const teamWorms = game.worms.filter((w) => w.team === teamIndex)
    for (let k = 0; k < teamWorms.length; k++) {
      const index = (team.next + k) % teamWorms.length
      if (teamWorms[index].alive) {
        team.next = index + 1
        return teamWorms[index]
      }
    }
    return null
  }

  function checkWinner() {
    const aliveTeams = game.teams.filter((team, i) =>
      game.worms.some((w) => w.team === i && w.alive),
    )
    const someoneWon = game.teams.length > 1 && aliveTeams.length <= 1
    const soloOver = game.teams.length === 1 && aliveTeams.length === 0
    if (someoneWon || soloOver) {
      game.phase = 'over'
      game.winner = aliveTeams.length === 1 ? aliveTeams[0].name : null
      game.activeWormId = null
      game.shot = null
    }
  }

  // --- shooting ---

  function chargeAmount() {
    if (game.chargeStartedAt === null) return null
    const seconds = (performance.now() - game.chargeStartedAt) / 1000
    return Math.min(1, seconds / CHARGE_TIME)
  }

  function fire() {
    const worm = activeWorm()
    const power = Math.max(0.05, chargeAmount())
    const dirX = Math.cos(worm.aim) * worm.facing
    const dirY = Math.sin(worm.aim)
    game.shot = {
      x: worm.x + dirX * (WORM_RADIUS + 3),
      y: worm.y + dirY * (WORM_RADIUS + 3),
      vx: dirX * power * MAX_SHOT_SPEED,
      vy: dirY * power * MAX_SHOT_SPEED,
      age: 0,
      ownerId: worm.id,
    }
    game.fired = true
    game.chargeStartedAt = null
  }

  // After the shot is over, the shooter gets a few seconds to run away.
  function startRetreat() {
    game.shot = null
    game.turnEndsAt = performance.now() + RETREAT_TIME * 1000
  }

  // --- simulation ---

  function step(dt) {
    if (game.phase !== 'playing') return
    const active = activeWorm()

    // Aiming (before shooting only).
    if (active && active.alive && !game.fired) {
      const turn = (input.down ? 1 : 0) - (input.up ? 1 : 0)
      active.aim = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, active.aim + turn * AIM_SPEED * dt))
    }

    // Holding Space too long fires at full power.
    if (game.chargeStartedAt !== null && chargeAmount() >= 1) fire()

    // Worms. The active one can't walk while charging or while its shot flies.
    const frozen = game.chargeStartedAt !== null || game.shot !== null
    for (const worm of game.worms) {
      if (!worm.alive) continue
      const wormInput = worm.id === game.activeWormId && !frozen ? input : NO_INPUT
      stepWorm(game.terrain, worm, wormInput, dt)
      if (worm.y > WATER_Y) {
        worm.alive = false
        worm.hp = 0
      }
    }

    // The projectile.
    if (game.shot) {
      const result = stepProjectile(game.terrain, game.shot, game.wind, game.worms, dt)
      if (result === 'lost') {
        startRetreat()
      } else if (result) {
        explode(game.terrain, game.worms, result.x, result.y)
        const crater = { x: Math.round(result.x), y: Math.round(result.y), r: EXPLOSION_RADIUS }
        game.craters.push(crater)
        ctx.send('boom', crater)
        startRetreat()
      }
    }

    checkWinner()
    if (game.phase !== 'playing') return

    // Next turn when the active worm died, or time is up (and nothing is flying).
    const worm = activeWorm()
    const timeUp = performance.now() >= game.turnEndsAt && !game.shot
    if (!worm || !worm.alive || timeUp) startNextTurn()
  }

  function stateMessage() {
    const round = (n) => Math.round(n * 10) / 10
    return {
      phase: game.phase,
      worms: game.worms.map((w) => ({
        id: w.id,
        team: w.team,
        name: w.name,
        x: round(w.x),
        y: round(w.y),
        hp: w.hp,
        alive: w.alive,
        facing: w.facing,
        aim: Math.round(w.aim * 100) / 100,
      })),
      activeWormId: game.activeWormId,
      timeLeft: Math.max(0, Math.ceil((game.turnEndsAt - performance.now()) / 1000)),
      wind: game.wind,
      shot: game.shot ? { x: round(game.shot.x), y: round(game.shot.y) } : null,
      charge: chargeAmount(),
      fired: game.fired,
      winner: game.winner,
    }
  }

  function gameMessage() {
    return {
      seed: game.seed,
      craters: game.craters,
      turnTime: game.turnTime,
      teams: game.teams.map((t) => ({ playerId: t.playerId, name: t.name, color: t.color })),
    }
  }

  function startLoop() {
    let last = performance.now()
    let lastSent = 0
    let pending = 0
    loop = setInterval(() => {
      const now = performance.now()
      // If the tab was throttled, don't try to catch up more than 1/4 second.
      pending += Math.min((now - last) / 1000, 0.25)
      last = now
      while (pending >= TICK) {
        step(TICK)
        pending -= TICK
      }
      if (now - lastSent >= SEND_EVERY_MS) {
        ctx.send('state', stateMessage())
        lastSent = now
      }
    }, 1000 * TICK)
  }

  function stopLoop() {
    clearInterval(loop)
    loop = null
  }

  // --- messages ---

  ctx.on('hi', (data, fromId) => {
    if (!game) return // client already starts on the setup screen
    ctx.sendTo(fromId, 'game', gameMessage())
    ctx.sendTo(fromId, 'state', stateMessage())
  })

  ctx.on('start', (data, fromId) => {
    if (!isHostPlayer(fromId) || game) return
    const turnTime = TURN_TIMES.includes(data.turnTime) ? data.turnTime : DEFAULT_TURN_TIME
    game = newGame(turnTime)
    startNextTurn()
    ctx.send('game', gameMessage())
    ctx.send('state', stateMessage())
    startLoop()
  })

  ctx.on('again', (data, fromId) => {
    if (!isHostPlayer(fromId)) return
    stopLoop()
    game = null
    ctx.send('setup', {})
  })

  ctx.on('input', (data, fromId) => {
    if (!isActivePlayer(fromId)) return
    input = {
      left: Boolean(data.left),
      right: Boolean(data.right),
      up: Boolean(data.up),
      down: Boolean(data.down),
    }
  })

  ctx.on('jump', (data, fromId) => {
    if (!isActivePlayer(fromId)) return
    if (game.chargeStartedAt !== null || game.shot) return
    jump(game.terrain, activeWorm())
  })

  ctx.on('charge', (data, fromId) => {
    if (!isActivePlayer(fromId)) return
    if (game.fired || game.chargeStartedAt !== null) return
    game.chargeStartedAt = performance.now()
  })

  ctx.on('fire', (data, fromId) => {
    if (!isActivePlayer(fromId)) return
    if (game.chargeStartedAt === null) return
    fire()
  })

  // Someone left: their worms are out of the game.
  ctx.onPlayersChange((players) => {
    if (!game) return
    game.teams.forEach((team, i) => {
      if (players.some((p) => p.id === team.playerId)) return
      for (const w of game.worms) {
        if (w.team === i) {
          w.alive = false
          w.hp = 0
        }
      }
    })
    // step() notices if the active worm died and moves to the next turn.
  })

  return {
    stop() {
      stopLoop()
    },
  }
}
