import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { botGunner, botPilot, newBotMind, type BotMind } from "./bots.ts";
import { circleOverlapsPolygon } from "./geometry.ts";
import { LAYOUT_IDS } from "./layouts.ts";
import { SEA_CENTRE } from "./map.ts";
import { createWorld } from "./match.ts";
import { step } from "./step.ts";
import { testShip } from "./testShip.ts";
import type { Hazard, Ship, ShipInput, SimEvent, World } from "./types.ts";
import { angleOf, distance, dot, normalise, sub, wrapAngle, type Vec } from "./vec.ts";

const B = TUNING.bots;
const DT = 0.05;
const DEG = Math.PI / 180;

/** An open sea (no islands) with our ship 0 at (300, 450) facing east, and `others` as ships 1, 2. */
function sea(others: Partial<Ship>[] = [], ours: Partial<Ship> = {}, setUp: (w: World) => void = () => {}): World {
  const w = createWorld({ packs: true });
  w.islands = [];
  w.nextSignalIn = null;
  w.ships = [testShip({ id: 0, pos: { x: 300, y: 450 }, ...ours }), ...others.map((o, i) => testShip({ id: i + 1, pos: { x: 700, y: 450 }, ...o }))];
  setUp(w);
  return w;
}
const mind = (role: "pilot" | "gunner", over: Partial<BotMind> = {}): BotMind => ({ ...newBotMind(7, 0, role), ...over });
const gun = (w: World, m: BotMind = mind("gunner")) => botGunner(w, 0, m, DT);
const pilot = (w: World, m: BotMind = mind("pilot")) => botPilot(w, 0, m, DT);
const angleTo = (from: Vec, to: Vec) => angleOf(sub(to, from));
const offBy = (a: number, b: number) => Math.abs(wrapAngle(a - b));
/** Many thinks of the gunner, each with a fresh draw of the wobble. */
function thinks(w: World, n: number) {
  let m = mind("gunner");
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = botGunner(w, 0, { ...m, thinkIn: 0 }, DT);
    out.push(r.input);
    m = r.mind;
  }
  return out;
}
const storm = (pos: Vec): Hazard => ({ id: 0, kind: "movingStorm", pos, heading: 0, phase: "active", timeLeft: 10, spin: 0 });
const whirlpool = (pos: Vec): Hazard => ({ id: 0, kind: "whirlpool", pos, heading: 0, phase: "active", timeLeft: 10, spin: 1 });

describe("a bot's mind", () => {
  it("is seeded from the match seed, the ship and the role", () => {
    expect(newBotMind(7, 0, "gunner")).toEqual(newBotMind(7, 0, "gunner"));
    expect(newBotMind(7, 0, "gunner").rng).not.toBe(newBotMind(8, 0, "gunner").rng);
    expect(newBotMind(7, 0, "gunner").rng).not.toBe(newBotMind(7, 1, "gunner").rng);
    expect(newBotMind(7, 0, "gunner").rng).not.toBe(newBotMind(7, 0, "pilot").rng);
  });

  it(`rethinks only every ${B.thinkEvery} s (its reaction time), keeping its controls in between`, () => {
    const w = sea([{}]);
    const first = gun(w);
    expect(first.input.fire).toBe(true);
    const moved = sea([{ pos: { x: 300, y: 100 } }]);
    let m = first.mind;
    for (let t = DT; t < B.thinkEvery - 1e-9; t += DT) {
      const r = gun(moved, m);
      expect(r.input.aim).toEqual(first.input.aim);
      m = r.mind;
    }
    expect(offBy(angleOf(gun(moved, m).input.aim), -Math.PI / 2)).toBeLessThanOrEqual(B.aimWobble + 1e-9);
  });
});

