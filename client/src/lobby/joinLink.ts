import { normaliseCode } from "@sink-or-sail/shared";

/** Addresses only this laptop can open: a QR code holding one would be no use to a phone. */
const isLocal = (hostname: string) => hostname === "localhost" || hostname === "[::1]" || hostname === "::1" || /^127\./.test(hostname);

/**
 * Where phones open the game, for the QR code: the page's own address when phones can reach it; on localhost the
 * laptop's Wi-Fi address from the server (JOIN_ADDRESS), on the same port; null when neither is known.
 */
export function joinBase(location: { protocol: string; hostname: string; port: string }, joinAddress: string): string | null {
  const port = location.port ? `:${location.port}` : "";
  if (!isLocal(location.hostname)) return `${location.protocol}//${location.hostname}${port}`;
  return joinAddress ? `${location.protocol}//${joinAddress}${port}` : null;
}

/** The link in the QR code: opening it fills in the room code on the join screen. */
export const joinLink = (base: string, code: string) => `${base}/?code=${code}`;

/** The room code from a join link's address, or null when it has none (or not a valid one). */
export const codeFromSearch = (search: string) => normaliseCode(new URLSearchParams(search).get("code") ?? undefined);
