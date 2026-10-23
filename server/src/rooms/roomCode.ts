import { CODE_ALPHABET, CODE_LENGTH } from "@sink-or-sail/shared";

/** Returns a number in [0, 1), like Math.random. Injected so tests control it. */
export type RandomSource = () => number;

/** Generous: with ~330,000 codes and a handful of rooms, a retry is already rare. */
const MAX_ATTEMPTS = 100;

export function generateCode(random: RandomSource): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return code;
}

export async function generateUniqueCode(
  random: RandomSource,
  isTaken: (code: string) => boolean | Promise<boolean>,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = generateCode(random);
    if (!(await isTaken(code))) return code;
  }
  throw new Error(`No free room code after ${MAX_ATTEMPTS} attempts`);
}
