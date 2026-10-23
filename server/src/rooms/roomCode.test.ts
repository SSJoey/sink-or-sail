import { describe, expect, it } from "vitest";
import { CODE_ALPHABET, normaliseCode } from "@sink-or-sail/shared";
import { generateCode, generateUniqueCode } from "./roomCode.ts";

/** Random source that returns the given values in order, then repeats the last. */
function sequence(...values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
}

/** Value that makes generateCode pick the alphabet character at `index`. */
const pick = (index: number) => index / CODE_ALPHABET.length;

describe("generateCode", () => {
  it("makes a 4-character code from the code alphabet", () => {
    for (let n = 0; n < 200; n++) {
      const code = generateCode(Math.random);
      expect(normaliseCode(code)).toBe(code);
    }
  });

  it("maps the random source onto the alphabet", () => {
    expect(generateCode(sequence(pick(0), pick(1), pick(2), pick(23)))).toBe("ABCZ");
    expect(generateCode(sequence(0.999999))).toBe("ZZZZ");
  });
});

describe("generateUniqueCode", () => {
  it("returns the first code when it is free", async () => {
    const code = await generateUniqueCode(sequence(pick(0)), () => false);
    expect(code).toBe("AAAA");
  });

  it("tries again when a code is already in use", async () => {
    const random = sequence(pick(0), pick(0), pick(0), pick(0), pick(1));
    const code = await generateUniqueCode(random, (c) => c === "AAAA");
    expect(code).toBe("BBBB");
  });

  it("accepts an async check, as Colyseus presence is async", async () => {
    const random = sequence(pick(0), pick(0), pick(0), pick(0), pick(1));
    const code = await generateUniqueCode(random, async (c) => c === "AAAA");
    expect(code).toBe("BBBB");
  });

  it("gives up instead of looping forever when every try is taken", async () => {
    await expect(generateUniqueCode(sequence(pick(0)), () => true)).rejects.toThrow(/no free room code/i);
  });
});
