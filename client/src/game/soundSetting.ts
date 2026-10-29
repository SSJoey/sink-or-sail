/** Stage 4 slice 1: each device remembers its speaker switch (on by default) across matches and reloads. */
const KEY = "sinkOrSail.sound";

type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void };

/** Storage can be missing or refuse (private browsing); the switch then works for the visit and starts on. */
export function loadSoundOn(store: Store | null): boolean {
  try {
    return store?.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveSoundOn(store: Store | null, on: boolean): void {
  try {
    store?.setItem(KEY, on ? "on" : "off");
  } catch {
    // Not remembered; nothing else to do.
  }
}

export const soundButtonText = (on: boolean) => (on ? "🔊" : "🔇");
