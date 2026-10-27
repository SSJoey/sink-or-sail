import * as Phaser from "phaser";
import { PACK_LETTERS, SEA_CENTRE, TUNING, circleOverlapsPolygon, packButtonLit, rolePack, wreckHull, zoneRect, type PackType, type Polygon, type Role, type Vec, type WreckSpot } from "@sink-or-sail/shared";
import { CREW_STYLES } from "./crews.ts";
import { ShipEffects, type ShipEffect } from "./effects.ts";
import { EmpRings } from "./empRing.ts";
import { aimGuide, dashes, hullPoints, turretEnd } from "./hull.ts";
import { hazardAlpha, hiddenByStorms, krakenTentacles, whirlpoolArms } from "./hazardLook.ts";
import type { Frame, GhostView, HazardView, MineView, PackView, ShipView, WreckView } from "./interpolation.ts";
import { blinkVisible, packBlinkVisible } from "./matchText.ts";
import { gunnerFromMouse, pilotFromKeys } from "./laptopInput.ts";
import { mergeGunner, mergePilot, type TouchControls } from "./touchControls.ts";
import { ghostMessage, ghostSteer } from "./ghostInput.ts";
import { WreckFlashes, crackLines, wreckPieces } from "./wreckLook.ts";

/** What the scene needs from the game: the frame to draw, the local seat, and where to report state. */
export interface SceneLink {
  frame(): Frame | null;
  /** The match's islands (Stage 2 layouts) and reefs (none with hazards off). */
  islands(): readonly Polygon[];
  reefs(): readonly Polygon[];
  /** The match layout's wreck spots (the frame says which still stand). */
  wrecks(): readonly WreckSpot[];
  /** Stage 2: the closing storm's safe-circle radius now, or null for a match without the storm. */
  stormRadius(): number | null;
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
const REEF_WATER = 0x5fb3c9;
const REEF_EDGE = 0xd9f2f7;
const HULL_EDGE = 0x1b1b1b;
const SHIELD = 0x9be7ff;
const PACK_FILL = 0x0b2545;
const WRECK_WOOD = 0x5a3b22;
const WRECK_EDGE = 0x2b1a0e;
const STORM_CLOUD = 0x2b2f3a;
const STORM_EDGE = 0x9aa3b5;
const STORM_FLASH = 0xff4d4d;
const MOVING_STORM_CLOUD = 0x3b4150;
const MOVING_STORM_SWIRL = 0xc9d1e0;
const WHIRLPOOL_WATER = 0x123d70;
const WHIRLPOOL_FOAM = 0xcfeaff;
const WHIRLPOOL_EYE = 0x08182f;
const KRAKEN_SKIN = 0x6b2f7a;
const KRAKEN_EDGE = 0x2a0f33;

export class GameScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private keys!: Record<"W" | "A" | "S" | "D" | "SPACE" | "E", Phaser.Input.Keyboard.Key>;
  /** One letter label per pack on the map (Graphics can't draw text). */
  private packLetters = new Map<string, Phaser.GameObjects.Text>();
  private mouseSeen = false;
  /** E went down since the last input read. Phaser handles key events once per frame, so a quick tap whose
   *  down and up land in the same frame never shows as "down"; the keydown event still fires. */
  private eTapped = false;
  private readonly effects = new ShipEffects(TUNING.client.hitFlashMs, TUNING.client.sinkFadeMs);
  private readonly empRings = new EmpRings();
  private readonly wreckFlashes = new WreckFlashes(TUNING.client.hitFlashMs);
  /** Kraken bodies flash when shot (tracked like wrecks, on their health). */
  private readonly krakenFlashes = new WreckFlashes(TUNING.client.hitFlashMs);
  /** Closing-storm and kraken hits flash the hull red (tracked like gun hits, on the ship's count of both). */
  private readonly stormEffects = new ShipEffects(TUNING.client.hitFlashMs, TUNING.client.sinkFadeMs);

  private readonly link: SceneLink;

  constructor(link: SceneLink) {
    super("game");
    this.link = link;
  }

  create(): void {
    this.g = this.add.graphics();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,SPACE,E") as typeof this.keys;
    this.input.keyboard!.on("keydown-E", () => { this.eTapped = true; });
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
    const stormFlashes = frame ? frame.ships.map((ship, id) => this.stormEffects.update(id, { hits: ship.stormHits + ship.krakenHits, sunk: ship.sunk }, now).flashing) : [];
    if (frame) this.empRings.update(frame.ships, now);
    this.draw(frame, seat?.crew ?? null, effects, stormFlashes);
    this.link.setInput(this.readInput(frame, seat));
    this.link.drawn(frame, effects);
  }

