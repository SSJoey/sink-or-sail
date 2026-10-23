import type { GunnerInput, PilotInput, Vec } from "@sink-or-sail/shared";
import { inStickZone, knobPosition, stickVector } from "./stick.ts";

export type TouchButton = "boost" | "fire" | "shield";

const isZero = (v: Vec) => v.x === 0 && v.y === 0;

/**
 * Which finger (pointer id) holds the stick and each button. Pure: the DOM layer feeds it pointer events.
 * Fire and Shield are exclusive: while one is held, pressing the other does nothing (first pressed wins).
 */
export class TouchControls {
  private readonly radius: number;
  private readonly deadZone: number;
  private stickTouch: { id: number; origin: Vec; current: Vec } | null = null;
  private buttons = new Map<TouchButton, number>();

  constructor(radius: number, deadZone: number) {
    this.radius = radius;
    this.deadZone = deadZone;
  }

  /** Starts the stick under the thumb, if the touch is on the left half and the stick is free. */
  stickStart(id: number, x: number, y: number, screenWidth: number): boolean {
    if (this.stickTouch || !inStickZone(x, screenWidth)) return false;
    this.stickTouch = { id, origin: { x, y }, current: { x, y } };
    return true;
  }

  stickMove(id: number, x: number, y: number): void {
    if (this.stickTouch?.id === id) this.stickTouch.current = { x, y };
  }

  press(id: number, button: TouchButton): boolean {
    if (this.buttons.has(button)) return false;
    if (button === "fire" && this.buttons.has("shield")) return false;
    if (button === "shield" && this.buttons.has("fire")) return false;
    this.buttons.set(button, id);
    return true;
  }

  /** A finger lifted or was cancelled: release whatever it held. */
  pointerEnd(id: number): void {
    if (this.stickTouch?.id === id) this.stickTouch = null;
    for (const [button, owner] of this.buttons) {
      if (owner === id) this.buttons.delete(button);
    }
  }

  releaseAll(): void {
    this.stickTouch = null;
    this.buttons.clear();
  }

  held(button: TouchButton): boolean {
    return this.buttons.has(button);
  }

  stick(): Vec {
    const s = this.stickTouch;
    return s ? stickVector(s.origin, s.current, this.radius, this.deadZone) : { x: 0, y: 0 };
  }

  /** Where to draw the stick while a thumb is on it; null at rest. */
  stickView(): { origin: Vec; knob: Vec } | null {
    const s = this.stickTouch;
    return s ? { origin: s.origin, knob: knobPosition(s.origin, s.current, this.radius) } : null;
  }

  pilotInput(): PilotInput {
    return { steer: this.stick(), boost: this.held("boost") };
  }

  gunnerInput(): GunnerInput {
    return { aim: this.stick(), fire: this.held("fire"), shield: this.held("shield") };
  }
}

/** Keyboard and touch together: a pushed touch stick wins over the keys; boost from either. */
export function mergePilot(keys: PilotInput, touch: PilotInput): PilotInput {
  return { steer: isZero(touch.steer) ? keys.steer : touch.steer, boost: keys.boost || touch.boost };
}

/** Mouse and touch together: a pushed touch stick wins over the mouse; buttons from either. */
export function mergeGunner(mouse: GunnerInput, touch: GunnerInput): GunnerInput {
  return { aim: isZero(touch.aim) ? mouse.aim : touch.aim, fire: mouse.fire || touch.fire, shield: mouse.shield || touch.shield };
}
