import { TUNING, type Vec } from "@sink-or-sail/shared";

export interface Size {
  width: number;
  height: number;
}

/**
 * Browser tests only (Stage 5 slice 3): `?view=0.5` shows that fraction of the usual view, so the follow camera and
 * the minimap can be tried on today's one-screen sea. Undefined (the usual view) for real games.
 */
export function viewSetting(search: string): number | undefined {
  const value = new URLSearchParams(search).get("view");
  if (value === null || !/^\d*\.?\d+$/.test(value)) return undefined;
  const scale = Number(value);
  return scale > 0 && scale <= 1 ? scale : undefined;
}

/**
 * How much sea a player sees: the usual view (times the test-only `scale`), kept inside the sea. On a sea bigger
 * than that, a Long gun's crew sees `longGunView` times as much each way (in whole sea units); on a one-screen sea
 * everyone sees it all.
 */
export function viewSize(sea: Size, opts: { scale?: number; longGun: boolean }): Size {
  const { view, longGunView } = TUNING.client.camera;
  const base = { width: view.width * (opts.scale ?? 1), height: view.height * (opts.scale ?? 1) };
  if (!isBigSea(sea, base)) return { width: sea.width, height: sea.height };
  const grow = opts.longGun ? longGunView : 1;
  // Whole sea units.
  return { width: Math.min(sea.width, Math.round(base.width * grow)), height: Math.min(sea.height, Math.round(base.height * grow)) };
}

/** The sea doesn't fit in the view: the camera follows and the minimap shows. */
export function isBigSea(sea: Size, view: Size): boolean {
  return view.width < sea.width || view.height < sea.height;
}

/** Where the view's centre goes to look at `focus`: on it, but never showing past the sea's edges. */
export function cameraCentre(focus: Vec, view: Size, sea: Size): Vec {
  const along = (at: number, seen: number, whole: number) => (seen >= whole ? whole / 2 : Math.min(whole - seen / 2, Math.max(seen / 2, at)));
  return { x: along(focus.x, view.width, sea.width), y: along(focus.y, view.height, sea.height) };
}

/** One frame of the camera's glide: `rate` of the gap closed. */
export function glide(from: Vec, to: Vec, rate: number): Vec {
  return { x: from.x + (to.x - from.x) * rate, y: from.y + (to.y - from.y) * rate };
}

/** What the camera follows: your ship (where it sank, until it respawns), your ghost once your crew is out, or nothing. */
export function cameraFocus(ships: readonly (Vec & { out: boolean })[], ghosts: ReadonlyMap<string, Vec>, ownCrew: number | null): Vec | null {
  if (ownCrew === null) return null;
  const ship = ships[ownCrew];
  if (!ship) return null;
  const ghost = ship.out ? ghosts.get(String(ownCrew)) : undefined;
  return ghost ? { x: ghost.x, y: ghost.y } : { x: ship.x, y: ship.y };
}
