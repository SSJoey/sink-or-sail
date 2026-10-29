import { describe, expect, it } from "vitest";
import { loadSoundOn, saveSoundOn, soundButtonText } from "./soundSetting.ts";

const memory = () => {
  const items = new Map<string, string>();
  return { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => { items.set(k, v); } };
};
const refusing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };

describe("the speaker switch's remembered setting", () => {
  it("is on by default", () => {
    expect(loadSoundOn(memory())).toBe(true);
    expect(loadSoundOn(null)).toBe(true);
  });

  it("remembers off and on", () => {
    const store = memory();
    saveSoundOn(store, false);
    expect(loadSoundOn(store)).toBe(false);
    saveSoundOn(store, true);
    expect(loadSoundOn(store)).toBe(true);
  });

  it("with storage blocked: on, and saving does nothing", () => {
    expect(loadSoundOn(refusing)).toBe(true);
    expect(() => saveSoundOn(refusing, false)).not.toThrow();
  });

  it("shows a speaker, crossed out when off", () => {
    expect(soundButtonText(true)).toBe("🔊");
    expect(soundButtonText(false)).toBe("🔇");
  });
});
