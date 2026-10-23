// Kept in sessionStorage so a page reload can rejoin the same seat (per the Colyseus reconnection docs).
const KEY = "sink-or-sail:reconnectionToken";

// Storage can throw (private browsing, blocked site data); reconnection then just doesn't survive a reload.
export function saveToken(storage: Storage, token: string): void {
  try { storage.setItem(KEY, token); } catch { /* ignore */ }
}

export function loadToken(storage: Storage): string | null {
  try { return storage.getItem(KEY); } catch { return null; }
}

export function clearToken(storage: Storage): void {
  try { storage.removeItem(KEY); } catch { /* ignore */ }
}
