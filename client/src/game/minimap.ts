import { TUNING, seaCentre, type Polygon, type Vec } from "@sink-or-sail/shared";
import type { Size } from "./camera.ts";
import { CHART } from "./chartLook.ts";
import { CREW_STYLES } from "./crews.ts";
import { hazardAlpha, hiddenByStorms } from "./hazardLook.ts";
import type { HazardView, ShipView } from "./interpolation.ts";

/** Where the sea sits in the minimap's box: its scale and top-left corner (CSS px). */
export interface MinimapFit {
  scale: number;
  x: number;
  y: number;
}

/** Stage 5 slice 3: the whole sea fitted inside the minimap's box, centred. */
export function minimapFit(sea: Size, box: Size): MinimapFit {
  const scale = Math.min(box.width / sea.width, box.height / sea.height);
  return { scale, x: (box.width - sea.width * scale) / 2, y: (box.height - sea.height * scale) / 2 };
}

export function toMinimap(pos: Vec, fit: MinimapFit): Vec {
  return { x: fit.x + pos.x * fit.scale, y: fit.y + pos.y * fit.scale };
}

/** The ships shown as dots: every one afloat, except another crew's hidden in a moving storm (as on the sea). */
export function minimapDots(ships: readonly ShipView[], hazards: ReadonlyMap<string, HazardView>, ownCrew: number | null): { crew: number; x: number; y: number; own: boolean }[] {
  return ships.flatMap((ship, crew) => {
    if (ship.sunk || ship.out) return [];
    if (crew !== ownCrew && hiddenByStorms(ship, hazards)) return [];
    return [{ crew, x: ship.x, y: ship.y, own: crew === ownCrew }];
  });
}

const css = (colour: number) => `#${colour.toString(16).padStart(6, "0")}`;

/**
 * Draws the minimap on its canvas (CSS size `box`): the sea, islands, reefs, the closing storm, the hazards, a dot per
 * ship shown and an outline of the part of the sea in view.
 */
export function drawMinimap(
  canvas: HTMLCanvasElement,
  box: Size,
  m: {
    sea: Size;
    islands: readonly Polygon[];
    reefs: readonly Polygon[];
    stormRadius: number | null;
    hazards: ReadonlyMap<string, HazardView>;
    dots: readonly { crew: number; x: number; y: number; own: boolean }[];
    view: { x: number; y: number; width: number; height: number };
  },
): void {
  const ratio = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(box.width * ratio)) canvas.width = Math.round(box.width * ratio);
  if (canvas.height !== Math.round(box.height * ratio)) canvas.height = Math.round(box.height * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, box.width, box.height);
  const fit = minimapFit(m.sea, box);
  const s = fit.scale;
  ctx.save();
  ctx.translate(fit.x, fit.y);
  ctx.scale(s, s);
  ctx.fillStyle = css(CHART.sea);
  ctx.fillRect(0, 0, m.sea.width, m.sea.height);
  const shape = (poly: Polygon) => {
    ctx.beginPath();
    poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
  };
  ctx.fillStyle = css(CHART.reefWater);
  ctx.strokeStyle = css(CHART.ink);
  ctx.lineWidth = 1 / s;
  for (const reef of m.reefs) {
    shape(reef);
    ctx.fill();
    ctx.setLineDash([2 / s, 2 / s]);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = css(CHART.sand);
  for (const island of m.islands) {
    shape(island);
    ctx.fill();
    ctx.stroke();
  }
  // The closing storm: everything outside its safe circle.
  if (m.stormRadius !== null) {
    ctx.beginPath();
    ctx.rect(0, 0, m.sea.width, m.sea.height);
    ctx.arc(seaCentre(m.sea).x, seaCentre(m.sea).y, Math.max(0, m.stormRadius), 0, Math.PI * 2, true);
    ctx.fillStyle = css(CHART.storm);
    ctx.globalAlpha = 0.45;
    ctx.fill("evenodd");
    ctx.globalAlpha = 1;
  }
  const H = TUNING;
  for (const h of m.hazards.values()) {
    const alpha = hazardAlpha(h);
    if (alpha <= 0) continue;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    if (h.kind === "movingStorm") {
      ctx.arc(h.x, h.y, H.movingStorm.radius, 0, Math.PI * 2);
      ctx.fillStyle = css(CHART.storm);
      ctx.globalAlpha = alpha * 0.7;
      ctx.fill();
    } else if (h.kind === "whirlpool") {
      ctx.arc(h.x, h.y, H.whirlpool.reach, 0, Math.PI * 2);
      ctx.fillStyle = css(CHART.deep);
      ctx.globalAlpha = alpha * 0.5;
      ctx.fill();
    } else if (h.kind === "kraken") {
      ctx.arc(h.x, h.y, H.kraken.bodyRadius * 2, 0, Math.PI * 2);
      ctx.fillStyle = css(CHART.kraken);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  // Ships as dots in their crew colours (your own larger, with an ink ring), then the view's outline.
  for (const dot of m.dots) {
    const at = toMinimap(dot, fit);
    ctx.beginPath();
    ctx.arc(at.x, at.y, dot.own ? 3.5 : 2.5, 0, Math.PI * 2);
    ctx.fillStyle = (CREW_STYLES[dot.crew] ?? CREW_STYLES[0]!).css;
    ctx.fill();
    if (dot.own) {
      ctx.strokeStyle = css(CHART.inkDark);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }
  const corner = toMinimap(m.view, fit);
  ctx.strokeStyle = css(CHART.inkDark);
  ctx.lineWidth = 1;
  ctx.strokeRect(corner.x + 0.5, corner.y + 0.5, m.view.width * s - 1, m.view.height * s - 1);
}
