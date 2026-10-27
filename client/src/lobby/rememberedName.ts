/** The device remembers the last name used and fills it in on the next visit (Stage 3). */
const KEY = "sinkOrSail.name";

type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void };

/** Storage can be missing or refuse (private browsing); the name is then simply not remembered. */
export function loadName(store: Store | null): string {
  try {
    return store?.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveName(store: Store | null, name: string): void {
  try {
    store?.setItem(KEY, name);
  } catch {
    // Not remembered; nothing else to do.
  }
}