  private readInput(frame: Frame | null, seat: { crew: number; role: Role } | null): unknown | null {
    if (!seat) return null;
    const touch = this.link.touch;
    const ship = frame?.ships[seat.crew];
    // A dim Pack button does nothing: only send it when this role can use what's loaded (and no EMP is on us).
    const lit = packButtonLit(ship ? rolePack(ship, seat.role) : null, seat.role) && !(ship && ship.disabled > 0);
    const ePressed = this.keys.E.isDown || this.eTapped;
    this.eTapped = false;
    // Stage 2: a crew that is out steers its ghost: WASD or the stick, in both roles; nothing else does anything.
    if (ship?.out) {
      const k = this.keys;
      const keys = pilotFromKeys({ up: k.W.isDown, left: k.A.isDown, down: k.S.isDown, right: k.D.isDown, boost: false, pack: false }).steer;
      return ghostMessage(seat.role, ghostSteer(keys, touch.stick()));
    }
    if (seat.role === "pilot") {
      const k = this.keys;
      const keys = pilotFromKeys({ up: k.W.isDown, left: k.A.isDown, down: k.S.isDown, right: k.D.isDown, boost: k.SPACE.isDown, pack: ePressed });
      const input = mergePilot(keys, touch.pilotInput());
      return { ...input, pack: lit && !!input.pack };
    }
    // The mouse specifically: never a touch pointer, even if Phaser ever sees one.
    const pointer = this.input.mousePointer!;
    const mouse = this.mouseSeen ? { x: pointer.worldX, y: pointer.worldY } : null;
    const fromMouse = gunnerFromMouse(ship ? mouse : null, ship ?? { x: 0, y: 0 }, pointer.leftButtonDown(), pointer.rightButtonDown(), ePressed);
    const input = mergeGunner(fromMouse, touch.gunnerInput());
    return { ...input, pack: lit && !!input.pack };
  }

  private draw(frame: Frame | null, ownCrew: number | null, effects: ShipEffect[], stormFlashes: boolean[]): void {
    const g = this.g;
    g.clear();

    for (const reef of this.link.reefs()) this.reef(reef);
    for (const island of this.link.islands()) this.polygon(island, ISLAND_SAND, ISLAND_EDGE);
    if (frame) this.drawWrecks(frame.wrecks);
    // Stage 2 whirlpools are water: drawn under everything that floats; haunted zones' fog the same.
    if (frame) this.drawWhirlpools(frame.hazards);
    if (frame) this.drawHaunting(frame.zones);
    // The storm covers the sea, islands and wrecks; packs, mines and ships stay clear on top of it.
    const stormRadius = this.link.stormRadius();
    if (stormRadius !== null) this.drawStorm(stormRadius);
    this.drawPacks(frame?.packs ?? new Map(), frame?.hazards ?? new Map());
    if (!frame) return;
    this.drawMines(frame.mines);

    const drawOne = (ship: ShipView, crew: number) => {
      const effect = effects[crew];
      const flash = effect?.flashing ? 0xffffff : stormFlashes[crew] ? STORM_FLASH : null;
      if (!ship.sunk) this.drawShip(ship, crew, flash, 1);
      else if (effect?.sinkAlpha) this.drawShip(ship, crew, null, effect.sinkAlpha);
    };
    frame.ships.forEach((ship, crew) => {
      if (crew !== ownCrew) drawOne(ship, crew);
    });
    // Stage 2 krakens: above the ships, so tentacles wrap the one held.
    this.drawKrakens(frame);
    for (const torpedo of frame.torpedoes.values()) this.drawTorpedo(torpedo.x, torpedo.y, torpedo.angle);

    this.drawGhosts(frame.ghosts);

    // Stage 2 moving storms cover everything above, with islands, reefs and wrecks showing faintly through.
    // Shots stay visible on top (like tracers), and so do your own ship and its aiming guide.
    this.drawMovingStorms(frame);
    g.fillStyle(0xffffff, 1);
    for (const shot of frame.shots.values()) g.fillCircle(shot.x, shot.y, 4);
    if (ownCrew !== null) {
      const own = frame.ships[ownCrew];
      if (own && !own.sunk) this.drawAimGuide(own);
      if (own) drawOne(own, ownCrew);
    }

    // EMP rings: grow from the firing ship, then fade.
    for (const ring of this.empRings.active(performance.now())) {
      g.lineStyle(4, 0x7fd8ff, ring.alpha);
      g.strokeCircle(ring.x, ring.y, ring.radius);
      g.fillStyle(0x7fd8ff, 0.12 * ring.alpha);
      g.fillCircle(ring.x, ring.y, ring.radius);
    }
  }

