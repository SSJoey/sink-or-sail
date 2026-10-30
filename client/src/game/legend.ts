import type { Role } from "@sink-or-sail/shared";

/** Stage 5 slice 4: the laptop controls legend, as rows of key and what it does. */
export function legendRows(role: Role, ghost: boolean): [string, string][] {
  if (ghost) return [["W A S D", "Steer your ghost"]];
  if (role === "pilot") return [["W A S D", "Steer"], ["Space", "Boost"], ["E", "Drop the mine"]];
  return [["Mouse", "Aim"], ["Click", "Fire"], ["Right-click", "Shield"], ["E", "Fire the torpedo or EMP"]];
}

/** On laptops (no touch controls), for a crew member during the countdown and the match, unless hidden. */
export function legendShown(s: { seated: boolean; playing: boolean; phone: boolean; hidden: boolean }): boolean {
  return s.seated && s.playing && !s.phone && !s.hidden;
}

const KEY = "sink-or-sail:legendHidden";

/** Hide is remembered on the device (localStorage can be missing or blocked: then it's shown). */
export function loadLegendHidden(store: Storage | null): boolean {
  try {
    return store?.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function saveLegendHidden(store: Storage | null, hidden: boolean): void {
  try {
    store?.setItem(KEY, hidden ? "1" : "0");
  } catch {
    // Not remembered: fine.
  }
}