describe("the bot gunner", () => {
  it("aims at the nearest enemy, within its wobble", () => {
    const w = sea([{ pos: { x: 1300, y: 450 } }, { pos: { x: 300, y: 750 } }]);
    for (const input of thinks(w, 30)) expect(offBy(angleOf(input.aim), Math.PI / 2)).toBeLessThanOrEqual(B.aimWobble + 1e-9);
  });

  it("leads a moving target", () => {
    const w = sea([{ pos: { x: 600, y: 450 }, vel: { x: 0, y: 150 } }]);
    const aims = thinks(w, 40).map((i) => angleOf(i.aim));
    const average = aims.reduce((a, b) => a + b, 0) / aims.length;
    expect(average).toBeGreaterThan(15 * DEG);
  });

  it(`fires only when aimed within ${B.fireAngle / DEG}° and within ${B.fireRange}`, () => {
    const near = thinks(sea([{}]), 60);
    const firing = near.filter((i) => i.fire);
    expect(firing.length).toBeGreaterThan(30);
    expect(firing.length).toBeLessThan(60);
    for (const i of firing) expect(offBy(angleOf(i.aim), 0)).toBeLessThanOrEqual(B.fireAngle + 1e-9);
    expect(thinks(sea([{ pos: { x: 300 + B.fireRange + 20, y: 450 } }]), 20).some((i) => i.fire)).toBe(false);
  });

  it("holds fire when an island or wreck is in the way", () => {
    const rock = [{ x: 480, y: 420 }, { x: 520, y: 420 }, { x: 520, y: 480 }, { x: 480, y: 480 }];
    expect(thinks(sea([{}], {}, (w) => { w.islands = [rock]; }), 20).some((i) => i.fire)).toBe(false);
    const wreck = { id: 0, pos: { x: 500, y: 450 }, hull: rock, health: 60, pack: null };
    expect(thinks(sea([{}], {}, (w) => { w.wrecks = [wreck]; }), 20).some((i) => i.fire)).toBe(false);
  });

  it("doesn't see (or shoot at) a ship hidden in a moving storm", () => {
    const w = sea([{}], {}, (w) => { w.hazards = [storm({ x: 700, y: 450 })]; });
    expect(thinks(w, 20).some((i) => i.fire)).toBe(false);
  });

  it(`raises the shield for ${B.shieldSeconds} s after a hit, if energy is at least ${B.shieldEnergy}`, () => {
    const hurt = sea([{ pos: { x: 1400, y: 100 } }], { health: 80 });
    let m = mind("gunner");
    let shielded = 0;
    for (let i = 0; i < 40; i++) {
      const r = gun(hurt, m);
      if (r.input.shield) shielded++;
      expect(r.input.shield && r.input.fire).toBe(false);
      m = r.mind;
    }
    expect(shielded * DT).toBeCloseTo(B.shieldSeconds, 5);
    expect(gun(sea([], { health: 80, energy: B.shieldEnergy - 1 })).input.shield).toBe(false);
    expect(gun(sea([], { health: 80, energyLocked: true })).input.shield).toBe(false);
  });

  it(`fires a torpedo at an enemy within ${B.torpedoAngle / DEG}° of the bow and ${B.torpedoRange} away`, () => {
    const loaded = { gunnerPack: "torpedo" as const };
    expect(gun(sea([{ pos: { x: 300 + B.torpedoRange - 10, y: 450 } }], loaded)).input.pack).toBe(true);
    expect(gun(sea([{ pos: { x: 300 + B.torpedoRange + 10, y: 450 } }], loaded)).input.pack).toBeFalsy();
    const off = 15 * DEG;
    expect(gun(sea([{ pos: { x: 300 + 400 * Math.cos(off), y: 450 + 400 * Math.sin(off) } }], loaded)).input.pack).toBeFalsy();
  });

  it(`fires an EMP at an enemy within ${B.empRange}`, () => {
    const loaded = { gunnerPack: "emp" as const };
    expect(gun(sea([{ pos: { x: 300, y: 450 + B.empRange - 5 } }], loaded)).input.pack).toBe(true);
    expect(gun(sea([{ pos: { x: 300, y: 450 + B.empRange + 5 } }], loaded)).input.pack).toBeFalsy();
  });

  it("does nothing while its ship is sunk", () => {
    const r = gun(sea([{}], { sunk: true }));
    expect(r.input.fire || r.input.shield || !!r.input.pack).toBe(false);
  });
});

