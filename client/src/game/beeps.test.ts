import { describe, expect, it } from "vitest";
import { Phase } from "@sink-or-sail/shared";
import { BeepClock, type BeepKind } from "./beeps.ts";

type View = { phase: string; countdown: number; timeLeft: number };

/** Feeds the views in order (as the client sees them at 20 a second) and collects every beep, in order. */
function run(views: View[]): BeepKind[] {
  const clock = new BeepClock();
  return views.flatMap((v) => clock.update(v));
}

/** A 3-2-1 countdown at 20 updates a second, then the first second of the match. */
function countdownViews(duration = 240): View[] {
  const views: View[] = [];
  for (let c = 3; c > 0.001; c -= 0.05) views.push({ phase: Phase.Countdown, countdown: c, timeLeft: duration });
  for (let t = duration; t > duration - 1; t -= 0.05) views.push({ phase: Phase.Running, countdown: 0, timeLeft: t });
  return views;
}

/** The match clock running from `from` down to `to` seconds left, at 20 updates a second. */
function running(from: number, to: number): View[] {
  const views: View[] = [];
  for (let t = from; t >= to - 1e-9; t -= 0.05) views.push({ phase: Phase.Running, countdown: 0, timeLeft: Math.max(0, t) });
  return views;
}

describe("BeepClock", () => {
  it("beeps 3, 2, 1 in the countdown, then Go! as the match starts", () => {
    expect(run(countdownViews())).toEqual(["count", "count", "count", "go"]);
  });

  it("gives a double beep at 1:00 left, once", () => {
    expect(run(running(62, 58))).toEqual(["double"]);
  });

  it("beeps every second over the last 10, higher for the last 3, and sounds the horn at 0:00", () => {
    expect(run(running(10.5, 0))).toEqual(["tick", "tick", "tick", "tick", "tick", "tick", "tick", "high", "high", "high", "horn"]);
  });

  it("sounds the horn when time is up and the match is over", () => {
    expect(run([{ phase: Phase.Running, countdown: 0, timeLeft: 0.03 }, { phase: Phase.Over, countdown: 0, timeLeft: 0 }])).toEqual(["horn"]);
  });

  it("no horn when the match ends early (last ship afloat, or the host's Exit)", () => {
    expect(run([...running(20, 19), { phase: Phase.Over, countdown: 0, timeLeft: 19 }])).toEqual([]);
  });

  it("is silent while paused, and the resume countdown beeps 3, 2, 1, Go! before the clock picks up", () => {
    const paused = Array.from({ length: 40 }, () => ({ phase: Phase.Paused, countdown: 0, timeLeft: 8.4 }));
    const resume: View[] = [];
    for (let c = 3; c > 0.001; c -= 0.05) resume.push({ phase: Phase.Countdown, countdown: c, timeLeft: 8.4 });
    expect(run([...running(9, 8.4), ...paused, ...resume, ...running(8.4, 7.9)])).toEqual(["count", "count", "count", "go", "tick"]);
  });

  it("skips beeps it missed in a gap (a reconnect or a late update) rather than playing a burst", () => {
    expect(run([{ phase: Phase.Running, countdown: 0, timeLeft: 9.5 }, { phase: Phase.Running, countdown: 0, timeLeft: 4.5 }])).toEqual([]);
    expect(run([{ phase: Phase.Running, countdown: 0, timeLeft: 9.5 }, { phase: Phase.Running, countdown: 0, timeLeft: 4.5 }, { phase: Phase.Running, countdown: 0, timeLeft: 3.9 }])).toEqual(["tick"]);
  });

  it("a page opened mid-match doesn't beep for where the clock already is", () => {
    expect(run([{ phase: Phase.Running, countdown: 0, timeLeft: 5 }, { phase: Phase.Running, countdown: 0, timeLeft: 4.98 }])).toEqual([]);
  });

  it("nothing between matches", () => {
    expect(run([{ phase: Phase.Waiting, countdown: 0, timeLeft: 240 }, { phase: Phase.Over, countdown: 0, timeLeft: 0 }, { phase: Phase.Waiting, countdown: 0, timeLeft: 240 }])).toEqual([]);
  });
});
