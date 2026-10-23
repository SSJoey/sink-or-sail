/** Polls until `check` passes, so tests wait for the server without fixed sleeps. */
export async function waitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
