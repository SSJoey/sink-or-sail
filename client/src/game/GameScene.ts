import * as Phaser from "phaser";
import { ISLAND, TUNING, type Role, type Vec } from "@sink-or-sail/shared";
import { CREW_STYLES } from "./crews.ts";
import { aimGuide, dashes, hullPoints, turretEnd } from "./hull.ts";
import type { Frame, ShipView } from "./interpolation.ts";
import { gunnerFromMouse, pilotFromKeys } from "./laptopInput.ts";

/** What the scene needs from the game: the frame to draw, the local seat, and where to report state. */
export interface SceneLink {
  frame(): Frame | null;
  seat(): { crew: number; role: Role } | null;
  /** Called every frame with the latest local input (null when the player has no seat). */
  setInput(input: unknown | null): void;
  /** Called every frame after drawing. */
  drawn(frame: Frame | null): void;
}

const ISLAND_SAND = 0xd9c48a;
const ISLAND_EDGE = 0x8a7a4a;
const HULL_EDGE = 0x1b1b1b;
const SHIELD = 0x9be7ff;

export class GameScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private keys!: Record<"W" | "A" | "S" | "D" | "SPACE", Phaser.Input.Keyboard.Key>;
  private mouseSeen = false;

  private readonly link: SceneLink;

  constructor(link: SceneLink) {
    super("game");
    this.link = link;
  }

  create(): void {
    this.g = this.add.graphics();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,SPACE") as typeof this.keys;
    this.input.mouse?.disableContextMenu();
    this.input.on("pointermove", () => { this.mouseSeen = true; });
  }

  update(): void {
    const frame = this.link.frame();
    const seat = this.link.seat();
    this.draw(frame, seat?.crew ?? null);
    this.link.setInput(this.readInput(frame, seat));
    this.link.drawn(frame);
  }

  private readInput(frame: Frame | null, seat: { crew: number; role: Role } | null): unknown | null {
    if (!seat) return null;
    if (seat.role === "pilot") {
      const k = this.keys;
      return pilotFromKeys({ up: k.W.isDown, left: k.A.isDown, down: k.S.isDown, right: k.D.isDown, boost: k.SPACE.isDown });
    }
    const ship = frame?.ships[seat.crew];
    const pointer = this.input.activePointer;
    const mouse = this.mouseSeen ? { x: pointer.worldX, y: pointer.worldY } : null;
    return gunnerFromMouse(ship ? mouse : null, ship ?? { x: 0, y: 0 }, pointer.leftButtonDown(), pointer.rightButtonDown());
  }

  private draw(frame: Frame | null, ownCrew: number | null): void {
    const g = this.g;
    g.clear();

    this.polygon(ISLAND, ISLAND_SAND, ISLAND_EDGE);
    if (!frame) return;

    if (ownCrew !== null) {
      const own = frame.ships[ownCrew];
      if (own && !own.sunk) this.drawAimGuide(own);
    }

    frame.ships.forEach((ship, crew) => {
      if (!ship.sunk) this.drawShip(ship, crew);
    });

    g.fillStyle(0xffffff, 1);
    for (const shot of frame.shots.values()) g.fillCircle(shot.x, shot.y, 4);
  }

  private drawAimGuide(ship: ShipView): void {
    const g = this.g;
    const guide = aimGuide(ship, ship.turret);
    g.fillStyle(0xffffff, 0.08);
    g.fillTriangle(ship.x, ship.y, guide.coneLeft.x, guide.coneLeft.y, guide.coneRight.x, guide.coneRight.y);
    g.lineStyle(2, 0xffffff, 0.6);
    for (const [a, b] of dashes(ship, guide.end, 12, 8)) g.lineBetween(a.x, a.y, b.x, b.y);
    const c = guide.crosshair;
    g.strokeCircle(c.x, c.y, 10);
    g.lineBetween(c.x - 16, c.y, c.x - 6, c.y);
    g.lineBetween(c.x + 6, c.y, c.x + 16, c.y);
    g.lineBetween(c.x, c.y - 16, c.x, c.y - 6);
    g.lineBetween(c.x, c.y + 6, c.x, c.y + 16);
  }

  private drawShip(ship: ShipView, crew: number): void {
    const g = this.g;
    const style = CREW_STYLES[crew] ?? CREW_STYLES[0];
    const alpha = ship.protection > 0 ? 0.4 : 1;

    if (ship.boosting) {
      g.lineStyle(3, 0xffffff, 0.5 * alpha);
      const back = Math.PI + ship.heading;
      for (const side of [-0.35, 0.35]) {
        const from = { x: ship.x + Math.cos(back + side) * 26, y: ship.y + Math.sin(back + side) * 26 };
        g.lineBetween(from.x, from.y, from.x + Math.cos(back + side) * 22, from.y + Math.sin(back + side) * 22);
      }
    }

    this.polygon(hullPoints(ship, ship.heading), style.colour, HULL_EDGE, alpha);

    // Crew flag near the stern: ● for crew 1, ■ for crew 2.
    const flag = { x: ship.x - Math.cos(ship.heading) * 14, y: ship.y - Math.sin(ship.heading) * 14 };
    g.fillStyle(0xffffff, alpha);
    if (crew === 0) g.fillCircle(flag.x, flag.y, 5);
    else g.fillRect(flag.x - 5, flag.y - 5, 10, 10);

    const end = turretEnd(ship, ship.turret);
    g.lineStyle(6, HULL_EDGE, alpha);
    g.lineBetween(ship.x, ship.y, end.x, end.y);
    g.fillStyle(HULL_EDGE, alpha);
    g.fillCircle(ship.x, ship.y, 7);

    if (ship.shielding) {
      g.lineStyle(3, SHIELD, 0.9);
      g.strokeCircle(ship.x, ship.y, TUNING.ship.radius + 8);
    }
  }

  private polygon(points: readonly Vec[], fill: number, edge: number, alpha = 1): void {
    const g = this.g;
    g.fillStyle(fill, alpha);
    g.lineStyle(2, edge, alpha);
    g.beginPath();
    g.moveTo(points[0]!.x, points[0]!.y);
    for (const p of points.slice(1)) g.lineTo(p.x, p.y);
    g.closePath();
    g.fillPath();
    g.strokePath();
  }
}
