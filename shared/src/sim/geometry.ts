import { add, dot, length, normalise, scale, sub, type Vec } from "./vec.ts";

export type Polygon = readonly Vec[];

/** Even-odd rule; works for concave polygons. */
export function pointInPolygon(p: Vec, polygon: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function closestPointOnSegment(p: Vec, a: Vec, b: Vec): Vec {
  const ab = sub(b, a);
  const lengthSq = dot(ab, ab);
  if (lengthSq === 0) return a;
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / lengthSq));
  return add(a, scale(ab, t));
}

export interface Push {
  /** Unit vector pointing out of the polygon. */
  normal: Vec;
  /** How far the circle must move along `normal` to just touch. */
  depth: number;
}

/** If a circle overlaps a polygon, how to push it back out; otherwise null. */
export function circleOverlapsPolygon(centre: Vec, radius: number, polygon: Polygon): Push | null {
  let closest = polygon[0]!;
  let closestDist = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const point = closestPointOnSegment(centre, polygon[i]!, polygon[(i + 1) % polygon.length]!);
    const dist = length(sub(centre, point));
    if (dist < closestDist) {
      closest = point;
      closestDist = dist;
    }
  }
  const inside = pointInPolygon(centre, polygon);
  if (!inside && closestDist >= radius) return null;
  if (closestDist === 0) return null; // exactly on an edge: no direction to push; next tick resolves it
  const away = normalise(sub(centre, closest));
  return inside
    ? { normal: scale(away, -1), depth: closestDist + radius }
    : { normal: away, depth: radius - closestDist };
}

/** Fraction t ∈ [0, 1] along segment p→q where it first crosses segment a→b, or null. */
function segmentsCross(p: Vec, q: Vec, a: Vec, b: Vec): number | null {
  const r = sub(q, p);
  const s = sub(b, a);
  const denom = r.x * s.y - r.y * s.x;
  if (denom === 0) return null;
  const ap = sub(a, p);
  const t = (ap.x * s.y - ap.y * s.x) / denom;
  const u = (ap.x * r.y - ap.y * r.x) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/** Fraction along p→q where the segment first enters the polygon (0 if it starts inside), or null. */
export function segmentPolygonHit(p: Vec, q: Vec, polygon: Polygon): number | null {
  if (pointInPolygon(p, polygon)) return 0;
  let first: number | null = null;
  for (let i = 0; i < polygon.length; i++) {
    const t = segmentsCross(p, q, polygon[i]!, polygon[(i + 1) % polygon.length]!);
    if (t !== null && (first === null || t < first)) first = t;
  }
  return first;
}

/** Fraction along p→q where the segment first touches the circle (0 if it starts inside), or null. */
export function segmentCircleHit(p: Vec, q: Vec, centre: Vec, radius: number): number | null {
  const d = sub(q, p);
  const f = sub(p, centre);
  const c = dot(f, f) - radius * radius;
  if (c <= 0) return 0;
  const a = dot(d, d);
  if (a === 0) return null;
  const b = 2 * dot(f, d);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}
