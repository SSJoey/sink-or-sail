import * as Phaser from "phaser";
import { ISLAND, TUNING, packButtonLit, type Role, type Vec } from "@sink-or-sail/shared";
import { CREW_STYLES } from "./crews.ts";
import { ShipEffects, type ShipEffect } from "./effects.ts";
import { aimGuide, dashes, hullPoints, turretEnd } from "./hull.ts";
import type { Frame, PackView, ShipView } from "./interpolation.ts";
import { blinkVisible } from "./matchText.ts";
import { gunnerFromMouse, pilotFromKeys } from "./laptopInput.ts";
import { mergeGunner, mergePilot, type TouchControls } from "./touchControls.ts";

/** What the scene needs from the game: the frame to draw, the local seat, and where to report state. */
export interface SceneLink {
  frame(): Frame | null;
  seat(): { crew: number; role: Role } | null;
  /** Phone controls; merged with keyboard and mouse. */
  touch: TouchControls;
  /** Called every frame with the latest local input (null when the player has no seat). */
  setInput(input: unknown | null): void;
  /** Called every frame after drawing, with each ship's effects (index = ship id). */
  drawn(frame: Frame | null, effects: ShipEffect[]): void;
}

const ISLAND_SAND = 0xd9c48a;
const ISLAND_EDGE = 0x8a7a4a;
const HULL_EDGE = 0x1b1b1b;
const SHIELD = 0x9be7ff;
const PACK_FILL = 0x0b2545;
const PACK_LETTERS: Record<string, string> = { mine: "M", torpedo: "T", emp: "E", health: "H" };

