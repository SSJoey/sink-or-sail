import { describe, expect, it } from "vitest";
import { TUNING } from "@sink-or-sail/shared";
import { cameraCentre, cameraFocus, glide, isBigSea, viewSetting, viewSize } from "./camera.ts";

const SEA = { width: 1600, height: 900 };

describe("the test-only view setting (Stage 5 slice 3)", () => {
  it("reads ?view=0.5 as a fraction of the usual view, and ignores anything else", () => {
    expect(viewSetting("?view=0.5")).toBe(0.5);
    expect(viewSetting("?fps=20&view=0.75")).toBe(0.75);
    for (const search of ["", "?view=", "?view=0", "?view=1.5", "?view=abc", "?view=-0.5"]) expect(viewSetting(search)).toBeUndefined();
  });
});

describe("how much sea each player sees (Stage 5 slice 3)", () => {
  it("on today's one-screen sea: the whole sea, for every type", () => {
    expect(viewSize(SEA, { longGun: false })).toEqual(SEA);
    expect(viewSize(SEA, { longGun: true })).toEqual(SEA);
    expect(isBigSea(SEA, viewSize(SEA, { longGun: false }))).toBe(false);
  });

  it("on a bigger sea: the usual view, and about 12% more each way for a Long gun", () => {
    const big = { width: 3200, height: 1800 };
    expect(viewSize(big, { longGun: false })).toEqual(TUNING.client.camera.view);
    expect(viewSize(big, { longGun: true })).toEqual({ width: 1792, height: 1008 });
    expect(isBigSea(big, viewSize(big, { longGun: false }))).toBe(true);
  });

  it("with the test-only setting, a part of today's sea (the Long gun's view still inside the sea)", () => {
    expect(viewSize(SEA, { scale: 0.5, longGun: false })).toEqual({ width: 800, height: 450 });
    expect(viewSize(SEA, { scale: 0.5, longGun: true })).toEqual({ width: 896, height: 504 });
    expect(viewSize(SEA, { scale: 0.95, longGun: true })).toEqual(SEA);
  });
});

describe("where the camera looks (Stage 5 slice 3)", () => {
  const view = { width: 800, height: 450 };

  it("centres on the ship in open water", () => {
    expect(cameraCentre({ x: 700, y: 500 }, view, SEA)).toEqual({ x: 700, y: 500 });
  });

  it("stops at the sea edges, so nothing past the edge shows", () => {
    expect(cameraCentre({ x: 30, y: 20 }, view, SEA)).toEqual({ x: 400, y: 225 });
    expect(cameraCentre({ x: 1590, y: 890 }, view, SEA)).toEqual({ x: 1200, y: 675 });
  });

  it("shows the whole sea, centred, when the view holds it", () => {
    expect(cameraCentre({ x: 30, y: 20 }, SEA, SEA)).toEqual({ x: 800, y: 450 });
  });

  it("glides: closes a part of the gap each frame", () => {
    expect(glide({ x: 0, y: 0 }, { x: 100, y: -50 }, 0.2)).toEqual({ x: 20, y: -10 });
    expect(glide({ x: 100, y: 100 }, { x: 100, y: 100 }, 0.2)).toEqual({ x: 100, y: 100 });
  });

  it("follows your ship, your ghost once your crew is out, and nothing without a seat", () => {
    const ships = [{ x: 100, y: 200, out: false }, { x: 900, y: 300, out: true }];
    const ghosts = new Map([["1", { x: 500, y: 600 }]]);
    expect(cameraFocus(ships, ghosts, 0)).toEqual({ x: 100, y: 200 });
    expect(cameraFocus(ships, ghosts, 1)).toEqual({ x: 500, y: 600 });
    expect(cameraFocus(ships, ghosts, null)).toBeNull();
    expect(cameraFocus(ships, new Map(), 1)).toEqual({ x: 900, y: 300 });
  });
});