describe("the bot pilot", () => {
  const heading = (w: World, m?: BotMind) => angleOf(pilot(w, m).input.steer);

  it("heads for a pack it can use, up to the detour distance", () => {
    const withPack = (type: "health" | "mine", ours: Partial<Ship> = {}) => sea([{ pos: { x: 1500, y: 100 } }], ours, (w) => {
      w.packSpots = [{ x: 300, y: 750 }];
      w.packs = [{ id: 0, spot: 0, type, signalLeft: 0, lifeLeft: 40 }];
    });
    expect(offBy(heading(withPack("mine")), Math.PI / 2)).toBeLessThan(1e-6);
    // A full slot, or full health, and it doesn't bother.
    expect(offBy(heading(withPack("mine", { pilotPack: "mine" })), Math.PI / 2)).toBeGreaterThan(0.3);
    expect(offBy(heading(withPack("health")), Math.PI / 2)).toBeGreaterThan(0.3);
    expect(offBy(heading(withPack("health", { health: 50 })), Math.PI / 2)).toBeLessThan(1e-6);
  });

  it(`closes in on the nearest enemy, and circles it at about ${B.fightDistance}`, () => {
    expect(offBy(heading(sea([{ pos: { x: 1200, y: 450 } }])), 0)).toBeLessThan(1e-6);
    expect(offBy(heading(sea([{ pos: { x: 300 + B.fightDistance, y: 450 } }])), 0)).toBeCloseTo(Math.PI / 2, 5);
    expect(offBy(heading(sea([{ pos: { x: 400, y: 450 } }])), Math.PI)).toBeLessThan(1e-6);
  });

  it("looks ahead and turns away from an island in its path", () => {
    const rock = [{ x: 380, y: 400 }, { x: 440, y: 400 }, { x: 440, y: 500 }, { x: 380, y: 500 }];
    const w = sea([{ pos: { x: 1200, y: 450 } }], {}, (w) => { w.islands = [rock]; });
    const dir = pilot(w).input.steer;
    for (const f of [0.25, 0.5, 0.75, 1]) {
      const p = { x: 300 + dir.x * B.lookAhead * f, y: 450 + dir.y * B.lookAhead * f };
      expect(circleOverlapsPolygon(p, TUNING.ship.radius, rock)).toBeNull();
    }
  });

  it("goes round a reef when it can", () => {
    const reef = [{ x: 360, y: 420 }, { x: 420, y: 420 }, { x: 420, y: 480 }, { x: 360, y: 480 }];
    const w = sea([{ pos: { x: 1200, y: 450 } }], {}, (w) => { w.reefs = [reef]; });
    expect(offBy(heading(w), 0)).toBeGreaterThan(0.2);
  });

  it("gets away from a whirlpool, boosting when inside its reach, and from the kraken", () => {
    const pool = sea([{ pos: { x: 1200, y: 450 } }], {}, (w) => { w.hazards = [whirlpool({ x: 400, y: 450 })]; });
    const r = pilot(pool);
    expect(dot(normalise(r.input.steer), { x: -1, y: 0 })).toBeGreaterThan(0.5);
    expect(r.input.boost).toBe(true);
    const kraken: Hazard = { id: 0, kind: "kraken", pos: { x: 300, y: 600 }, heading: 0, phase: "active", timeLeft: 10, spin: 0, health: 60, holding: null, holdLeft: 0 };
    const k = pilot(sea([{ pos: { x: 1200, y: 450 } }], {}, (w) => { w.hazards = [kraken]; }));
    expect(dot(normalise(k.input.steer), { x: 0, y: -1 })).toBeGreaterThan(0.5);
    expect(k.input.boost).toBe(true);
  });

  it("stays inside the closing storm's circle", () => {
    const w = sea([{ pos: { x: 100, y: 100 } }], { pos: { x: 200, y: 450 } }, (w) => {
      w.storm = { startsAt: 0, closedAt: 10 };
      w.time = 20;
    });
    expect(offBy(heading(w), angleTo({ x: 200, y: 450 }, SEA_CENTRE))).toBeLessThan(1e-6);
  });

  it("runs when badly hurt with an enemy close, boosting", () => {
    const r = pilot(sea([{ pos: { x: 500, y: 450 } }], { health: 20 }));
    expect(dot(normalise(r.input.steer), { x: -1, y: 0 })).toBeGreaterThan(0.9);
    expect(r.input.boost).toBe(true);
  });

  it(`drops a mine when an enemy is within ${B.mineRange} behind`, () => {
    expect(pilot(sea([{ pos: { x: 300 - B.mineRange + 10, y: 450 } }], { pilotPack: "mine" })).input.pack).toBe(true);
    expect(pilot(sea([{ pos: { x: 300 + 100, y: 450 } }], { pilotPack: "mine" })).input.pack).toBeFalsy();
    expect(pilot(sea([{ pos: { x: 300 - B.mineRange - 10, y: 450 } }], { pilotPack: "mine" })).input.pack).toBeFalsy();
  });
});

