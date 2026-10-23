export const isPortrait = (width: number, height: number) => height > width;

/** Devices whose main pointer is a finger (phones, tablets). */
export const isTouchFirst = () => window.matchMedia("(pointer: coarse)").matches;

/**
 * Stops the browser's own gestures on the game screen: pinch and double-tap zoom, pull-to-refresh,
 * scrolling, text selection and long-press menus. CSS (touch-action, overscroll-behavior,
 * user-select) does most of it; these listeners cover iOS Safari, which ignores some of the CSS.
 * Returns a function that removes the listeners.
 */
export function blockGestures(el: HTMLElement): () => void {
  const prevent = (e: Event) => e.preventDefault();
  const events = ["gesturestart", "gesturechange", "gestureend", "dblclick", "contextmenu", "selectstart", "touchmove"];
  for (const type of events) el.addEventListener(type, prevent, { passive: false });
  return () => {
    for (const type of events) el.removeEventListener(type, prevent);
  };
}

/** Android: fullscreen, then lock to landscape. Must run inside a user gesture; fails quietly elsewhere (iPhone). */
export async function goFullscreenLandscape(el: HTMLElement): Promise<void> {
  try {
    if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
    // lock() isn't in TypeScript's DOM types everywhere, as only some browsers support it.
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await orientation.lock?.("landscape");
  } catch {
    // Not allowed or not supported: the "rotate your phone" screen covers portrait.
  }
}
