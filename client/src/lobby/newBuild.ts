// Each build's main script has a unique hashed name (e.g. /assets/index-Dl-18QML.js). A page left open
// across a server rebuild keeps running old code while reconnecting to the new server, so on joining
// or reconnecting it compares its script with the server's current page and reloads if they differ.

/** The main script's URL in a page's HTML, or null. */
export function mainScript(html: string): string | null {
  return /<script[^>]*type="module"[^>]*src="([^"]+)"/.exec(html)?.[1] ?? null;
}

export function isNewBuild(currentScript: string | null, serverHtml: string): boolean {
  const latest = mainScript(serverHtml);
  return currentScript !== null && latest !== null && latest !== currentScript;
}

/** Reloads the page if the server now serves a newer build. A failed check changes nothing. */
export async function reloadIfNewBuild(fetchHtml: () => Promise<string>, currentScript: string | null, reload: () => void): Promise<boolean> {
  try {
    if (!isNewBuild(currentScript, await fetchHtml())) return false;
  } catch {
    return false;
  }
  reload();
  return true;
}
