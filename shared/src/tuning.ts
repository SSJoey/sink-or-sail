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
    refillPerSecond: 5,
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
  /** Stage 2: reefs (approved 2026-10-26). A ship is on a reef while its centre is over it. */
  reef: {
    /** Top speed on a reef, boosted or not, as a fraction of normal. */
    speedFactor: 0.5,
    /** Fraction of full health lost on entering a reef (respawn protection blocks it; a shield doesn't). */
    damage: 0.05,
  },
  /** Stage 2 shipwrecks (approved 2026-10-26): solid like a rock until destroyed; with hazards on only. */
  wreck: {
    /** Hull size: a broken ship lying on its side. */
    length: 70,
    width: 26,
    /** Three gun shots; torpedoes and mine blasts do their usual damage (50 and 40). */
    health: 60,
    /** Chance that a wreck holds a pack (with packs on), drawn with the seed; the type uses the packs' chances. */
    packChance: 0.5,
    /** Ramming a wreck: the ship takes a normal bump for its speed, the wreck this many times that. */
    ramFactor: 3,
  },
  /** Stage 2 closing storm (approved 2026-10-26): Last Afloat with hazards on only. */
  closingStorm: {
    /** Match seconds when the circle starts closing (1:00 in) and reaches its final size (5:00 in), shrinking smoothly. */
    startsAt: 60,
    closedAt: 300,
    /** The safe circle around the middle of the sea: from just covering the corners down to the final size. */
    startRadius: 918,
    endRadius: 300,
    /** Fraction of full health lost each tick by a ship whose centre is outside the circle (protection blocks it; a shield doesn't). */
    damage: 0.05,
    tickSeconds: 1,
    /** A ship respawning in the storm comes back this far inside the circle, toward the middle. */
    respawnInset: 60,
  },
  /** Stage 2 hazard timer (approved 2026-10-26): dynamic hazards, with hazards on, in both modes. */
  hazards: {
    /** Match seconds to the first signal. */
    firstAt: 30,
    /** Seconds from a hazard being gone to the next signal: between these, drawn with the seed. */
    minGap: 30,
    maxGap: 50,
    /** Hazards on the sea at once (signalled and fading ones included). */
    maxActive: 1,
    /** Seconds a hazard's spot is signalled before it acts. */
    signalTime: 3,
    /** A hazard appears this far from a ship picked with the seed... */
    distanceFromShip: 250,
    /** ...with its edge at least this far from every ship. */
    clearance: 50,
    /** With no clear spot (or no ship afloat), the timer tries again after this many seconds. */
    retryAfter: 1,
    /** Relative chance of each kind when the timer runs out. */
    chances: { movingStorm: 1, whirlpool: 1 },
  },
  /** Stage 2 moving storm (approved 2026-10-26): pushes ships whose centre is inside; hides what's in it. No damage. */
  movingStorm: {
    radius: 120,
    /** Drift speed, in a straight line toward where the picked ship was when it was signalled. */
    speed: 50,
    /** Seconds it acts, then it fades out over `fadeTime` (also when its centre leaves the sea). */
    lifetime: 16,
    fadeTime: 1,
    /** Speed a ship inside is carried along the storm's direction: slower than the drift, so the storm swallows
     *  a waiting ship and slowly passes over it (changed from 70, 2026-10-26: at 70 waiting ships rode its front edge). */
    push: 40,
  },
  /** Stage 2 whirlpool (approved 2026-10-26): stays put; pulls ships in and swirls them round; no damage. */
  whirlpool: {
    /** A ship whose centre is within this of the middle is pulled and swirled. */
    reach: 180,
    /** The eye: inside it the pull is stronger than full sail, so only boosting gets a ship out. */
    eyeRadius: 35,
    /** Inward pull: this at the edge of the reach, rising to `innerPull` at the eye's edge, and `eyePull` inside the eye. */
    edgePull: 20,
    innerPull: 90,
    eyePull: 170,
    /** Speed of the current round it (the slingshot: sailing with it is faster). */
    swirl: 80,
    /** Appears this far from the picked ship (its reach plus a ship plus the hazard clearance is 258, more than the usual 250). */
    distanceFromShip: 260,
    lifetime: 15,
    fadeTime: 1,
  },
  /** Stage 2: Last Afloat (approved 2026-10-26). */
  lastAfloat: {
    /** Lives per ship unless the host picks another number; each sinking costs one, and at 0 the crew is out. */
    lives: 2,
    minLives: 1,
    maxLives: 5,
    /** Hard time limit (7:00); then most lives left wins, then most health, otherwise a draw. */
    duration: 420,
  },
  packs: {
    /** Packs on the map at once, glowing (signalled) ones included. */
    maxOnMap: 2,
    /** Seconds from the match start, or from the last pack appearing, to the next signal; also from a pickup off a full map. */
    spawnInterval: 8,
    /** Seconds a spot glows before its pack appears. */
    signalTime: 3,
    /** Seconds a pack stays once it has appeared; nobody picking it up means it disappears (the glow doesn't count). */
    lifetime: 45,
    /** Pack size for pickup: taken when it touches a ship's circle. */
    radius: 18,
    /** Relative chance of each pack type. */
    chances: { mine: 1, torpedo: 1, emp: 1, health: 1 },
    /** Health pack: fraction of full health restored (never above full). */
    healthRestore: 0.4,
  },
  mine: {
    /** Trigger circle: a ship sets it off when its circle touches this one. */
    radius: 20,
    /** Seconds after the drop before it can go off. */
    armTime: 1,
    /** Seconds after the drop before it disappears unused. */
    lifetime: 30,
    /** When it goes off (touched or shot), it hurts every ship whose circle overlaps this blast circle. */
    blastRadius: 60,
    /** Fraction of full health dealt to every ship in the blast. */
    damage: 0.4,
    /** A raised shield multiplies mine damage by this. */
    shieldFactor: 0.5,
  },
  torpedo: {
    /** Two-thirds of a shot's speed: slower than a shot, faster than any ship (even boosting). */
    speed: 300,
    /** Fraction of full health dealt on a hit. */
    damage: 0.5,
    /** A raised shield multiplies torpedo damage by this. */
    shieldFactor: 0.5,
  },
  emp: {
    /** Enemy ships whose circle overlaps this circle around the firing ship are caught. */
    radius: 200,
    /** Seconds a caught ship can't fire, boost, shield or use packs (steering still works). */
    duration: 3,
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
    /** Short buzz on the gunner's phone when the crew picks up a torpedo or EMP (Android only). */
    gunnerPackVibrateMs: 200,
    /** EMP ring: grows from the firing ship to the full radius, then fades. */
    empRingGrowMs: 400,
    empRingFadeMs: 300,
    /** A pack on the sea blinks for its last seconds before it disappears, this many times per second. */
    packBlinkTime: 5,
    packBlinkHz: 4,
  },
} as const;
