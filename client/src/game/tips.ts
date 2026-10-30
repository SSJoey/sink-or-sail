import { Phase, TUNING, type Role } from "@sink-or-sail/shared";

type Need = "packs" | "hazards" | "lastAfloat";

/** Stage 5 slice 4: the tips (approved by the user 2026-10-30), for everyone or one role, some only with a setting on. */
export const TIPS: readonly { text: string; role?: Role; needs?: readonly Need[] }[] = [
  { text: "Boost and Shield share one energy bar: talk before you spend it." },
  { text: "Call out what you see: the pilot watches the bow, the gunner watches the turret." },
  { text: "A glowing ring on the water means a pack is about to appear.", needs: ["packs"] },
  { text: "A health pack doesn't use a slot, and isn't taken at full health.", needs: ["packs"] },
  { text: "A raised shield halves torpedo and mine damage.", needs: ["packs"] },
  { text: "Shots set off armed mines, and the shooter gets the credit.", needs: ["packs"] },
  { text: "Your own mine hits you too: don't sail back over it.", needs: ["packs"] },
  { text: "Smaller ships are faster and turn tighter; bigger ones take more hits." },
  { text: "Reefs slow you down and scrape your hull: go round them.", needs: ["hazards"] },
  { text: "A wreck that glints holds a pack: break it open to get it.", needs: ["hazards"] },
  { text: "Ships inside a moving storm can't be seen.", needs: ["hazards"] },
  { text: "Steer along a whirlpool's edge to slingshot out of it.", needs: ["hazards"] },
  { text: "Out of lives? As a ghost you can make hazards come sooner where you haunt.", needs: ["lastAfloat", "hazards"] },
  { text: "A torpedo goes where your bow points: line it up for your gunner.", role: "pilot", needs: ["packs"] },
  { text: "A mine drops behind your stern: lead a chasing ship over it.", role: "pilot", needs: ["packs"] },
  { text: "An EMP rings your own ship: get close before your gunner fires it.", role: "pilot", needs: ["packs"] },
  { text: "Boost to dodge, but leave energy for your gunner's shield.", role: "pilot" },
  { text: "The turret takes time to swing round: start turning early.", role: "gunner" },
  { text: "Each ship type has its own gun range: your aiming line shows how far.", role: "gunner" },
  { text: "Shield when shots are coming, and drop it when they stop: it drains the bar.", role: "gunner" },
];

/** The tips for this player's role and this match's settings. */
export function tipsFor(s: { role: Role; packs: boolean; hazards: boolean; lastAfloat: boolean }): string[] {
  const on: Record<Need, boolean> = { packs: s.packs, hazards: s.hazards, lastAfloat: s.lastAfloat };
  return TIPS.filter((t) => (!t.role || t.role === s.role) && (t.needs ?? []).every((n) => on[n])).map((t) => t.text);
}

export function pickTip(tips: readonly string[], random: () => number = Math.random): string | null {
  if (tips.length === 0) return null;
  return tips[Math.min(tips.length - 1, Math.floor(random() * tips.length))]!;
}

/** From the 3-2-1 until `tipSeconds` after "Go!" (`elapsed`: seconds of play). */
export function tipShown(phase: string, elapsed: number): boolean {
  return phase === Phase.Countdown || (phase === Phase.Running && elapsed < TUNING.client.tipSeconds);
}
