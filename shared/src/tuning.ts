// Every adjustable gameplay number. Starting values, approved 2026-10-23; change them during playtests.
// Units: world units (about one pixel on a laptop screen), seconds, radians.

export const TUNING = {
  sea: {
    width: 1600,
    height: 900,
  },
  ship: {
    radius: 28,
    maxSpeed: 150,
    /** Fastest the heading can turn: 180°/s. */
    turnRate: Math.PI,
    /** How quickly velocity catches up with the heading (per second). Lower = more drift. */
    grip: 3,
    maxHealth: 100,
  },
  boost: {
    speedMultiplier: 1.8,
    energyPerSecond: 30,
  },
  shield: {
    energyPerSecond: 40,
  },
  energy: {
    max: 100,
    refillPerSecond: 7.5,
    /** After the bar runs empty, boost and shield need this much before they work again. */
    restartThreshold: 20,
  },
  gun: {
    fireInterval: 0.4,
    shotSpeed: 450,
    shotRange: 600,
    shotDamage: 20,
  },
  bump: {
    /** Closing speed below which a bump does no damage. */
    minSpeed: 60,
    /** Closing speed of a full-boost head-on hit (2 × 150 × 1.8), which deals maxDamage. */
    fullDamageSpeed: 540,
    maxDamage: 15,
  },
  respawn: {
    delay: 3,
    protection: 2,
  },
  match: {
    duration: 240,
    /** 3-2-1-Go before a match: ships visible but frozen. */
    countdown: 3,
  },
  server: {
    /** Simulation steps per second; state is sent to clients at the same rate. */
    tickRate: 20,
  },
  client: {
    /** Input messages sent per second. */
    inputRate: 20,
    /** Clients draw this far behind the server, blending between snapshots. */
    interpolationDelayMs: 100,
    /** Phone stick: how far the thumb travels for full push (CSS px), and the dead zone as a fraction of that. */
    stickRadius: 60,
    stickDeadZone: 0.1,
    /** How long a ship flashes white when hit. */
    hitFlashMs: 150,
    /** Phone vibration for both crewmates when their ship sinks (Android only). */
    sinkVibrateMs: 600,
    /** A ship with respawn protection blinks this many times per second. */
    protectionBlinkHz: 4,
    /** How long a sunk ship takes to fade out. */
    sinkFadeMs: 1000,
  },
} as const;
