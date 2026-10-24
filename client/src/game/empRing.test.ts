import { describe, expect, it } from "vitest";
import { TUNING } from "@sink-or-sail/shared";
import { EmpRings, empRingAt } from "./empRing.ts";

const GROW = TUNING.client.empRingGrowMs;
const FADE = TUNING.client.empRingFadeMs;

describe("empRingAt", () => {
  it(`grows from the ship to the EMP radius over ${GROW} ms`, () => {
    expect(empRingAt(0)).toEqual({ radius: 0, alpha: 1 });
    expect(empRingAt(GROW / 2)!.radius).toBeCloseTo(TUNING.emp.radius / 2);
    expect(empRingAt(GROW)).toEqual({ radius: TUNING.emp.radius, alpha: 1 });
  });

  it(`then fades over ${FADE} ms and is gone`, () => {
    expect(empRingAt(GROW + FADE / 2)).toEqual({ radius: TUNING.emp.radius, alpha: 0.5 });
    expect(empRingAt(GROW + FADE)).toBeNull();
  });
});

describe("EmpRings", () => {
  it("starts a ring where a ship is when its EMP count goes up, not for counts seen at first", () => {
    const rings = new EmpRings();
    rings.update([{ x: 10, y: 20, empsFired: 2 }], 0);
    expect(rings.active(0)).toEqual([]);
    rings.update([{ x: 15, y: 25, empsFired: 3 }], 100);
    expect(rings.active(100)).toEqual([{ x: 15, y: 25, radius: 0, alpha: 1 }]);
    expect(rings.active(100 + GROW + FADE)).toEqual([]);
  });
});
