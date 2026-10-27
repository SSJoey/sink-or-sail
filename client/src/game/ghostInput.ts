import type { GunnerInput, PilotInput, Role, Vec } from "@sink-or-sail/shared";

const ZERO: Vec = { x: 0, y: 0 };

/** A crew that is out steers its ghost: the touch stick when pushed, otherwise the WASD keys (both roles). */
export const ghostSteer = (keys: Vec, touchStick: Vec): Vec => (touchStick.x !== 0 || touchStick.y !== 0 ? touchStick : keys);

/** The input message of a crewmate whose crew is out: only the ghost's direction; everything else does nothing. */
export function ghostMessage(role: Role, ghost: Vec): PilotInput | GunnerInput {
  return role === "pilot" ? { steer: ZERO, boost: false, ghost } : { aim: ZERO, fire: false, shield: false, ghost };
}
