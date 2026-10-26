import { describe, expect, it } from "vitest";
import { Phase, TUNING } from "@sink-or-sail/shared";
import { blinkVisible, countdownLabel, outBanner, packBlinkVisible, pausedText, resultLine, respawnText, resultTitle, scoreRows, sinkBanner, stormText } from "./matchText.ts";

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

describe("packBlinkVisible", () => {
  const { packBlinkTime: last, packBlinkHz: hz } = TUNING.client;

  it(`shows a pack steadily until its last ${TUNING.client.packBlinkTime} s`, () => {
    expect(packBlinkVisible(TUNING.packs.lifetime)).toBe(true);
    expect(packBlinkVisible(last + 0.01)).toBe(true);
  });

  it(`then blinks ${TUNING.client.packBlinkHz} times a second`, () => {
    const half = 1 / (2 * hz);
    expect(packBlinkVisible(last)).toBe(true);
    expect(packBlinkVisible(last - half)).toBe(false);
    expect(packBlinkVisible(last - 2 * half)).toBe(true);
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

describe("Stage 2: Last Afloat texts", () => {
  it("shows Go! for the first second of a Last Afloat match too", () => {
    const LA = TUNING.lastAfloat.duration;
    expect(countdownLabel(Phase.Running, 0, LA - 0.5, LA)).toBe("Go!");
    expect(countdownLabel(Phase.Running, 0, LA - 1.5, LA)).toBeNull();
  });

  it("names the cause of a sinking", () => {
    expect(sinkBanner(1, "shot")).toBe("Sunk by ■ Crew 2's guns");
    expect(sinkBanner(1, "mine")).toBe("Sunk by ■ Crew 2's mine");
    expect(sinkBanner(2, "torpedo")).toBe("Sunk by ▲ Crew 3's torpedo");
    expect(sinkBanner(0, "bump")).toBe("Rammed by ● Crew 1");
    expect(sinkBanner(-1, "ownMine")).toBe("Sunk by your own mine");
    expect(sinkBanner(-1, "reef")).toBe("Wrecked on a reef");
    expect(sinkBanner(-1, "wreck")).toBe("Wrecked on a shipwreck");
    expect(sinkBanner(-1, "storm")).toBe("Lost to the storm");
    // Nobody credited (a ship's own blast from a mine it shot): as in Stage 1.
    expect(sinkBanner(-1, "shot")).toBe("Sunk!");
  });

  it("tells a crew that is out what sank it", () => {
    expect(outBanner(1, "torpedo")).toBe("Out: sunk by ■ Crew 2's torpedo");
    expect(outBanner(0, "bump")).toBe("Out: rammed by ● Crew 1");
    expect(outBanner(-1, "ownMine")).toBe("Out: sunk by your own mine");
    expect(outBanner(-1, "reef")).toBe("Out: wrecked on a reef");
    expect(outBanner(-1, "wreck")).toBe("Out: wrecked on a shipwreck");
    expect(outBanner(-1, "storm")).toBe("Out: lost to the storm");
    expect(outBanner(-1, "shot")).toBe("Out");
  });

  it("scoreboard rows: Sink Count shows sinkings; Last Afloat lives left (or out) as well", () => {
    const row = { label: "● Crew 1", names: "Joey & Sam", sinkings: 1 };
    expect(resultLine(row)).toBe("● Crew 1: 1 sinking (Joey & Sam)");
    expect(resultLine({ ...row, sinkings: 2 }, { livesLeft: 1, out: false })).toBe("● Crew 1: 1 life left · 2 sinkings (Joey & Sam)");
    expect(resultLine(row, { livesLeft: 3, out: false })).toBe("● Crew 1: 3 lives left · 1 sinking (Joey & Sam)");
    expect(resultLine({ ...row, sinkings: 0 }, { livesLeft: 0, out: true })).toBe("● Crew 1: out · 0 sinkings (Joey & Sam)");
  });
});

describe("Stage 2: the closing storm's status line", () => {
  const times = { startsAt: 60, closedAt: 300 };
  it("counts down to the storm, then says it's closing, then closed", () => {
    expect(stormText(0, times, false)).toBe("Storm in 1:00");
    expect(stormText(17.2, times, false)).toBe("Storm in 0:43");
    expect(stormText(59.5, times, false)).toBe("Storm in 0:01");
    expect(stormText(60, times, false)).toBe("Storm closing");
    expect(stormText(299, times, false)).toBe("Storm closing");
    expect(stormText(300, times, false)).toBe("Storm closed");
  });

  it("tells a crew whose ship is outside the circle", () => {
    expect(stormText(120, times, true)).toBe("In the storm!");
  });
});
