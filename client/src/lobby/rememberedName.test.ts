import { describe, expect, it } from "vitest";
import { loadName, saveName } from "./rememberedName.ts";

const memory = () => {
  const items = new Map<string, string>();
  return { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v) };
};

describe("remembering your name on this device (Stage 3)", () => {
  it("gives back the last name used", () => {
    const store = memory();
    expect(loadName(store)).toBe("");
    saveName(store, "Ana");
    expect(loadName(store)).toBe("Ana");
  });

  it("copes with storage that is missing or refuses (private browsing)", () => {
    const broken = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); } };
    expect(loadName(broken)).toBe("");
    expect(() => saveName(broken, "Ana")).not.toThrow();
    expect(loadName(null)).toBe("");
  });
});
