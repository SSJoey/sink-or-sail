import { describe, expect, it } from "vitest";
import { clearToken, loadToken, saveToken } from "./reconnectToken.ts";

/** Minimal in-memory stand-in for sessionStorage. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() { return items.size; },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (i) => [...items.keys()][i] ?? null,
    removeItem: (key) => { items.delete(key); },
    setItem: (key, value) => { items.set(key, value); },
  };
}

describe("reconnection token", () => {
  it("is empty at first", () => {
    expect(loadToken(memoryStorage())).toBeNull();
  });

  it("can be saved, loaded and cleared", () => {
    const storage = memoryStorage();
    saveToken(storage, "abc:123");
    expect(loadToken(storage)).toBe("abc:123");
    clearToken(storage);
    expect(loadToken(storage)).toBeNull();
  });

  it("ignores storage that throws, as private browsing can", () => {
    const broken = { ...memoryStorage(), getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(() => saveToken(broken, "abc")).not.toThrow();
    expect(loadToken(broken)).toBeNull();
  });
});
