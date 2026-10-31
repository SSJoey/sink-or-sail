import { TUNING, type Vec } from "@sink-or-sail/shared";
import { CREW_STYLES } from "./crews.ts";
import { hiddenByStorms } from "./hazardLook.ts";
import type { HazardView } from "./interpolation.ts";

/** What a label needs of each player in the room (in-game names only). */
export interface LabelPlayer {
  name: string;
  crew?: number;
  role?: string;
  bot?: boolean;
}

/** Stage 5 slice 7: a crew's names, pilot first, joined by "+"; a crew of bots (a bot ship) is "Bots". */
export function crewNames(players: readonly LabelPlayer[], crew: number): string {
  const members = players.filter((p) => p.crew === crew).sort((a, b) => (a.role === "pilot" ? -1 : b.role === "pilot" ? 1 : 0));
  if (members.length > 0 && members.every((p) => p.bot === true)) return "Bots";
  return members.map((p) => p.name).join(" + ");
}

/** A ship's label under it on the sea: the crew symbol in the crew colour, then the names in ink ("▲ Ana + Jon"). */
export function shipLabel(players: readonly LabelPlayer[], crew: number): { symbol: string; colour: number; text: string } {
  const style = CREW_STYLES[crew] ?? CREW_STYLES[0];
  return { symbol: style.symbol, colour: style.colour, text: crewNames(players, crew) };
}

/**
 * The label's font size in the game's own pixels (the 1600-wide canvas), whatever the zoom: `fontPx`, or more on a
 * small screen so it is never below `minScreenPx` there. `displayWidth` is the canvas's width on the page.
 */
export function labelFontPx(canvasWidth: number, displayWidth: number): number {
  const L = TUNING.client.labels;
  if (displayWidth <= 0) return L.fontPx;
  return Math.max(L.fontPx, (L.minScreenPx * canvasWidth) / displayWidth);
}

/** A ghost's (faint) label: hidden with the ghost under a moving storm, except from its own crew. */
export const ghostLabelShown = (ghost: Vec, crew: number, ownCrew: number | null, hazards: ReadonlyMap<string, HazardView>) =>
  crew === ownCrew || !hiddenByStorms(ghost, hazards);
