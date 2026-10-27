import { describe, expect, it } from "vitest";
import { parseGunnerInput, parsePilotInput } from "./input.ts";

describe("parsePilotInput", () => {
  it("accepts a steer vector and boost flag", () => {
    expect(parsePilotInput({ steer: { x: 0.5, y: -0.5 }, boost: true })).toEqual({ steer: { x: 0.5, y: -0.5 }, boost: true });
  });

  it("clamps a steer vector longer than 1", () => {
    const input = parsePilotInput({ steer: { x: 300, y: 400 }, boost: false });
    expect(input?.steer.x).toBeCloseTo(0.6);
    expect(input?.steer.y).toBeCloseTo(0.8);
  });

  it("rejects missing, mistyped or non-finite fields", () => {
    expect(parsePilotInput({ steer: { x: 1, y: 0 } })).toBeNull();
    expect(parsePilotInput({ boost: true })).toBeNull();
    expect(parsePilotInput({ steer: { x: "1", y: 0 }, boost: false })).toBeNull();
    expect(parsePilotInput({ steer: { x: NaN, y: 0 }, boost: false })).toBeNull();
    expect(parsePilotInput({ steer: { x: Infinity, y: 0 }, boost: false })).toBeNull();
    expect(parsePilotInput({ steer: { x: 1, y: 0 }, boost: 1 })).toBeNull();
    expect(parsePilotInput({ steer: [1, 0], boost: false })).toBeNull();
  });

  it("rejects extra fields, such as the gunner's", () => {
    expect(parsePilotInput({ steer: { x: 1, y: 0 }, boost: false, fire: true })).toBeNull();
    expect(parsePilotInput({ steer: { x: 1, y: 0, z: 2 }, boost: false })).toBeNull();
  });

  it("rejects anything that isn't an object", () => {
    expect(parsePilotInput(null)).toBeNull();
    expect(parsePilotInput("boost")).toBeNull();
    expect(parsePilotInput(undefined)).toBeNull();
  });
});

describe("parseGunnerInput", () => {
  it("accepts an aim vector and fire and shield flags", () => {
    expect(parseGunnerInput({ aim: { x: 0, y: 1 }, fire: true, shield: false })).toEqual({ aim: { x: 0, y: 1 }, fire: true, shield: false });
  });

  it("keeps a zero aim (meaning: keep the last aim)", () => {
    expect(parseGunnerInput({ aim: { x: 0, y: 0 }, fire: false, shield: false })?.aim).toEqual({ x: 0, y: 0 });
  });

  it("scales a long aim vector down to length 1, keeping its direction", () => {
    const input = parseGunnerInput({ aim: { x: -3000, y: 4000 }, fire: false, shield: false });
    expect(input?.aim.x).toBeCloseTo(-0.6);
    expect(input?.aim.y).toBeCloseTo(0.8);
  });

  it("rejects missing, mistyped or non-finite fields", () => {
    expect(parseGunnerInput({ aim: { x: 0, y: 1 }, fire: true })).toBeNull();
    expect(parseGunnerInput({ aim: { x: 0, y: NaN }, fire: true, shield: false })).toBeNull();
    expect(parseGunnerInput({ aim: { x: 0, y: 1 }, fire: "yes", shield: false })).toBeNull();
  });

  it("rejects extra fields, such as the pilot's", () => {
    expect(parseGunnerInput({ aim: { x: 0, y: 1 }, fire: true, shield: false, boost: true })).toBeNull();
    expect(parseGunnerInput({ aim: { x: 0, y: 1 }, fire: true, shield: false, steer: { x: 1, y: 0 } })).toBeNull();
  });
});

describe("the Pack button (Stage 1)", () => {
  it("is an optional field for both roles", () => {
    expect(parsePilotInput({ steer: { x: 1, y: 0 }, boost: false, pack: true })).toEqual({ steer: { x: 1, y: 0 }, boost: false, pack: true });
    expect(parseGunnerInput({ aim: { x: 0, y: 1 }, fire: false, shield: false, pack: true })).toEqual({ aim: { x: 0, y: 1 }, fire: false, shield: false, pack: true });
  });

  it("still accepts Stage 0 messages without it", () => {
    expect(parsePilotInput({ steer: { x: 1, y: 0 }, boost: false })).toEqual({ steer: { x: 1, y: 0 }, boost: false });
  });

  it("must be true or false", () => {
    expect(parsePilotInput({ steer: { x: 1, y: 0 }, boost: false, pack: "yes" })).toBeNull();
    expect(parseGunnerInput({ aim: { x: 0, y: 1 }, fire: false, shield: false, pack: 1 })).toBeNull();
  });
});

describe("the ghost's direction (Stage 2)", () => {
  it("is an optional, clamped direction in both roles' messages", () => {
    const pilot = parsePilotInput({ steer: { x: 0, y: 0 }, boost: false, ghost: { x: 3, y: 4 } })!;
    expect(pilot.ghost!.x).toBeCloseTo(0.6);
    expect(pilot.ghost!.y).toBeCloseTo(0.8);
    expect(parseGunnerInput({ aim: { x: 0, y: 0 }, fire: false, shield: false, ghost: { x: 0, y: -1 } })).toEqual({ aim: { x: 0, y: 0 }, fire: false, shield: false, ghost: { x: 0, y: -1 } });
  });

  it("rejects the whole message when it isn't a direction", () => {
    expect(parsePilotInput({ steer: { x: 0, y: 0 }, boost: false, ghost: { x: "1", y: 0 } })).toBeNull();
    expect(parseGunnerInput({ aim: { x: 0, y: 0 }, fire: false, shield: false, ghost: true })).toBeNull();
  });
});
