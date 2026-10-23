import { normalise, type GunnerInput, type PilotInput, type Vec } from "@sink-or-sail/shared";

export interface PilotKeys {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  boost: boolean;
}

/** WASD → an 8-way steer direction of length 1 (screen y points down); Space → boost. */
export function pilotFromKeys(keys: PilotKeys): PilotInput {
  const x = Number(keys.right) - Number(keys.left);
  const y = Number(keys.down) - Number(keys.up);
  return { steer: normalise({ x, y }), boost: keys.boost };
}

/** Aim from the ship toward the mouse (sea coordinates); left button fires, right button shields. */
export function gunnerFromMouse(mouse: Vec | null, ship: Vec, left: boolean, right: boolean): GunnerInput {
  const aim = mouse ? normalise({ x: mouse.x - ship.x, y: mouse.y - ship.y }) : { x: 0, y: 0 };
  return { aim, fire: left, shield: right };
}