  /**
   * Glowing spots pulse; packs on the water show their shape and letter (M circle, T capsule, E diamond, H square),
   * and blink in their last seconds before they disappear.
   */
  private drawPacks(packs: Map<string, PackView>, hazards: Map<string, HazardView>): void {
    const g = this.g;
    const r = TUNING.packs.radius;
    const pulse = (Math.sin(performance.now() / 150) + 1) / 2;
    for (const [id, pack] of packs) {
      if (pack.signalled) {
        g.lineStyle(3, 0xffffff, 0.35 + 0.5 * pulse);
        g.strokeCircle(pack.x, pack.y, r + 4 + 8 * pulse);
        continue;
      }
      const visible = packBlinkVisible(pack.lifeLeft);
      // Letters are drawn above everything, so one under a moving storm is hidden here.
      this.packLetters.get(id)?.setVisible(visible && !hiddenByStorms(pack, hazards));
      if (!visible) continue;
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
        letter = this.add.text(x, y, PACK_LETTERS[pack.type as PackType] ?? "?", { fontFamily: "sans-serif", fontSize: "18px", fontStyle: "bold", color: "#ffffff" }).setOrigin(0.5);
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

  /**
   * Wrecks still standing: a dark wooden hull broken in two, with cracks as it takes damage; it flashes when
   * hit, and a pulsing glint marks one that holds a pack.
   */
  private drawWrecks(wrecks: Map<string, WreckView>): void {
    const g = this.g;
    const spots = this.link.wrecks();
    const now = performance.now();
    const pulse = (Math.sin(now / 200) + 1) / 2;
    for (const [id, wreck] of wrecks) {
      const spot = spots[Number(id)];
      if (!spot) continue;
      const flashing = this.wreckFlashes.update(id, wreck.health, now);
      for (const piece of wreckPieces(spot)) this.polygon(piece, flashing ? 0xffffff : WRECK_WOOD, WRECK_EDGE);
      g.lineStyle(2, WRECK_EDGE, 1);
      for (const [a, b] of crackLines(spot, wreck.health)) g.lineBetween(a.x, a.y, b.x, b.y);
      if (wreck.hasPack) {
        // A four-pointed glint on the deck.
        const { x, y } = spot.pos;
        const r = 7 + 5 * pulse;
        g.fillStyle(0xfff4c2, 0.55 + 0.45 * pulse);
        g.fillTriangle(x - r, y, x + r, y, x, y - 3);
        g.fillTriangle(x - r, y, x + r, y, x, y + 3);
        g.fillTriangle(x, y - r, x, y + r, x - 3, y);
        g.fillTriangle(x, y - r, x, y + r, x + 3, y);
      }
    }
  }

  /** Mines, visible to everyone: hollow grey with spikes until armed, then solid red with a blinking ring. */
  private drawMines(mines: Map<string, MineView>): void {
    const g = this.g;
    const r = TUNING.mine.radius;
    const blink = Math.floor(performance.now() / 250) % 2 === 0;
    for (const mine of mines.values()) {
      const { x, y } = mine;
      if (mine.armed) {
        g.fillStyle(0xd7263d, 1);
        g.fillCircle(x, y, r * 0.8);
        if (blink) {
          g.lineStyle(2, 0xff8a8a, 1);
          g.strokeCircle(x, y, r);
        }
      } else {
        g.lineStyle(2, 0xb0b0b0, 1);
        g.strokeCircle(x, y, r * 0.8);
      }
      g.lineStyle(2, mine.armed ? 0xd7263d : 0xb0b0b0, 1);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        g.lineBetween(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8, x + Math.cos(a) * r * 1.15, y + Math.sin(a) * r * 1.15);
      }
    }
  }

  /** A torpedo: a dark capsule 22 × 8 pointing the way it travels, with a short white wake. */
  private drawTorpedo(x: number, y: number, angle: number): void {
    const g = this.g;
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    const side = { x: -dir.y, y: dir.x };
    g.lineStyle(2, 0xffffff, 0.6);
    for (const s of [-3, 3]) {
      g.lineBetween(x - dir.x * 11 + side.x * s, y - dir.y * 11 + side.y * s, x - dir.x * 26 + side.x * s * 1.6, y - dir.y * 26 + side.y * s * 1.6);
    }
    g.lineStyle(8, 0x1b1b1b, 1);
    g.lineBetween(x - dir.x * 7, y - dir.y * 7, x + dir.x * 7, y + dir.y * 7);
    g.fillStyle(0x1b1b1b, 1);
    g.fillCircle(x - dir.x * 7, y - dir.y * 7, 4);
    g.fillCircle(x + dir.x * 7, y + dir.y * 7, 4);
    g.lineStyle(1, 0xffffff, 0.9);
    g.strokeCircle(x + dir.x * 7, y + dir.y * 7, 4);
  }

  private drawSparks(ship: ShipView, alpha: number): void {
    const g = this.g;
    const t = Math.floor(performance.now() / 90);
    g.lineStyle(2, 0x7fd8ff, alpha);
    for (let i = 0; i < 4; i++) {
      // A few short zig-zags whose angles change every 90 ms, so they flicker.
      const a = ((t * 7 + i * 13) % 24) * (Math.PI / 12);
      const r1 = 14;
      const r2 = 30;
      const mid = a + 0.25;
      g.lineBetween(ship.x + Math.cos(a) * r1, ship.y + Math.sin(a) * r1, ship.x + Math.cos(mid) * 22, ship.y + Math.sin(mid) * 22);
      g.lineBetween(ship.x + Math.cos(mid) * 22, ship.y + Math.sin(mid) * 22, ship.x + Math.cos(a) * r2, ship.y + Math.sin(a) * r2);
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

  /** `flash` is the hit-flash colour (white for a hit, red for the storm), or null; `fade` < 1 while a sunk ship fades out; protection makes the ship see-through and blink. */
  private drawShip(ship: ShipView, crew: number, flash: number | null, fade: number): void {
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

    // EMP'd: grey hull with flickering blue sparks.
    const disabled = ship.disabled > 0;
    this.polygon(hullPoints(ship, ship.heading), flash ?? (disabled ? 0x8a8a8a : style.colour), HULL_EDGE, alpha);
    if (disabled) this.drawSparks(ship, alpha);

    // Crew flag near the stern: ● for crew 1, ■ for crew 2, ▲ for crew 3.
    const flag = { x: ship.x - Math.cos(ship.heading) * 14, y: ship.y - Math.sin(ship.heading) * 14 };
    g.fillStyle(0xffffff, alpha);
    if (crew === 0) g.fillCircle(flag.x, flag.y, 5);
    else if (crew === 1) g.fillRect(flag.x - 5, flag.y - 5, 10, 10);
    else g.fillTriangle(flag.x, flag.y - 6, flag.x + 6, flag.y + 5, flag.x - 6, flag.y + 5);

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

  /**
   * The closing storm: dark cloud over the sea outside the safe circle, with a jagged, shifting edge, and the
   * final circle as a faint dashed line (shown all match, so crews know where to head).
   */
  private drawStorm(radius: number): void {
    const g = this.g;
    const { x, y } = SEA_CENTRE;
    const S = TUNING.closingStorm;
    // A filled ring from the circle out past every corner, in segments that don't overlap (so the shade is even).
    const outer = S.startRadius + 40;
    const segments = 72;
    g.fillStyle(STORM_CLOUD, 0.55);
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const b = ((i + 1) / segments) * Math.PI * 2;
      const inA = { x: x + radius * Math.cos(a), y: y + radius * Math.sin(a) };
      const inB = { x: x + radius * Math.cos(b), y: y + radius * Math.sin(b) };
      const outA = { x: x + outer * Math.cos(a), y: y + outer * Math.sin(a) };
      const outB = { x: x + outer * Math.cos(b), y: y + outer * Math.sin(b) };
      g.fillTriangle(inA.x, inA.y, outA.x, outA.y, outB.x, outB.y);
      g.fillTriangle(inA.x, inA.y, outB.x, outB.y, inB.x, inB.y);
    }
    const t = performance.now() / 400;
    g.lineStyle(3, STORM_EDGE, 0.8);
    g.beginPath();
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const r = radius + 6 * Math.sin(a * 9 + t) + 4 * Math.sin(a * 23 - t * 1.7);
      if (i === 0) g.moveTo(x + r * Math.cos(a), y + r * Math.sin(a));
      else g.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
    }
    g.strokePath();
    g.lineStyle(2, 0xffffff, 0.35);
    for (let i = 0; i < 90; i += 2) {
      const a = (i / 90) * Math.PI * 2;
      const b = ((i + 1) / 90) * Math.PI * 2;
      g.lineBetween(x + S.endRadius * Math.cos(a), y + S.endRadius * Math.sin(a), x + S.endRadius * Math.cos(b), y + S.endRadius * Math.sin(b));
    }
  }

  /**
   * Stage 2 moving storms. Signalled: a pulsing dashed ring where it will form, with an arrow the way it will move.
   * Active: a dark, billowing cloud with slowly turning swirls; it fades out at the end. Islands, reefs and standing
   * wrecks under a cloud show faintly through it as outlines.
   */
  private drawMovingStorms(frame: Frame): void {
    const g = this.g;
    const R = TUNING.movingStorm.radius;
    const now = performance.now();
    const t = now / 1000;
    const pulse = (Math.sin(now / 150) + 1) / 2;
    const clouds: { x: number; y: number; alpha: number }[] = [];
    for (const h of frame.hazards.values()) {
      if (h.kind !== "movingStorm") continue;
      if (h.phase === "signalled") {
        g.lineStyle(3, 0xffffff, 0.35 + 0.5 * pulse);
        for (let i = 0; i < 48; i += 2) {
          const a = (i / 48) * Math.PI * 2 + t * 0.5;
          const b = ((i + 1) / 48) * Math.PI * 2 + t * 0.5;
          g.lineBetween(h.x + R * Math.cos(a), h.y + R * Math.sin(a), h.x + R * Math.cos(b), h.y + R * Math.sin(b));
        }
        const dir = { x: Math.cos(h.heading), y: Math.sin(h.heading) };
        const tip = { x: h.x + dir.x * 60, y: h.y + dir.y * 60 };
        g.lineBetween(h.x - dir.x * 30, h.y - dir.y * 30, tip.x, tip.y);
        g.fillStyle(0xffffff, 0.35 + 0.5 * pulse);
        g.fillTriangle(tip.x + dir.x * 14, tip.y + dir.y * 14, tip.x - dir.y * 12, tip.y + dir.x * 12, tip.x + dir.y * 12, tip.y - dir.x * 12);
        continue;
      }
      const alpha = hazardAlpha(h);
      if (alpha <= 0) continue;
      clouds.push({ x: h.x, y: h.y, alpha });
      g.fillStyle(MOVING_STORM_CLOUD, 0.96 * alpha);
      g.fillCircle(h.x, h.y, R);
      // A billowing edge: puffs around the rim that swell and shrink.
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + t * 0.25;
        const r = R - 8 + 6 * Math.sin(t * 1.3 + i * 1.7);
        g.fillCircle(h.x + r * Math.cos(a), h.y + r * Math.sin(a), 20 + 4 * Math.sin(t * 2 + i));
      }
      g.lineStyle(2, MOVING_STORM_SWIRL, 0.35 * alpha);
      for (let k = 0; k < 3; k++) {
        const start = t * 0.9 + k * 2.1;
        g.beginPath();
        g.arc(h.x, h.y, R * (0.3 + 0.22 * k), start, start + 2.2);
        g.strokePath();
      }
    }
    if (clouds.length === 0) return;
    const under = (shape: Polygon) => clouds.some((c) => circleOverlapsPolygon(c, R + 24, shape) !== null);
    const faint = Math.max(...clouds.map((c) => c.alpha)) * 0.45;
    const spots = this.link.wrecks();
    const wrecks = [...frame.wrecks.keys()].flatMap((id) => (spots[Number(id)] ? [wreckHull(spots[Number(id)]!)] : []));
    for (const [shapes, colour] of [[this.link.islands(), ISLAND_SAND], [this.link.reefs(), REEF_EDGE], [wrecks, WRECK_WOOD]] as const) {
      g.lineStyle(2, colour, faint);
      for (const shape of shapes) {
        if (!under(shape)) continue;
        g.beginPath();
        g.moveTo(shape[0]!.x, shape[0]!.y);
        for (const p of shape.slice(1)) g.lineTo(p.x, p.y);
        g.closePath();
        g.strokePath();
      }
    }
  }

  /**
   * Stage 2 whirlpools. Signalled: a dashed ring at the edge of its reach with arrows turning the way it will spin.
   * Active: darker water out to its reach, three turning spiral arms of foam and a dark eye; it fades out at the end.
   */
  private drawWhirlpools(hazards: Map<string, HazardView>): void {
    const g = this.g;
    const W = TUNING.whirlpool;
    const now = performance.now();
    const t = now / 1000;
    const pulse = (Math.sin(now / 150) + 1) / 2;
    for (const h of hazards.values()) {
      if (h.kind !== "whirlpool") continue;
      if (h.phase === "signalled") {
        const turn = h.spin * t * 0.8;
        g.lineStyle(3, 0xffffff, 0.35 + 0.5 * pulse);
        for (let i = 0; i < 60; i += 2) {
          const a = (i / 60) * Math.PI * 2 + turn;
          const b = ((i + 1) / 60) * Math.PI * 2 + turn;
          g.lineBetween(h.x + W.reach * Math.cos(a), h.y + W.reach * Math.sin(a), h.x + W.reach * Math.cos(b), h.y + W.reach * Math.sin(b));
        }
        // Four arrowheads on the ring, pointing the way it will turn.
        g.fillStyle(0xffffff, 0.35 + 0.5 * pulse);
        for (let k = 0; k < 4; k++) {
          const a = (k * Math.PI) / 2 + turn;
          const p = { x: h.x + W.reach * Math.cos(a), y: h.y + W.reach * Math.sin(a) };
          const along = { x: -Math.sin(a) * h.spin, y: Math.cos(a) * h.spin };
          const out = { x: Math.cos(a), y: Math.sin(a) };
          g.fillTriangle(p.x + along.x * 16, p.y + along.y * 16, p.x + out.x * 10, p.y + out.y * 10, p.x - out.x * 10, p.y - out.y * 10);
        }
        continue;
      }
      const alpha = hazardAlpha(h);
      if (alpha <= 0) continue;
      g.fillStyle(WHIRLPOOL_WATER, 0.45 * alpha);
      g.fillCircle(h.x, h.y, W.reach);
      g.lineStyle(2, WHIRLPOOL_FOAM, 0.25 * alpha);
      g.strokeCircle(h.x, h.y, W.reach);
      g.lineStyle(4, WHIRLPOOL_FOAM, 0.6 * alpha);
      for (const arm of whirlpoolArms(h, t)) {
        g.beginPath();
        g.moveTo(arm[0]!.x, arm[0]!.y);
        for (const p of arm.slice(1)) g.lineTo(p.x, p.y);
        g.strokePath();
      }
      g.fillStyle(WHIRLPOOL_EYE, 0.85 * alpha);
      g.fillCircle(h.x, h.y, W.eyeRadius);
    }
  }

  /**
   * Stage 2 krakens. Signalled: rings of ripples spreading from where it will surface, with bubbles. Active: a dark
   * purple body with eyes looking the way it swims and eight waving tentacles (wrapping the ship it holds); it
   * flashes white when shot and fades out when it dives.
   */
  private drawKrakens(frame: Frame): void {
    const g = this.g;
    const K = TUNING.kraken;
    const now = performance.now();
    const t = now / 1000;
    for (const [id, h] of frame.hazards) {
      if (h.kind !== "kraken") continue;
      if (h.phase === "signalled") {
        for (let i = 0; i < 3; i++) {
          const k = ((t * 0.8 + i / 3) % 1 + 1) % 1;
          g.lineStyle(3, 0xffffff, 0.7 * (1 - k));
          g.strokeCircle(h.x, h.y, 10 + k * K.grabReach);
        }
        g.fillStyle(0xffffff, 0.7);
        for (let i = 0; i < 6; i++) {
          const a = i * 2.4 + t * 0.7;
          const r = 12 + ((i * 17 + Math.floor(t * 4)) % 40);
          g.fillCircle(h.x + Math.cos(a) * r, h.y + Math.sin(a) * r, 3 + (i % 3));
        }
        continue;
      }
      const alpha = hazardAlpha(h);
      if (alpha <= 0) continue;
      const flashing = this.krakenFlashes.update(`k${id}`, h.health, now);
      const held = h.holding >= 0 ? frame.ships[h.holding] ?? null : null;
      g.lineStyle(7, flashing ? 0xffffff : KRAKEN_SKIN, alpha);
      for (const arm of krakenTentacles(h, t, held && !held.sunk ? held : null)) {
        g.beginPath();
        g.moveTo(arm[0]!.x, arm[0]!.y);
        for (const p of arm.slice(1)) g.lineTo(p.x, p.y);
        g.strokePath();
      }
      g.fillStyle(flashing ? 0xffffff : KRAKEN_SKIN, alpha);
      g.lineStyle(3, KRAKEN_EDGE, alpha);
      g.fillCircle(h.x, h.y, K.bodyRadius);
      g.strokeCircle(h.x, h.y, K.bodyRadius);
      const ahead = { x: Math.cos(h.heading), y: Math.sin(h.heading) };
      for (const side of [-1, 1]) {
        const eye = { x: h.x + ahead.x * 14 - ahead.y * 11 * side, y: h.y + ahead.y * 14 + ahead.x * 11 * side };
        g.fillStyle(0xfff3b0, alpha);
        g.fillCircle(eye.x, eye.y, 7);
        g.fillStyle(0x111111, alpha);
        g.fillCircle(eye.x + ahead.x * 3, eye.y + ahead.y * 3, 3);
      }
    }
  }

  /**
   * Stage 2 ghosts: a faint dashed hull outline in the crew's colour with its symbol, pointing the way it last moved,
   * with no turret and no fill, so it can't be mistaken for a ship.
   */
  private drawGhosts(ghosts: Map<string, GhostView>): void {
    const g = this.g;
    for (const [id, ghost] of ghosts) {
      const crew = Number(id);
      const style = CREW_STYLES[crew] ?? CREW_STYLES[0];
      const hull = hullPoints(ghost, ghost.heading);
      g.lineStyle(3, style.colour, 0.85);
      hull.forEach((p, i) => {
        for (const [a, b] of dashes(p, hull[(i + 1) % hull.length]!, 6, 5)) g.lineBetween(a.x, a.y, b.x, b.y);
      });
      const flag = { x: ghost.x - Math.cos(ghost.heading) * 14, y: ghost.y - Math.sin(ghost.heading) * 14 };
      g.lineStyle(2, 0xffffff, 0.7);
      if (crew === 0) g.strokeCircle(flag.x, flag.y, 5);
      else if (crew === 1) g.strokeRect(flag.x - 5, flag.y - 5, 10, 10);
      else g.strokeTriangle(flag.x, flag.y - 6, flag.x + 6, flag.y + 5, flag.x - 6, flag.y + 5);
    }
  }

  /**
   * Stage 2 haunting: as a zone's meter fills, its water darkens and fog thickens over it (slowly drifting puffs),
   * for everyone, so living crews can see danger building.
   */
  private drawHaunting(zones: number[]): void {
    const g = this.g;
    const t = performance.now() / 1000;
    zones.forEach((meter, zone) => {
      if (meter <= 0) return;
      const r = zoneRect(zone);
      g.fillStyle(0x0b1530, 0.35 * meter);
      g.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
      g.fillStyle(0xdfe6f2, 0.14 * meter);
      for (let i = 0; i < 7; i++) {
        const px = r.x0 + (((i * 0.37 + t * 0.02 * (1 + (i % 3))) % 1) + 1) % 1 * (r.x1 - r.x0);
        const py = r.y0 + ((i * 0.61) % 1) * (r.y1 - r.y0) + Math.sin(t * 0.5 + i) * 12;
        g.fillCircle(px, py, 40 + 25 * meter + (i % 3) * 10);
      }
    });
  }

  /** A reef: lighter, shallow water with a dotted edge, so it doesn't read as an island. */
  private reef(points: readonly Vec[]): void {
    const g = this.g;
    g.fillStyle(REEF_WATER, 0.55);
    g.beginPath();
    g.moveTo(points[0]!.x, points[0]!.y);
    for (const p of points.slice(1)) g.lineTo(p.x, p.y);
    g.closePath();
    g.fillPath();
    g.lineStyle(2, REEF_EDGE, 0.9);
    points.forEach((p, i) => {
      for (const [a, b] of dashes(p, points[(i + 1) % points.length]!, 4, 6)) g.lineBetween(a.x, a.y, b.x, b.y);
    });
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
