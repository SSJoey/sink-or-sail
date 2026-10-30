import { describe, expect, it } from "vitest";
import { TIPS, pickTip, tipShown, tipsFor } from "./tips.ts";

describe("a random tip at the start of a match (Stage 5 slice 4)", () => {
  const all = { role: "pilot" as const, packs: true, hazards: true, lastAfloat: true };

  it("has the 20 approved tips", () => {
    expect(TIPS).toHaveLength(20);
    expect(new Set(TIPS.map((t) => t.text)).size).toBe(20);
  });

  it("gives everyone's tips and the role's own, never the other role's", () => {
    const pilot = tipsFor(all);
    const gunner = tipsFor({ ...all, role: "gunner" });
    expect(pilot.some((t) => t.startsWith("A torpedo goes where your bow points"))).toBe(true);
    expect(pilot.some((t) => t.startsWith("The turret takes time"))).toBe(false);
    expect(gunner.some((t) => t.startsWith("The turret takes time"))).toBe(true);
    expect(gunner.some((t) => t.startsWith("Boost to dodge"))).toBe(false);
    expect(pilot).toContain("Boost and Shield share one energy bar: talk before you spend it.");
    expect(gunner).toContain("Boost and Shield share one energy bar: talk before you spend it.");
  });

  it("leaves out pack tips with packs off, hazard tips with hazards off, and ghost tips outside Last Afloat", () => {
    const plain = tipsFor({ role: "pilot", packs: false, hazards: false, lastAfloat: false });
    expect(plain.some((t) => t.includes("mine") || t.includes("torpedo") || t.includes("EMP"))).toBe(false);
    expect(plain.some((t) => t.includes("Reefs") || t.includes("whirlpool"))).toBe(false);
    expect(plain.some((t) => t.includes("ghost"))).toBe(false);
    expect(plain).toContain("Boost to dodge, but leave energy for your gunner's shield.");
    expect(tipsFor(all).some((t) => t.includes("ghost"))).toBe(true);
  });

  it("picks one at random", () => {
    expect(pickTip(["a", "b", "c"], () => 0)).toBe("a");
    expect(pickTip(["a", "b", "c"], () => 0.99)).toBe("c");
    expect(pickTip([], () => 0.5)).toBeNull();
  });

  it("shows from the 3-2-1 until 3 s after Go", () => {
    expect(tipShown("countdown", 0)).toBe(true);
    expect(tipShown("running", 2.9)).toBe(true);
    expect(tipShown("running", 3)).toBe(false);
    expect(tipShown("paused", 1)).toBe(false);
    expect(tipShown("over", 0)).toBe(false);
  });
});