/** A match with every seat a bot. */
function botMatch(w: World, seconds: number) {
  const minds = w.ships.map((s) => ({ pilot: newBotMind(5, s.id, "pilot"), gunner: newBotMind(5, s.id, "gunner") }));
  const events: SimEvent[] = [];
  /** Island scrapes: how many times a ship came to touch an island, and the longest it stayed touching (ticks). */
  let scrapes = 0;
  let longest = 0;
  const touching = w.ships.map(() => 0);
  for (let i = 0; i < Math.round(seconds / DT) && !w.over; i++) {
    const inputs: ShipInput[] = w.ships.map((s) => {
      const p = botPilot(w, s.id, minds[s.id]!.pilot, DT);
      const g = botGunner(w, s.id, minds[s.id]!.gunner, DT);
      minds[s.id] = { pilot: p.mind, gunner: g.mind };
      return { pilot: p.input, gunner: g.input };
    });
    const r = step(w, inputs, DT);
    w = r.world;
    events.push(...r.events);
    for (const s of w.ships) {
      const touches = !s.sunk && w.islands.some((island) => circleOverlapsPolygon(s.pos, TUNING.ship.radius + 0.5, island));
      if (touches && touching[s.id] === 0) scrapes++;
      touching[s.id] = touches ? touching[s.id]! + 1 : 0;
      longest = Math.max(longest, touching[s.id]!);
    }
  }
  return { world: w, events, scrapes, longest };
}

describe("bots playing a whole match", () => {
  it("don't run into islands: at most a few short scrapes, on every layout (3 ships, packs and hazards on, 2 minutes)", { timeout: 60_000 }, () => {
    for (const seed of [3, 4]) {
      for (const layout of LAYOUT_IDS) {
        const { scrapes, longest } = botMatch(createWorld({ layout, ships: 3, packs: true, hazards: true, seed }), 120);
        // Measured when built: 3–21 scrapes (Slalom's many small rocks the most), each well under 2 s.
        expect(scrapes, `${layout} seed ${seed}`).toBeLessThanOrEqual(30);
        expect(longest * DT, `${layout} seed ${seed}`).toBeLessThan(2);
      }
    }
  });

  it("fight: they fire, hit, sink each other and use packs", () => {
    const { events } = botMatch(createWorld({ packs: true, seed: 11 }), 240);
    expect(events.filter((e) => e.type === "shotFired").length).toBeGreaterThan(50);
    expect(events.filter((e) => e.type === "hit").length).toBeGreaterThan(10);
    expect(events.filter((e) => e.type === "sunk").length).toBeGreaterThan(0);
    expect(events.filter((e) => e.type === "packUsed").length).toBeGreaterThan(0);
  });

  it("the same seed gives the same match", () => {
    const a = botMatch(createWorld({ packs: true, hazards: true, seed: 9 }), 30).world;
    const b = botMatch(createWorld({ packs: true, hazards: true, seed: 9 }), 30).world;
    expect(a).toEqual(b);
    expect(distance(a.ships[0]!.pos, a.ships[1]!.pos)).toBeGreaterThan(0);
  });
});
