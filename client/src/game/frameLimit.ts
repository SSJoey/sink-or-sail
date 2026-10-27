/**
 * Browser tests only: `?fps=20` in the page address caps how often the game draws (Phaser's own frame limit),
 * so a test machine running many pages at once isn't swamped. Undefined (no limit) for real games.
 */
export function frameLimit(search: string): number | undefined {
  const value = new URLSearchParams(search).get("fps");
  if (value === null || !/^\d+$/.test(value)) return undefined;
  const fps = Number(value);
  return fps >= 1 && fps <= 60 ? fps : undefined;
}
