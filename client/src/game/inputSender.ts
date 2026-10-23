/**
 * Sends the current input at a steady rate (not on every key or mouse event).
 * `current` returns the message to send, or null to skip this tick. Returns a stop function.
 */
export function startInputSender(current: () => unknown | null, send: (message: unknown) => void, rateHz: number): () => void {
  const timer = setInterval(() => {
    const message = current();
    if (message !== null) send(message);
  }, 1000 / rateHz);
  return () => clearInterval(timer);
}
