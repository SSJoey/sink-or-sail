import type { SimEvent, SoundCue } from "@sink-or-sail/shared";

/** Stage 4 slice 2: the sound cues for one step's events, sent to every client (events with no sound give none). */
export function soundCues(events: readonly SimEvent[]): SoundCue[] {
  const cues: SoundCue[] = [];
  for (const e of events) {
    switch (e.type) {
      case "shotFired": cues.push({ k: "shot", s: [e.ship] }); break;
      case "hit": cues.push({ k: "hit", s: [e.target] }); break;
      case "shotBlocked": cues.push({ k: "blocked", s: [e.target] }); break;
      case "boostStarted": cues.push({ k: "boost", s: [e.ship] }); break;
      case "energyEmpty": cues.push({ k: "empty", s: [e.ship] }); break;
      case "sunk": cues.push({ k: "sunk", s: [e.ship] }); break;
      case "respawned": cues.push({ k: "respawn", s: [e.ship] }); break;
      // A health pack's pickup sounds as the health chord (its healthRestored event).
      case "packPickedUp": if (e.packType !== "health") cues.push({ k: "pickup", s: [e.ship] }); break;
      case "healthRestored": cues.push({ k: "health", s: [e.ship] }); break;
      case "mineDropped": cues.push({ k: "mine", s: [e.owner] }); break;
      case "mineTriggered": cues.push({ k: "boom", s: e.hits.length ? e.hits.map((h) => h.ship) : [e.owner] }); break;
      case "torpedoFired": cues.push({ k: "torpedo", s: [e.owner] }); break;
      case "torpedoHit": cues.push({ k: "boom", s: [e.target] }); break;
      case "empFired": cues.push({ k: "emp", s: [e.ship, ...e.caught] }); break;
      case "wreckDestroyed": cues.push({ k: "wreck", s: e.by === null ? [] : [e.by] }); break;
      case "reefHit": cues.push({ k: "reef", s: [e.ship] }); break;
      case "hazardSignalled": cues.push({ k: "hazard", s: [] }); break;
      case "krakenGrab": cues.push({ k: "kraken", s: [e.ship] }); break;
      case "bump": cues.push({ k: "bump", s: [...e.ships] }); break;
    }
  }
  return cues;
}