export class GameScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private keys!: Record<"W" | "A" | "S" | "D" | "SPACE" | "E", Phaser.Input.Keyboard.Key>;
  /** One letter label per pack on the map (Graphics can't draw text). */
  private packLetters = new Map<string, Phaser.GameObjects.Text>();
  private mouseSeen = false;
  private readonly effects = new ShipEffects(TUNING.client.hitFlashMs, TUNING.client.sinkFadeMs);

  private readonly link: SceneLink;

  constructor(link: SceneLink) {
    super("game");
    this.link = link;
  }

  create(): void {
    this.g = this.add.graphics();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,SPACE,E") as typeof this.keys;
    this.input.mouse?.disableContextMenu();
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (pointer === this.input.mousePointer) this.mouseSeen = true;
    });
  }

  update(): void {
    const frame = this.link.frame();
    const seat = this.link.seat();
    const now = performance.now();
    const effects = frame ? frame.ships.map((ship, id) => this.effects.update(id, ship, now)) : [];
    this.draw(frame, seat?.crew ?? null, effects);
    this.link.setInput(this.readInput(frame, seat));
    this.link.drawn(frame, effects);
  }

  private readInput(frame: Frame | null, seat: { crew: number; role: Role } | null): unknown | null {
    if (!seat) return null;
    const touch = this.link.touch;
    const ship = frame?.ships[seat.crew];
    // A dim Pack button does nothing: only send it when this role can use what's loaded.
    const lit = packButtonLit(ship?.held ?? null, seat.role);
    if (seat.role === "pilot") {
      const k = this.keys;
      const keys = pilotFromKeys({ up: k.W.isDown, left: k.A.isDown, down: k.S.isDown, right: k.D.isDown, boost: k.SPACE.isDown, pack: k.E.isDown });
      const input = mergePilot(keys, touch.pilotInput());
      return { ...input, pack: lit && !!input.pack };
    }
    // The mouse specifically: never a touch pointer, even if Phaser ever sees one.
    const pointer = this.input.mousePointer!;
    const mouse = this.mouseSeen ? { x: pointer.worldX, y: pointer.worldY } : null;
    const fromMouse = gunnerFromMouse(ship ? mouse : null, ship ?? { x: 0, y: 0 }, pointer.leftButtonDown(), pointer.rightButtonDown(), this.keys.E.isDown);
    const input = mergeGunner(fromMouse, touch.gunnerInput());
    return { ...input, pack: lit && !!input.pack };
  }

  private draw(frame: Frame | null, ownCrew: number | null, effects: ShipEffect[]): void {
    const g = this.g;
    g.clear();

    this.polygon(ISLAND, ISLAND_SAND, ISLAND_EDGE);
    this.drawPacks(frame?.packs ?? new Map());
    if (!frame) return;

    if (ownCrew !== null) {
      const own = frame.ships[ownCrew];
      if (own && !own.sunk) this.drawAimGuide(own);
    }

    frame.ships.forEach((ship, crew) => {
      const effect = effects[crew];
      if (!ship.sunk) this.drawShip(ship, crew, effect?.flashing ?? false, 1);
      else if (effect?.sinkAlpha) this.drawShip(ship, crew, false, effect.sinkAlpha);
    });

    g.fillStyle(0xffffff, 1);
    for (const shot of frame.shots.values()) g.fillCircle(shot.x, shot.y, 4);
  }

  /** Glowing spots pulse; packs on the water show their shape and letter (M circle, T capsule, E diamond, H square). */
  private drawPacks(packs: Map<string, PackView>): void {
    const g = this.g;
    const r = TUNING.packs.radius;
    const pulse = (Math.sin(performance.now() / 150) + 1) / 2;
    for (const [id, pack] of packs) {
      if (pack.signalled) {
        g.lineStyle(3, 0xffffff, 0.35 + 0.5 * pulse);
        g.strokeCircle(pack.x, pack.y, r + 4 + 8 * pulse);
        continue;
      }
      g.fillStyle(PACK_FILL, 0.9);
      g.lineStyle(2, 0xffffff, 1);
      const { x, y } = pack;
      if (pack.type === "mine") {
        g.fillCircle(x, y, r);
        g.strokeCircle(x, y, r);
      } else if (pack.type === "torpedo") {
        g.fillRoundedRect(x - r, y - r * 0.55, 2 * r, 1.1 * r, r * 0.55);
        g.strokeRoundedRect(x - r, y - r * 0.55, 2 * r, 1.1 * r, r * 0.55);
      } else if (pack.type === "emp") {
        this.polygon([{ x, y: y - r }, { x: x + r, y }, { x, y: y + r }, { x: x - r, y }], PACK_FILL, 0xffffff, 0.9);
      } else {
        g.fillRect(x - r * 0.85, y - r * 0.85, 1.7 * r, 1.7 * r);
        g.strokeRect(x - r * 0.85, y - r * 0.85, 1.7 * r, 1.7 * r);
      }
      let letter = this.packLetters.get(id);
      if (!letter) {
        letter = this.add.text(x, y, PACK_LETTERS[pack.type] ?? "?", { fontFamily: "sans-serif", fontSize: "18px", fontStyle: "bold", color: "#ffffff" }).setOrigin(0.5);
        this.packLetters.set(id, letter);
      }
    }
    // Remove letters for packs that are gone or only glowing.
    for (const [id, letter] of this.packLetters) {
      const pack = packs.get(id);
      if (!pack || pack.signalled) {
        letter.destroy();
        this.packLetters.delete(id);
      }
    }
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

  /** `fade` < 1 while a sunk ship fades out; protection makes the ship see-through and blink. */
  private drawShip(ship: ShipView, crew: number, flashing: boolean, fade: number): void {
    const g = this.g;
    const style = CREW_STYLES[crew] ?? CREW_STYLES[0];
    const protectedAlpha = blinkVisible(ship.protection, TUNING.client.protectionBlinkHz) ? 0.6 : 0.2;
    const alpha = (ship.protection > 0 ? protectedAlpha : 1) * fade;

    if (ship.boosting) {
      g.lineStyle(3, 0xffffff, 0.5 * alpha);
      const back = Math.PI + ship.heading;
      for (const side of [-0.35, 0.35]) {
        const from = { x: ship.x + Math.cos(back + side) * 26, y: ship.y + Math.sin(back + side) * 26 };
        g.lineBetween(from.x, from.y, from.x + Math.cos(back + side) * 22, from.y + Math.sin(back + side) * 22);
      }
    }

    this.polygon(hullPoints(ship, ship.heading), flashing ? 0xffffff : style.colour, HULL_EDGE, alpha);

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
