import type { Role } from "@sink-or-sail/shared";
import type { TouchButton, TouchControls } from "./touchControls.ts";

/** Where the stick rests when no thumb is on it: this far from the layer's bottom-left corner (CSS px). */
const REST_INSET = 120;

const byId = (id: string) => document.getElementById(id)!;

export interface TouchLayer {
  /** Shows the controls (stays on once shown). */
  activate(): void;
  readonly active: boolean;
  /** Updates which controls show and where the stick is drawn; call every frame. */
  update(role: Role | null): void;
  destroy(): void;
}

/**
 * Wires the touch overlay (#touch) to the controller. The overlay covers the whole game area,
 * so touches never reach the canvas. Stick touches start on the left half; buttons are elements
 * with data-button. Every finger is captured, so its moves and release come back here.
 */
export function createTouchLayer(controls: TouchControls): TouchLayer {
  const layer = byId("touch");
  const base = byId("stick-base");
  const knob = byId("stick-knob");
  const buttons: Record<TouchButton, HTMLElement> = {
    boost: byId("btn-boost"),
    fire: byId("btn-fire"),
    shield: byId("btn-shield"),
  };
  let active = false;

  const local = (e: PointerEvent) => {
    const rect = layer.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, width: rect.width };
  };

  const onDown = (e: PointerEvent) => {
    e.preventDefault();
    const button = (e.target as HTMLElement).closest<HTMLElement>("[data-button]")?.dataset.button as TouchButton | undefined;
    const accepted = button
      ? controls.press(e.pointerId, button)
      : (() => {
          const p = local(e);
          return controls.stickStart(e.pointerId, p.x, p.y, p.width);
        })();
    if (accepted) layer.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    const p = local(e);
    controls.stickMove(e.pointerId, p.x, p.y);
  };
  const onEnd = (e: PointerEvent) => controls.pointerEnd(e.pointerId);
  const onHidden = () => controls.releaseAll();

  layer.addEventListener("pointerdown", onDown);
  layer.addEventListener("pointermove", onMove);
  layer.addEventListener("pointerup", onEnd);
  layer.addEventListener("pointercancel", onEnd);
  layer.addEventListener("lostpointercapture", onEnd);
  document.addEventListener("visibilitychange", onHidden);
  window.addEventListener("blur", onHidden);

  const place = (el: HTMLElement, x: number, y: number) => {
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  };

  return {
    activate() {
      active = true;
      layer.hidden = false;
    },
    get active() {
      return active;
    },
    update(role) {
      if (!active) return;
      const seated = role !== null;
      base.hidden = !seated;
      knob.hidden = !seated;
      buttons.boost.hidden = role !== "pilot";
      buttons.fire.hidden = role !== "gunner";
      buttons.shield.hidden = role !== "gunner";
      if (!seated) {
        controls.releaseAll();
        return;
      }
      for (const [name, el] of Object.entries(buttons)) el.classList.toggle("held", controls.held(name as TouchButton));

      const view = controls.stickView();
      const rest = { x: REST_INSET, y: layer.clientHeight - REST_INSET };
      const origin = view?.origin ?? rest;
      const knobAt = view?.knob ?? rest;
      place(base, origin.x, origin.y);
      place(knob, knobAt.x, knobAt.y);
      base.classList.toggle("held", view !== null);
    },
    destroy() {
      controls.releaseAll();
      layer.removeEventListener("pointerdown", onDown);
      layer.removeEventListener("pointermove", onMove);
      layer.removeEventListener("pointerup", onEnd);
      layer.removeEventListener("pointercancel", onEnd);
      layer.removeEventListener("lostpointercapture", onEnd);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("blur", onHidden);
      layer.hidden = true;
    },
  };
}
