import { add, clampLength, length, scale, sub, type Vec } from "@sink-or-sail/shared";

/**
 * Stick output from where the thumb started (`origin`) and where it is now. Zero inside the dead zone,
 * then rising smoothly to length 1 at `radius`, clamped beyond it.
 */
export function stickVector(origin: Vec, touch: Vec, radius: number, deadZone: number): Vec {
  const offset = sub(touch, origin);
  const distance = length(offset);
  const dead = radius * deadZone;
  if (distance <= dead) return { x: 0, y: 0 };
  const strength = Math.min(1, (distance - dead) / (radius - dead));
  return scale(offset, strength / distance);
}

/** Where to draw the knob: under the thumb, but no further than the stick's travel. */
export function knobPosition(origin: Vec, touch: Vec, radius: number): Vec {
  return add(origin, clampLength(sub(touch, origin), radius));
}

/** The stick takes touches that land on the left half of the screen. */
export const inStickZone = (x: number, screenWidth: number) => x < screenWidth / 2;
