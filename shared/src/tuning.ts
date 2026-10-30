// Every adjustable gameplay number. Starting values, approved 2026-10-23; change them during playtests.
// Units: world units (about one pixel on a laptop screen), seconds, radians.

const DEG = Math.PI / 180;

/**
 * Stage 5 ship types (values approved 2026-10-25; turning and turret rates 2026-10-30). Speed, turning and the
 * turret's turn follow size (bigger is slower). The Frigate is the original ship: `ship`, `energy` and `gun` below
 * hold its values, and pack and hazard amounts are shares of its health, the same for every type.
 */
const FRIGATE = {
  maxHealth: 100,
  radius: 28,
  maxSpeed: 150,
  /** Fastest the heading can turn: 180°/s. */
  turnRate: 180 * DEG,
  /** Fastest the turret can turn toward the aim: 360°/s. */
  turretTurnRate: 360 * DEG,
  fireInterval: 0.4,
  shotDamage: 20,
  shotRange: 600,
  energyMax: 100,
  refillPerSecond: 5,
};

export const TUNING = {
  sea: {
    width: 1600,
    height: 900,
  },
  /** The Frigate's hull; other types are in `shipTypes`. */
  ship: {
    radius: FRIGATE.radius,
    maxSpeed: FRIGATE.maxSpeed,
    turnRate: FRIGATE.turnRate,
    /** How quickly velocity catches up with the heading (per second), the same for every type. Lower = more drift. */
    grip: 3,
    maxHealth: FRIGATE.maxHealth,
  },
  boost: {
    speedMultiplier: 1.8,
    energyPerSecond: 30,
  },
  shield: {
    energyPerSecond: 40,
  },
  /** The Frigate's bar; other types are in `shipTypes`. */
  energy: {
    max: FRIGATE.energyMax,
    refillPerSecond: FRIGATE.refillPerSecond,
    /** After the bar runs empty, boost and shield need this much before they work again (every type). */
    restartThreshold: 20,
  },
  /** The Frigate's gun; shot speed is the same for every type, the rest is in `shipTypes`. */
  gun: {
    fireInterval: FRIGATE.fireInterval,
    shotSpeed: 450,
    shotRange: FRIGATE.shotRange,
    shotDamage: FRIGATE.shotDamage,
  },
  /** Stage 5: the five ship types. A bump's push is shared by area (radius squared): the smaller ship moves further. */
  shipTypes: {
    frigate: FRIGATE,
    cutter: { maxHealth: 75, radius: 22, maxSpeed: 175, turnRate: 210 * DEG, turretTurnRate: 420 * DEG, fireInterval: 0.3, shotDamage: 15, shotRange: 450, energyMax: 80, refillPerSecond: 6.5 },
    ironclad: { maxHealth: 140, radius: 34, maxSpeed: 125, turnRate: 150 * DEG, turretTurnRate: 300 * DEG, fireInterval: 0.6, shotDamage: 30, shotRange: 500, energyMax: 130, refillPerSecond: 4 },
    gunboat: { maxHealth: 80, radius: 26, maxSpeed: 155, turnRate: 186 * DEG, turretTurnRate: 372 * DEG, fireInterval: 0.5, shotDamage: 27, shotRange: 450, energyMax: 100, refillPerSecond: 5 },
    longGun: { maxHealth: 85, radius: 30, maxSpeed: 145, turnRate: 174 * DEG, turretTurnRate: 348 * DEG, fireInterval: 0.7, shotDamage: 32, shotRange: 850, energyMax: 100, refillPerSecond: 5 },
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
    chances: { movingStorm: 1, whirlpool: 1, kraken: 1 },
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
  /** Stage 2 kraken (approved 2026-10-27): hunts the nearest ship, grabs it once, then dives; shots and torpedoes hurt it. */
  kraken: {
    /** Its body: shots and torpedoes hit it here; kept clear of islands and wrecks where it surfaces. */
    bodyRadius: 35,
    /** It grabs the ship it hunts once that ship's centre is within this of its middle. */
    grabReach: 70,
    /** Swims toward the nearest ship afloat and not protected, under islands and wrecks. */
    speed: 60,
    distanceFromShip: 300,
    /** A grab holds the ship this long (the pilot can't steer or boost), hurting it each tick. */
    holdTime: 3,
    damage: 0.1,
    tickSeconds: 1,
    /** Three gun shots; a torpedo does 50. At 0 it lets go and dives at once. */
    health: 60,
    /** Seconds it hunts before giving up (diving) without a grab, and the fade after it dives. */
    lifetime: 20,
    fadeTime: 1,
  },
  /** Stage 2 ghosts (approved 2026-10-27): Last Afloat; a crew that is out becomes one shared ghost. */
  ghost: {
    /** Seconds after the crew is out before its ghost appears, where its ship sank. */
    appearAfter: 2,
    /** Full-stick speed (ships sail 150); it passes through everything, kept inside the sea. */
    speed: 160,
  },
  /** Stage 2 haunting (approved 2026-10-27): Last Afloat with hazards on; ghosts make hazards come in the zones they haunt. */
  haunting: {
    /** The sea is split into zones, this many across and down, numbered row by row. */
    zonesAcross: 4,
    zonesDown: 2,
    /** A zone's hidden meter fills in this many seconds with one ghost in it (faster with more), and drains in this many with none. */
    fillTime: 20,
    drainTime: 60,
    /** After a zone's full meter sets off a hazard, the meter empties and can't fill again for this many seconds. */
    zoneCap: 45,
  },
  /** Stage 3 awards (approved 2026-10-27): at most one per crew, at most `maxPerMatch`; minimums to earn each. */
  awards: {
    maxPerMatch: 4,
    sharpshooterHits: 3,
    rockCollectorReefHits: 2,
    bumperBoatsBumps: 3,
    /** Below this speed a ship afloat counts as stationary (a tenth of top speed). */
    stationarySpeed: 15,
    sittingDuckSeconds: 20,
    triggerHappyShots: 10,
    packRatPacks: 2,
    hoarderSeconds: 30,
    shieldHogEnergy: 50,
    speedDemonEnergy: 50,
    /** Close Shave: afloat at the end with less than this fraction of full health. */
    closeShaveHealth: 0.25,
    stormChaserSeconds: 10,
    whirlpoolTouristSeconds: 5,
  },
  /** Stage 3 partner bots (approved 2026-10-29): decent, never brilliant. They run on the server, from the match state. */
  bots: {
    /** A bot rethinks this often (its reaction time); between thinks it keeps its last controls. */
    thinkEvery: 0.3,
    /** Aim wobble, drawn with the seed at each think: up to this either side (radians, 6°). */
    aimWobble: (6 * Math.PI) / 180,
    /** The gunner fires when aimed within this of the target (5°) and the target is within `fireRange` (of the gun's 600). */
    fireAngle: (5 * Math.PI) / 180,
    fireRange: 550,
    /** After a hit: the shield for this long, if energy is at least `shieldEnergy`. */
    shieldSeconds: 1,
    shieldEnergy: 30,
    /** Torpedo: an enemy within this of the bow (12°) and this far away. */
    torpedoAngle: (12 * Math.PI) / 180,
    torpedoRange: 500,
    /** EMP: an enemy within this of the ship's centre. */
    empRange: 180,
    /** The pilot closes to this distance from the nearest enemy and circles; it detours up to `packDetour` for a pack. */
    fightDistance: 350,
    packDetour: 500,
    /** How far ahead the pilot looks for islands, wrecks and reefs. */
    lookAhead: 120,
    /** Mine: an enemy within this behind the ship. */
    mineRange: 150,
    // Proposed while building slice 9 (to confirm): when the pilot runs, and how wide a berth it gives hazards.
    /** Escape: at or below this fraction of full health with an enemy within `escapeRange`, it sails away, boosting
     *  if energy is at least `boostEnergy` (also when getting away from a whirlpool or the kraken). */
    escapeHealth: 0.3,
    escapeRange: 250,
    boostEnergy: 30,
    /** Keeps this far outside a whirlpool's reach and from the kraken's middle. */
    whirlpoolBerth: 60,
    krakenBerth: 250,
    /** Stays this far inside the closing storm's circle (as it will be in `stormAhead` seconds). */
    stormInset: 80,
    stormAhead: 5,
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
    /** Stage 3 lifebar above every ship (sea units): size and how far above the ship's centre; amber at or below
     *  half health, red below a quarter (approved 2026-10-27). */
    lifebarWidth: 48,
    lifebarHeight: 6,
    lifebarOffset: 40,
    lifebarAmberAtOrBelow: 0.5,
    lifebarRedBelow: 0.25,
    /** Stage 3: the results close by themselves this many seconds after a match ends (back to the lobby). */
    resultsSeconds: 20,
    /** Stage 4 slice 1: the countdown beeps, as browser-made tones (Hz, seconds); every device plays them at this
     *  volume (0–1). The double beep at 1:00 has `gap` seconds of silence between its two beeps. */
    sound: {
      volume: 0.2,
      count: { hz: 660, seconds: 0.15 },
      go: { hz: 990, seconds: 0.3 },
      tick: { hz: 880, seconds: 0.12 },
      high: { hz: 1320, seconds: 0.12 },
      double: { hz: 880, seconds: 0.1, gap: 0.15 },
      horn: { hz: 220, seconds: 0.8 },
      /** A clock that jumps by more than this (a reconnect, a late update) plays none of the beeps it skipped. */
      maxGap: 1.5,
    },
    /**
     * Stage 4 slice 6: visible damage on a ship below `below` of full health: cracks, flames and smoke. A puff of
     * smoke starts every `smokeEvery` seconds (so `smokePuffs` are in the air at once), drifts back from the stern at
     * `smokeSpeed`, grows from `smokeStart` to `smokeEnd` across and fades from `smokeAlpha`.
     */
    damage: {
      below: 0.25,
      smokePuffs: 6,
      smokeEvery: 0.3,
      smokeSpeed: 30,
      smokeStart: 5,
      smokeEnd: 15,
      smokeAlpha: 0.45,
    },
    /** Stage 4 slice 8: a control hint not yet acted on fades after this many seconds of play. */
    hintSeconds: 30,
    /** Stage 4 slice 4: a shot's ink dot on the sea (its trail's dots are smaller); the dashed ring round your own ship. */
    shotRadius: 3.5,
    ownShipRing: 35,
    /**
     * Stage 4 slice 3: the sea-chart look (sea units). Grid lines every `gridStep`; wave squiggles on a grid
     * `waveSpacing` apart (moved up to `waveJitter`), kept `waveClearance` from islands, reefs, wrecks, the edge and
     * the compass rose; palms on islands of at least `palmArea` per palm (at most `maxPalms`), `palmMargin` from
     * the coast; reef marks `reefMarkSpacing` apart (moved up to `reefJitter`); the dotted shallows `shallowOffset`
     * outside the coast; ink lines wobble up to `wobble` every `inkStep`; the compass rose in the bottom-right corner.
     */
    chart: {
      gridStep: 200,
      waveSpacing: 150,
      waveJitter: 30,
      waveClearance: 45,
      palmArea: 9000,
      maxPalms: 3,
      palmMargin: 14,
      reefMarkSpacing: 20,
      reefJitter: 5,
      shallowOffset: 10,
      wobble: 1.5,
      inkStep: 14,
      compass: { x: 1490, y: 790, radius: 34 },
      /** Stage 4 slice 5: the closing storm's diagonal hatching, lines this far apart. */
      stormHatch: 24,
    },
    /**
     * Stage 4 slice 2: the sound effects, made by the browser. Each is one or more parts played together:
     * a tone (sine, triangle, square or sawtooth at `hz`, sliding to `toHz`) or filtered noise (`hz` is the filter,
     * sliding to `toHz`), `seconds` long, starting `delay` seconds in, at `gain` (default 1) of the effects' volume.
     * Other ships' sounds play at `othersVolume` of your own's; at most one sound of each kind every
     * `sameKindGapMs`, and at most `maxPlaying` at once (the quietest gives way to a louder one).
     */
    sfx: {
      volume: 0.25,
      othersVolume: 0.5,
      sameKindGapMs: 60,
      maxPlaying: 8,
      sounds: {
        shot: [{ wave: "noise", hz: 2500, toHz: 600, seconds: 0.08, gain: 0.8 }],
        hit: [{ wave: "sine", hz: 140, toHz: 60, seconds: 0.18 }, { wave: "noise", hz: 800, toHz: 200, seconds: 0.1, gain: 0.5 }],
        blocked: [{ wave: "triangle", hz: 1800, seconds: 0.08 }, { wave: "triangle", hz: 2400, seconds: 0.1, delay: 0.03, gain: 0.6 }],
        boost: [{ wave: "noise", hz: 400, toHz: 2400, seconds: 0.35, gain: 0.6 }],
        empty: [{ wave: "square", hz: 110, seconds: 0.3, gain: 0.4 }],
        sunk: [{ wave: "sawtooth", hz: 160, toHz: 40, seconds: 1, gain: 0.5 }, { wave: "noise", hz: 1200, toHz: 150, seconds: 0.8, delay: 0.1, gain: 0.7 }],
        respawn: [{ wave: "sine", hz: 520, seconds: 0.12 }, { wave: "sine", hz: 780, seconds: 0.18, delay: 0.1 }],
        pickup: [{ wave: "sine", hz: 990, seconds: 0.08 }, { wave: "sine", hz: 1480, seconds: 0.12, delay: 0.08 }],
        health: [{ wave: "sine", hz: 523, seconds: 0.4, gain: 0.5 }, { wave: "sine", hz: 659, seconds: 0.4, gain: 0.5 }, { wave: "sine", hz: 784, seconds: 0.4, gain: 0.5 }],
        mine: [{ wave: "sine", hz: 300, toHz: 120, seconds: 0.12 }],
        boom: [{ wave: "noise", hz: 1500, toHz: 80, seconds: 0.7 }, { wave: "sine", hz: 90, toHz: 40, seconds: 0.5, gain: 0.8 }],
        torpedo: [{ wave: "noise", hz: 300, toHz: 900, seconds: 0.4, gain: 0.7 }],
        emp: [{ wave: "sawtooth", hz: 1200, toHz: 200, seconds: 0.35, gain: 0.5 }],
        wreck: [{ wave: "noise", hz: 3000, toHz: 500, seconds: 0.15 }, { wave: "square", hz: 200, toHz: 80, seconds: 0.12, gain: 0.4 }],
        reef: [{ wave: "noise", hz: 1800, seconds: 0.2, gain: 0.5 }],
        hazard: [{ wave: "sine", hz: 110, seconds: 0.8, gain: 0.6 }, { wave: "sine", hz: 165, seconds: 0.8, gain: 0.4 }],
        kraken: [{ wave: "sawtooth", hz: 70, toHz: 50, seconds: 0.7, gain: 0.7 }],
        bump: [{ wave: "sine", hz: 180, toHz: 90, seconds: 0.12 }, { wave: "noise", hz: 600, seconds: 0.06, gain: 0.5 }],
      },
    },
  },
} as const;
