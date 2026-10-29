import { describe, expect, it } from "vitest";
import { TUNING } from "@sink-or-sail/shared";
import { hintsFor, loadUsedHints, saveUsedHints, usedControls, type HintSituation } from "./hints.ts";

const base: HintSituation = { role: "pilot", phone: true, ghost: false, pack: null, elapsed: 0 };
const texts = (s: Partial<HintSituation>, used: string[] = []) => hintsFor({ ...base, ...s }, new Set(used)).map((h) => `${h.spot}: ${h.text}`);

describe("control hints (Stage 4 slice 8)", () => {
  it("a phone pilot: steer on the left and Boost; the Pack hint only with a mine to drop", () => {
    expect(texts({})).toEqual(["left: Touch anywhere on this side to steer", "boost: Hold for speed (uses energy)"]);
    expect(texts({ pack: "mine" })).toContain("pack: Drop your mine");
  });

  it("a phone gunner: aim on the left, Fire and Shield; the Pack hint names the pack", () => {
    expect(texts({ role: "gunner" })).toEqual(["left: Touch anywhere on this side to aim", "fire: Hold to fire", "shield: Hold to block shots (uses energy)"]);
    expect(texts({ role: "gunner", pack: "torpedo" })).toContain("pack: Fire your torpedo");
    expect(texts({ role: "gunner", pack: "emp" })).toContain("pack: Fire your EMP");
  });

  it("a laptop: one line of keys for the role", () => {
    expect(texts({ phone: false })).toEqual(["keys: W A S D steer · Space boost · E drop the mine"]);
    expect(texts({ phone: false, role: "gunner" })).toEqual(["keys: Mouse aims · click fires · right-click shields · E fires the pack"]);
  });

  it("a ghost: how to steer it, on a phone or a laptop", () => {
    expect(texts({ ghost: true })).toEqual(["left: Steer your ghost: the stick"]);
    expect(texts({ ghost: true, phone: false, role: "gunner" })).toEqual(["keys: Steer your ghost: W A S D"]);
  });

  it("a hint goes once its control has been used (and the laptop line once both main controls have)", () => {
    expect(texts({ role: "gunner" }, ["phone:gunner:fire"])).not.toContain("fire: Hold to fire");
    expect(texts({ role: "gunner" }, ["phone:gunner:fire"])).toContain("shield: Hold to block shots (uses energy)");
    expect(texts({ phone: false }, ["laptop:pilot:steer"])).toHaveLength(1);
    expect(texts({ phone: false }, ["laptop:pilot:steer", "laptop:pilot:boost"])).toEqual([]);
  });

  it(`fades after ${TUNING.client.hintSeconds} s of play`, () => {
    expect(texts({ elapsed: TUNING.client.hintSeconds - 0.1 })).toHaveLength(2);
    expect(texts({ elapsed: TUNING.client.hintSeconds })).toEqual([]);
  });

  it("reads which controls an input used", () => {
    expect(usedControls({ ...base }, { steer: { x: 0, y: 0 }, boost: true, pack: false })).toEqual(["phone:pilot:boost"]);
    expect(usedControls({ ...base }, { steer: { x: 0.8, y: 0 }, boost: false, pack: true })).toEqual(["phone:pilot:steer", "phone:pilot:pack"]);
    expect(usedControls({ ...base, role: "gunner", phone: false }, { aim: { x: 1, y: 0 }, fire: true, shield: true, pack: false })).toEqual(["laptop:gunner:aim", "laptop:gunner:fire", "laptop:gunner:shield"]);
    expect(usedControls({ ...base, ghost: true }, { steer: { x: 0, y: 0 }, boost: false, ghost: { x: 0, y: -1 } })).toEqual(["phone:ghost:steer"]);
    expect(usedControls({ ...base }, null)).toEqual([]);
  });
});

describe("remembered hints", () => {
  const memory = () => {
    const items = new Map<string, string>();
    return { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => { items.set(k, v); } };
  };
  const refusing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };

  it("remembers the controls used on this device", () => {
    const store = memory();
    expect(loadUsedHints(store)).toEqual(new Set());
    saveUsedHints(store, new Set(["phone:gunner:fire"]));
    expect(loadUsedHints(store)).toEqual(new Set(["phone:gunner:fire"]));
  });

  it("works for the visit when storage is blocked or holds something else", () => {
    expect(loadUsedHints(refusing)).toEqual(new Set());
    expect(() => saveUsedHints(refusing, new Set(["x"]))).not.toThrow();
    const odd = memory();
    odd.setItem("sinkOrSail.hints", "not json");
    expect(loadUsedHints(odd)).toEqual(new Set());
  });
});
