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
