import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { createWorld } from "./match.ts";
import { sinkForTest, step } from "./step.ts";
import type { ShipInput, SimEvent, World } from "./types.ts";

const DT = 0.05;
const G = TUNING.ghost;
const idle: ShipInput = { pilot: { steer: { x: 0, y: 0 }, boost: false }, gunner: { aim: { x: 0, y: 0 }, fire: false, shield: false } };
const ofType = <E extends SimEvent, T extends SimEvent["type"]>(events: E[], type: T) => events.filter((e): e is E & Extract<SimEvent, { type: T }> => e.type === type);

function run(w: World, seconds: number, inputs: (w: World) => (ShipInput | undefined)[] = () => []) {
  const events: (SimEvent & { at: number })[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const r = step(w, inputs(w), DT);
    w = r.world;
    events.push(...r.events.map((e) => ({ ...e, at: w.time })));
    if (w.over) break;
  }
  return { world: w, events };
}

/** A 3-ship Last Afloat match (1 life) in which ship 2 has just gone out at (900, 700). */
function withCrewOut(): { world: World; events: SimEvent[] } {
  const w = createWorld({ mode: "lastAfloat", lives: 1, ships: 3 });
  w.ships[2] = { ...w.ships[2]!, pos: { x: 900, y: 700 } };
  return sinkForTest(w, 2);
}
const ghostInput = (x: number, y: number): ShipInput => ({ ...idle, ghost: { x, y } });

describe("becoming a ghost (Last Afloat)", () => {
  it(`a crew that is out gets a ghost where its ship sank, ${G.appearAfter} s later`, () => {
    const out = withCrewOut();
    expect(out.events).toContainEqual({ type: "crewOut", ship: 2 });
    expect(out.world.ghosts).toEqual([{ ship: 2, pos: { x: 900, y: 700 }, heading: expect.any(Number), appearIn: G.appearAfter }]);
    const { world, events } = run(out.world, G.appearAfter + 0.5);
    const started = ofType(events, "ghostStarted");
    expect(started).toEqual([expect.objectContaining({ ship: 2, pos: { x: 900, y: 700 } })]);
    expect(started[0]!.at).toBeCloseTo(G.appearAfter, 1);
    expect(world.ghosts[0]!.appearIn).toBe(0);
  });

  it("doesn't come for a sinking that only costs a life, nor in Sink Count", () => {
    const lives = createWorld({ mode: "lastAfloat", lives: 2, ships: 3 });
    expect(sinkForTest(lives, 2).world.ghosts).toEqual([]);
    expect(sinkForTest(createWorld({ ships: 3 }), 2).world.ghosts).toEqual([]);
  });

  it("the out ship stays out: the match goes on with the other two", () => {
    const { world } = run(withCrewOut().world, 3);
    expect(world.over).toBe(false);
    expect(world.ships[2]).toMatchObject({ sunk: true, out: true });
  });
});

describe("a ghost moving", () => {
  const appeared = () => run(withCrewOut().world, G.appearAfter + DT).world;

  it("doesn't move before it appears", () => {
    const { world } = run(withCrewOut().world, 1, () => [idle, idle, ghostInput(1, 0)]);
    expect(world.ghosts[0]!.pos).toEqual({ x: 900, y: 700 });
  });

  it(`moves at ${G.speed} the way its crew steers it, and points that way`, () => {
    const { world } = run(appeared(), 1, () => [idle, idle, ghostInput(0, -1)]);
    expect(world.ghosts[0]!.pos.x).toBeCloseTo(900);
    expect(world.ghosts[0]!.pos.y).toBeCloseTo(700 - G.speed, 0);
    expect(world.ghosts[0]!.heading).toBeCloseTo(-Math.PI / 2);
  });

  it("goes slower with the stick part-way, and stays put with none", () => {
    expect(run(appeared(), 1, () => [idle, idle, ghostInput(0.5, 0)]).world.ghosts[0]!.pos.x).toBeCloseTo(900 + G.speed / 2, 0);
    expect(run(appeared(), 1).world.ghosts[0]!.pos).toEqual({ x: 900, y: 700 });
  });

  it("passes straight through islands (One Island's middle) and stays inside the sea", () => {
    let w = appeared();
    w.ghosts[0] = { ...w.ghosts[0]!, pos: { x: 600, y: 450 } };
    const through = run(w, 2, () => [idle, idle, ghostInput(1, 0)]).world.ghosts[0]!.pos;
    expect(through.x).toBeCloseTo(600 + 2 * G.speed, 0);
    w = appeared();
    const edge = run(w, 10, () => [idle, idle, ghostInput(0, 1)]).world.ghosts[0]!.pos;
    expect(edge.y).toBe(TUNING.sea.height);
  });

  it("touches nothing: ships sail through it, shots pass it, it takes no packs", () => {
    const w = appeared();
    w.ghosts[0] = { ...w.ghosts[0]!, pos: w.ships[0]!.pos };
    const before = w.ships[0]!;
    const { world, events } = run(w, 1);
    expect(world.ships[0]!.pos).toEqual(before.pos);
    expect(world.ships[0]!.health).toBe(before.health);
    expect(ofType(events, "bump")).toEqual([]);
  });

  it("no ghost input means the crew's other inputs do nothing either (the ship is out)", () => {
    const { world } = run(appeared(), 1, () => [idle, idle, { pilot: { steer: { x: 1, y: 0 }, boost: true }, gunner: { aim: { x: 1, y: 0 }, fire: true, shield: false } }]);
    expect(world.ghosts[0]!.pos).toEqual({ x: 900, y: 700 });
    expect(world.shots).toEqual([]);
  });
});
