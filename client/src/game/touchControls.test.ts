import { describe, expect, it } from "vitest";
import { TouchControls, mergeGunner, mergePilot } from "./touchControls.ts";

const W = 800;
const make = () => new TouchControls(60, 0.1);

describe("TouchControls stick", () => {
  it("starts where the thumb lands on the left half and follows it", () => {
    const c = make();
    expect(c.stickStart(1, 100, 300, W)).toBe(true);
    expect(c.stickView()).toEqual({ origin: { x: 100, y: 300 }, knob: { x: 100, y: 300 } });
    c.stickMove(1, 160, 300);
    expect(c.stick().x).toBeCloseTo(1);
  });

  it("ignores touches on the right half", () => {
    const c = make();
    expect(c.stickStart(1, 600, 300, W)).toBe(false);
    expect(c.stickView()).toBeNull();
  });

  it("keeps one finger on the stick; a second left-half touch is ignored", () => {
    const c = make();
    c.stickStart(1, 100, 300, W);
    expect(c.stickStart(2, 200, 200, W)).toBe(false);
    c.stickMove(2, 400, 400);
    expect(c.stick()).toEqual({ x: 0, y: 0 });
  });

  it("returns to rest when the stick finger lifts", () => {
    const c = make();
    c.stickStart(1, 100, 300, W);
    c.stickMove(1, 160, 300);
    c.pointerEnd(1);
    expect(c.stick()).toEqual({ x: 0, y: 0 });
    expect(c.stickView()).toBeNull();
  });
});

describe("TouchControls buttons", () => {
  it("holds a button while its finger is down", () => {
    const c = make();
    expect(c.press(5, "boost")).toBe(true);
    expect(c.held("boost")).toBe(true);
    c.pointerEnd(5);
    expect(c.held("boost")).toBe(false);
  });

  it("works together with the stick (multi-touch)", () => {
    const c = make();
    c.stickStart(1, 100, 300, W);
    c.stickMove(1, 100, 240);
    c.press(2, "boost");
    expect(c.pilotInput()).toEqual({ steer: { x: 0, y: -1 }, boost: true, pack: false });
    c.pointerEnd(1);
    expect(c.pilotInput()).toEqual({ steer: { x: 0, y: 0 }, boost: true, pack: false });
  });

  it("first pressed wins between Fire and Shield", () => {
    const c = make();
    expect(c.press(2, "fire")).toBe(true);
    expect(c.press(3, "shield")).toBe(false);
    expect(c.gunnerInput()).toMatchObject({ fire: true, shield: false });
    c.pointerEnd(3);
    expect(c.held("fire")).toBe(true);
    c.pointerEnd(2);
    expect(c.press(3, "shield")).toBe(true);
    expect(c.press(4, "fire")).toBe(false);
    expect(c.gunnerInput()).toMatchObject({ fire: false, shield: true });
  });

  it("aims the gunner with the stick; releasing keeps the last aim (zero vector)", () => {
    const c = make();
    c.stickStart(1, 100, 300, W);
    c.stickMove(1, 40, 300);
    expect(c.gunnerInput().aim).toEqual({ x: -1, y: 0 });
    c.pointerEnd(1);
    expect(c.gunnerInput().aim).toEqual({ x: 0, y: 0 });
  });

  it("ignores ending an unknown finger", () => {
    const c = make();
    c.press(2, "boost");
    c.pointerEnd(99);
    expect(c.held("boost")).toBe(true);
  });

  it("can release everything at once (e.g. when the page is hidden)", () => {
    const c = make();
    c.stickStart(1, 100, 300, W);
    c.press(2, "fire");
    c.releaseAll();
    expect(c.gunnerInput()).toEqual({ aim: { x: 0, y: 0 }, fire: false, shield: false, pack: false });
  });
});

describe("merging touch with keyboard and mouse", () => {
  it("pilot: touch stick wins when pushed, otherwise keys; boost from either", () => {
    const keys = { steer: { x: 1, y: 0 }, boost: false };
    expect(mergePilot(keys, { steer: { x: 0, y: 0 }, boost: true })).toEqual({ steer: { x: 1, y: 0 }, boost: true, pack: false });
    expect(mergePilot(keys, { steer: { x: 0, y: -1 }, boost: false })).toEqual({ steer: { x: 0, y: -1 }, boost: false, pack: false });
  });

  it("gunner: touch aim wins when pushed, otherwise mouse; buttons from either", () => {
    const mouse = { aim: { x: 1, y: 0 }, fire: true, shield: false };
    expect(mergeGunner(mouse, { aim: { x: 0, y: 0 }, fire: false, shield: false })).toEqual({ ...mouse, pack: false });
    expect(mergeGunner(mouse, { aim: { x: 0, y: 1 }, fire: false, shield: true })).toEqual({ aim: { x: 0, y: 1 }, fire: true, shield: true, pack: false });
  });
});

describe("Pack button (Stage 1)", () => {
  it("is held by its own finger, alongside the stick and other buttons", () => {
    const c = make();
    c.stickStart(1, 100, 300, W);
    c.press(2, "fire");
    expect(c.press(3, "pack")).toBe(true);
    expect(c.gunnerInput()).toMatchObject({ fire: true, pack: true });
    expect(c.pilotInput().pack).toBe(true);
    c.pointerEnd(3);
    expect(c.gunnerInput().pack).toBe(false);
  });

  it("merges with the E key: either one presses it", () => {
    expect(mergePilot({ steer: { x: 0, y: 0 }, boost: false, pack: true }, { steer: { x: 0, y: 0 }, boost: false }).pack).toBe(true);
    expect(mergeGunner({ aim: { x: 0, y: 0 }, fire: false, shield: false }, { aim: { x: 0, y: 0 }, fire: false, shield: false, pack: true }).pack).toBe(true);
  });
});
