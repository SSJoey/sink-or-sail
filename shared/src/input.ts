import type { GunnerInput, PilotInput } from "./sim/types.ts";
import { clampLength, type Vec } from "./sim/vec.ts";

// Input messages are the only thing clients send during a match. They are checked strictly:
// a message with a missing, mistyped, non-finite or extra field is rejected as a whole.

type Fields = Record<string, unknown>;

/** All of `required`, and nothing outside `required` and `optional`. */
function hasExactly(value: unknown, required: readonly string[], optional: readonly string[] = []): value is Fields {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return required.every((key) => actual.includes(key)) && actual.every((key) => required.includes(key) || optional.includes(key));
}

function parseVec(value: unknown): Vec | null {
  if (!hasExactly(value, ["x", "y"])) return null;
  const { x, y } = value;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return clampLength({ x, y }, 1);
}

/** The Pack button (Stage 1) is optional, so Stage 0 messages stay valid. */
const parsePack = (fields: Fields): { pack?: boolean } | null => {
  if (!("pack" in fields)) return {};
  return typeof fields.pack === "boolean" ? { pack: fields.pack } : null;
};

export function parsePilotInput(message: unknown): PilotInput | null {
  if (!hasExactly(message, ["steer", "boost"], ["pack"])) return null;
  const steer = parseVec(message.steer);
  const pack = parsePack(message);
  if (steer === null || typeof message.boost !== "boolean" || pack === null) return null;
  return { steer, boost: message.boost, ...pack };
}

export function parseGunnerInput(message: unknown): GunnerInput | null {
  if (!hasExactly(message, ["aim", "fire", "shield"], ["pack"])) return null;
  const aim = parseVec(message.aim);
  const pack = parsePack(message);
  if (aim === null || typeof message.fire !== "boolean" || typeof message.shield !== "boolean" || pack === null) return null;
  return { aim, fire: message.fire, shield: message.shield, ...pack };
}
