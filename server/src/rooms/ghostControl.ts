import type { Vec } from "@sink-or-sail/shared";

const ZERO: Vec = { x: 0, y: 0 };
const isZero = (v: Vec) => v.x === 0 && v.y === 0;

/**
 * A crew's shared ghost follows whichever crewmate moved it last: the one who most recently changed their
 * direction. While that one is still, it follows the other if they are steering.
 */
export class GhostControl {
  private readonly moves = new Map<string, { vec: Vec; at: number }>();
  private clock = 0;

  /** A crewmate's latest ghost direction (sent at the input rate; only a change counts as a new move). */
  receive(player: string, vec: Vec): void {
    const before = this.moves.get(player);
    if (before && before.vec.x === vec.x && before.vec.y === vec.y) return;
    this.moves.set(player, { vec, at: ++this.clock });
  }

  /** The ghost's direction from these crewmates (the ones seated and connected). */
  steer(players: readonly string[]): Vec {
    const moves = players.flatMap((p) => this.moves.get(p) ?? []).sort((a, b) => b.at - a.at);
    return moves.find((m) => !isZero(m.vec))?.vec ?? ZERO;
  }

  forget(player: string): void {
    this.moves.delete(player);
  }

  clear(): void {
    this.moves.clear();
  }
}
