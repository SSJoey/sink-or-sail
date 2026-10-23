import { describe, expect, it } from "vitest";
import { Phase, TUNING } from "@sink-or-sail/shared";
import { blinkVisible, countdownLabel, pausedText, respawnText, resultTitle, scoreRows, sinkBanner } from "./matchText.ts";

const D = TUNING.match.duration;

describe("countdownLabel", () => {
  it("counts 3, 2, 1 during the countdown, then shows Go! for the first second", () => {
    expect(countdownLabel(Phase.Countdown, 3, D)).toBe("3");
    expect(countdownLabel(Phase.Countdown, 2.4, D)).toBe("3");
    expect(countdownLabel(Phase.Countdown, 1.9, D)).toBe("2");
    expect(countdownLabel(Phase.Countdown, 0.2, D)).toBe("1");
    expect(countdownLabel(Phase.Running, 0, D - 0.5)).toBe("Go!");
    expect(countdownLabel(Phase.Running, 0, D - 1.5)).toBeNull();
    expect(countdownLabel(Phase.Over, 0, 0)).toBeNull();
  });
});

describe("sink texts", () => {
  it("names the crew that did the sinking", () => {
    expect(sinkBanner(1)).toBe("Sunk by ■ Crew 2");
    expect(sinkBanner(0)).toBe("Sunk by ● Crew 1");
    expect(sinkBanner(-1)).toBe("Sunk!");
  });

  it("counts down to the respawn in whole seconds", () => {
    expect(respawnText(3)).toBe("Back in 3");
    expect(respawnText(2.2)).toBe("Back in 3");
    expect(respawnText(0.1)).toBe("Back in 1");
  });
});

describe("result", () => {
  it("names the winner or calls a draw", () => {
    expect(resultTitle(0)).toBe("● Crew 1 wins!");
    expect(resultTitle(1)).toBe("■ Crew 2 wins!");
    expect(resultTitle(-1)).toBe("Draw!");
  });

  it("lists each crew's players (pilot first) and sinkings", () => {
    const players = [
      { name: "Sam", crew: 0, role: "gunner" },
      { name: "Joey", crew: 0, role: "pilot" },
      { name: "Kim", crew: 1, role: "pilot" },
      { name: "Watcher" },
    ];
    expect(scoreRows([2, 5], players)).toEqual([
      { label: "● Crew 1", names: "Joey & Sam", sinkings: 2 },
      { label: "■ Crew 2", names: "Kim", sinkings: 5 },
    ]);
  });

  it("shows a dash for a crew with nobody aboard", () => {
    expect(scoreRows([0, 0], [])[1]!.names).toBe("—");
  });
});

describe("blinkVisible", () => {
  it(`blinks ${TUNING.client.protectionBlinkHz} times a second while protected`, () => {
    const hz = TUNING.client.protectionBlinkHz;
    const half = 1 / (2 * hz);
    expect(blinkVisible(2, hz)).toBe(true);
    expect(blinkVisible(2 - half, hz)).toBe(false);
    expect(blinkVisible(2 - 2 * half, hz)).toBe(true);
  });

  it("is always visible without protection", () => {
    expect(blinkVisible(0, 4)).toBe(true);
  });
});

describe("pausedText", () => {
  it("says who paused, and tells non-hosts who resumes", () => {
    expect(pausedText("Sam", true)).toBe("Paused by Sam");
    expect(pausedText("Sam", false)).toBe("Paused by Sam · Waiting for the host to resume");
    expect(pausedText("", false)).toBe("Paused · Waiting for the host to resume");
  });
});
