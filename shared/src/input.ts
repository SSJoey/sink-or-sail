import type { GunnerInput, PilotInput } from "./sim/types.ts";
import { clampLength, type Vec } from "./sim/vec.ts";

// Input messages are the only thing clients send during a match. They are checked strictly:
// a message with a missing, mistyped, non-finite or extra field is rejected as a whole.

type Fields = Record<string, unknown>;

function hasExactly(value: unknown, keys: readonly string[]): value is Fields {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function parseVec(value: unknown): Vec | null {
  if (!hasExactly(value, ["x", "y"])) return null;
  const { x, y } = value;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return clampLength({ x, y }, 1);
}

export function parsePilotInput(message: unknown): PilotInput | null {
  if (!hasExactly(message, ["steer", "boost"])) return null;
  const steer = parseVec(message.steer);
  if (steer === null || typeof message.boost !== "boolean") return null;
  return { steer, boost: message.boost };
}

export function parseGunnerInput(message: unknown): GunnerInput | null {
  if (!hasExactly(message, ["aim", "fire", "shield"])) return null;
  const aim = parseVec(message.aim);
  if (aim === null || typeof message.fire !== "boolean" || typeof message.shield !== "boolean") return null;
  return { aim, fire: message.fire, shield: message.shield };
}
