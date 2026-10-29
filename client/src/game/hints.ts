import { TUNING, type PackType, type Role, type Vec } from "@sink-or-sail/shared";

/**
 * Stage 4 slice 8: first-match control hints. Each hint sits by its control (or, on a laptop, in one line of keys)
 * until that control is first used on this device, which remembers it; any left fade after `hintSeconds` of play.
 */
export type HintSpot = "left" | "boost" | "fire" | "shield" | "pack" | "keys";
export interface Hint {
  spot: HintSpot;
  text: string;
  /** The remembered controls that would clear it ("Hide hints" marks them used). */
  keys: string[];
}

export interface HintSituation {
  role: Role;
  /** Touch controls are showing (a phone); otherwise keys and mouse. */
  phone: boolean;
  /** The crew is out and steers its ghost. */
  ghost: boolean;
  /** The pack this role can use now (lit Pack button), or null. */
  pack: PackType | null;
  /** Seconds of play so far (0 during the countdown). */
  elapsed: number;
}

const device = (s: HintSituation) => (s.phone ? "phone" : "laptop");
const key = (s: HintSituation, control: string) => `${device(s)}:${s.ghost ? "ghost" : s.role}:${control}`;

const PACK_TEXT: Partial<Record<PackType, string>> = { mine: "Drop your mine", torpedo: "Fire your torpedo", emp: "Fire your EMP" };

/** The hints to show now; `used` holds the controls already used on this device (see usedControls). */
export function hintsFor(s: HintSituation, used: ReadonlySet<string>): Hint[] {
  if (s.elapsed >= TUNING.client.hintSeconds) return [];
  const open = (control: string) => !used.has(key(s, control));
  const hints: Hint[] = [];
  if (s.ghost) {
    if (open("steer")) hints.push({ ...(s.phone ? { spot: "left", text: "Steer your ghost: the stick" } : { spot: "keys", text: "Steer your ghost: W A S D" }), keys: [key(s, "steer")] } as Hint);
    return hints;
  }
  if (!s.phone) {
    // One line of keys, until both the role's main controls have been used.
    const [a, b, text] = s.role === "pilot"
      ? ["steer", "boost", "W A S D steer · Space boost · E drop the mine"]
      : ["fire", "shield", "Mouse aims · click fires · right-click shields · E fires the pack"];
    if (open(a) || open(b)) hints.push({ spot: "keys", text, keys: [key(s, a), key(s, b)] });
    return hints;
  }
  const add = (control: string, spot: HintSpot, text: string) => {
    if (open(control)) hints.push({ spot, text, keys: [key(s, control)] });
  };
  if (s.role === "pilot") {
    add("steer", "left", "Touch anywhere on this side to steer");
    add("boost", "boost", "Hold for speed (uses energy)");
  } else {
    add("aim", "left", "Touch anywhere on this side to aim");
    add("fire", "fire", "Hold to fire");
    add("shield", "shield", "Hold to block shots (uses energy)");
  }
  const packText = s.pack ? PACK_TEXT[s.pack] : undefined;
  if (packText) add("pack", "pack", packText);
  return hints;
}

type Input = { steer?: Vec; aim?: Vec; boost?: boolean; fire?: boolean; shield?: boolean; pack?: boolean; ghost?: Vec };
const moved = (v: Vec | undefined) => !!v && Math.hypot(v.x, v.y) > 0.3;

/** The controls this frame's input used, as remembered keys. */
export function usedControls(s: HintSituation, input: Input | null): string[] {
  if (!input) return [];
  if (s.ghost) return moved(input.ghost) ? [key(s, "steer")] : [];
  const used: string[] = [];
  if (moved(input.steer)) used.push(key(s, "steer"));
  if (moved(input.aim)) used.push(key(s, "aim"));
  if (input.boost) used.push(key(s, "boost"));
  if (input.fire) used.push(key(s, "fire"));
  if (input.shield) used.push(key(s, "shield"));
  if (input.pack) used.push(key(s, "pack"));
  return used;
}

const STORE_KEY = "sinkOrSail.hints";
type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void };

/** Storage can be missing, refuse or hold something else; the hints then simply show again. */
export function loadUsedHints(store: Store | null): Set<string> {
  try {
    const list = JSON.parse(store?.getItem(STORE_KEY) ?? "[]");
    return new Set(Array.isArray(list) ? list.filter((k): k is string => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

export function saveUsedHints(store: Store | null, used: ReadonlySet<string>): void {
  try {
    store?.setItem(STORE_KEY, JSON.stringify([...used]));
  } catch {
    // Not remembered; nothing else to do.
  }
}
