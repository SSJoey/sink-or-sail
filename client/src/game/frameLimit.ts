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

/**
 * Browser tests only (2026-10-30): `?sceneDelay=4000` holds back the game scene's start by that many milliseconds,
 * like a slow device loading the sea, so a test can check what shows without it. Undefined (no delay) for real games.
 */
export function sceneDelay(search: string): number | undefined {
  const value = new URLSearchParams(search).get("sceneDelay");
  if (value === null || !/^\d+$/.test(value)) return undefined;
  const ms = Number(value);
  return ms >= 1 && ms <= 10_000 ? ms : undefined;
}
