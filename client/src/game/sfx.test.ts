import { describe, expect, it } from "vitest";
import { TUNING } from "@sink-or-sail/shared";
import { SfxMixer, cueVolume } from "./sfx.ts";

describe("cueVolume (Stage 4 slice 2)", () => {
  it("full for your own ship's sounds, half for other ships'", () => {
    expect(cueVolume({ k: "shot", s: [0] }, 0)).toBe(1);
    expect(cueVolume({ k: "shot", s: [1] }, 0)).toBe(0.5);
    expect(cueVolume({ k: "bump", s: [1, 0] }, 0)).toBe(1);
    expect(cueVolume({ k: "hazard", s: [] }, 0)).toBe(0.5);
  });

  it("own-crew sounds are silent for other crews and spectators", () => {
    for (const k of ["boost", "empty", "respawn", "pickup", "health", "reef"] as const) {
      expect(cueVolume({ k, s: [0] }, 0)).toBe(1);
      expect(cueVolume({ k, s: [0] }, 1)).toBe(0);
      expect(cueVolume({ k, s: [0] }, null)).toBe(0);
    }
  });

  it("spectators hear everyone's sounds at half volume", () => {
    expect(cueVolume({ k: "sunk", s: [0] }, null)).toBe(0.5);
    expect(cueVolume({ k: "boom", s: [1, 2] }, null)).toBe(0.5);
  });
});

describe("SfxMixer", () => {
  const { sameKindGapMs, maxPlaying } = TUNING.client.sfx;

  it("plays at most one sound of each kind per gap", () => {
    const mixer = new SfxMixer();
    expect(mixer.admit("shot", 1, 0.1, 0).play).toBe(true);
    expect(mixer.admit("shot", 1, 0.1, sameKindGapMs - 1).play).toBe(false);
    expect(mixer.admit("hit", 1, 0.1, sameKindGapMs - 1).play).toBe(true);
    expect(mixer.admit("shot", 1, 0.1, sameKindGapMs).play).toBe(true);
  });

  it(`plays at most ${maxPlaying} at once; when full, a louder one takes the quietest one's place`, () => {
    const mixer = new SfxMixer();
    const kinds = ["shot", "hit", "blocked", "sunk", "mine", "boom", "torpedo", "emp"] as const;
    kinds.forEach((k, i) => expect(mixer.admit(k, i === 3 ? 0.5 : 1, 1, 0).play).toBe(true));
    expect(mixer.admit("wreck", 0.5, 1, 1)).toEqual({ play: false, stop: [] });
    const louder = mixer.admit("wreck", 1, 1, 2);
    expect(louder.play).toBe(true);
    expect(louder.stop).toHaveLength(1);
    // Once sounds have ended there is room again.
    expect(mixer.admit("kraken", 0.5, 1, 1500).play).toBe(true);
  });

  it("silent sounds aren't played", () => {
    expect(new SfxMixer().admit("boost", 0, 0.3, 0).play).toBe(false);
  });
});
