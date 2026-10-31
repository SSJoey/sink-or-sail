import * as Phaser from "phaser";
import { TUNING, circleOverlapsPolygon, packButtonLit, rolePack, seaCentre, seaScale, statsOf, wreckHull, zoneRect, type Polygon, type Role, type Sea, type Vec, type WreckSpot } from "@sink-or-sail/shared";
import { CHART, compassSpot, gridLines, inkOutline, offsetPolygon, palmSpots, reefMarks, waveSpots } from "./chartLook.ts";
import { CREW_STYLES, crewFlag } from "./crews.ts";
import { ShipEffects, type ShipEffect } from "./effects.ts";
import { EmpRings } from "./empRing.ts";
import { aimGuide, dashes, deckLines, hullPoints, shotTrail, turretEnd } from "./hull.ts";
import { hazardAlpha, hiddenByStorms, krakenTentacles, stormHatch, whirlpoolArms } from "./hazardLook.ts";
import { LIFEBAR_TICKS, lifebarColour, lifebarFill, lifebarShown } from "./lifebar.ts";
import { flameSpots, hullCracks, isDamaged, smokePuffs } from "./damageLook.ts";
import { PACK_ICONS } from "./packIcons.ts";
import type { Frame, GhostView, HazardView, MineView, PackView, ShipView, WreckView } from "./interpolation.ts";
import { blinkVisible, packBlinkVisible } from "./matchText.ts";
import { gunnerFromMouse, pilotFromKeys } from "./laptopInput.ts";
import { mergeGunner, mergePilot, type TouchControls } from "./touchControls.ts";
import { ghostMessage, ghostSteer } from "./ghostInput.ts";
import { WreckFlashes, crackLines, wreckPieces } from "./wreckLook.ts";
import { cameraCentre, cameraFocus, glide, viewSize } from "./camera.ts";
import { ghostLabelShown, labelFontPx, shipLabel, type LabelPlayer } from "./labels.ts";

/** What the scene needs from the game: the frame to draw, the local seat, and where to report state. */
export interface SceneLink {
  frame(): Frame | null;
  /** Stage 5: the match's sea (today's 1600 × 900, or bigger with more ships). */
  sea(): Sea;
  /** The match's islands (Stage 2 layouts) and reefs (none with hazards off). */
  islands(): readonly Polygon[];
  reefs(): readonly Polygon[];
  /** The match layout's wreck spots (the frame says which still stand). */
  wrecks(): readonly WreckSpot[];
  /** Stage 4: changes when the islands or reefs do (a new match's layout or reefs), so the chart is redrawn. */
  chartKey(): string;
  /** Called when the chart layer has been drawn, with what it holds (for the browser tests). */
  chartDrawn(marks: { waves: number; palms: number; reefMarks: number }): void;
  /** Stage 2: the closing storm's safe-circle radius now, or null for a match without the storm. */
  stormRadius(): number | null;
  seat(): { crew: number; role: Role } | null;
  /** Stage 5 slice 7: the room's players (in-game names only), for the crews' name labels. */
  players(): readonly LabelPlayer[];
  /** Phone controls; merged with keyboard and mouse. */
  touch: TouchControls;
  /** Called every frame with the latest local input (null when the player has no seat). */
  setInput(input: unknown | null): void;
  /**
   * Called every frame after drawing, with each ship's effects (index = ship id), the part of the sea in view and
   * the name labels shown ("crew:names", a ghost's "g crew:names").
   */
  drawn(frame: Frame | null, effects: ShipEffect[], view: SeaRect, labels: readonly string[]): void;
  /** Stage 5 slice 3, browser tests only: the `?view=…` fraction of the usual view (undefined for real games). */
  viewScale?: number;
}

/** A part of the sea (sea units): its top-left corner and size. */
export interface SeaRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Stage 4 slice 3: the sea, islands, reefs and wrecks in the sea-chart look; marks on the pale sea in its ink.
const INK = CHART.ink;
const INK_DARK = CHART.inkDark;
const ISLAND_SAND = CHART.sand;
const REEF_EDGE = CHART.ink;
const HULL_EDGE = CHART.inkDark;
const SHIELD = CHART.shield;
const PACK_FILL = CHART.cream;
const WRECK_WOOD = CHART.wood;
const WRECK_EDGE = CHART.ink;
const MINE_UNARMED = 0x6b5a45;
/** Stage 4 slice 4: an armed mine's blinking ring (the chart's red). */
const MINE_ARMED = 0xb23a2e;
// Stage 4 slice 5: the hazards in the chart's inks.
const STORM_CLOUD = CHART.storm;
const STORM_EDGE = INK_DARK;
const STORM_FLASH = 0xff4d4d;
// Stage 4 slice 6: the lifebar's fill in chart tones (same rules as Stage 3).
const LIFEBAR_COLOURS = { green: 0x3e7b3a, amber: 0xd9a02b, red: 0xb23a2e } as const;
const FLAME_OUTER = 0xb23a2e;
const FLAME_INNER = 0xf2c14e;
const SMOKE = 0x5a5048;
const MOVING_STORM_CLOUD = CHART.storm;
const MOVING_STORM_SWIRL = CHART.cream;
const WHIRLPOOL_WATER = CHART.deep;
const WHIRLPOOL_FOAM = INK;
const WHIRLPOOL_EYE = INK_DARK;
const KRAKEN_SKIN = CHART.kraken;
const KRAKEN_EDGE = INK_DARK;

/** Stage 5 slice 7: how far a type's hull reaches from its middle (any heading), so its label sits clear below it. */
const reach = new Map<string, number>();
function hullReach(type: ShipView["type"]): number {
  let r = reach.get(type);
  if (r === undefined) {
    r = Math.max(...hullPoints({ x: 0, y: 0 }, 0, type).map((p) => Math.hypot(p.x, p.y)));
    reach.set(type, r);
  }
  return r;
}

export class GameScene extends Phaser.Scene {
  /** Stage 4: the sea, islands and reefs, drawn once per match (they never change during one). */
  private chart!: Phaser.GameObjects.Graphics;
  private chartKey = "";
  private g!: Phaser.GameObjects.Graphics;
  private keys!: Record<"W" | "A" | "S" | "D" | "SPACE" | "E", Phaser.Input.Keyboard.Key>;
  /** One icon per pack on the map (Stage 3 pack icons; Graphics can't draw images). */
  private packIcons = new Map<string, Phaser.GameObjects.Image>();
  private mouseSeen = false;
  /** E went down since the last input read. Phaser handles key events once per frame, so a quick tap whose
   *  down and up land in the same frame never shows as "down"; the keydown event still fires. */
  private eTapped = false;
  private effects = new ShipEffects(TUNING.client.hitFlashMs, TUNING.client.sinkFadeMs);
  private empRings = new EmpRings();
  private wreckFlashes = new WreckFlashes(TUNING.client.hitFlashMs);
  /** Kraken bodies flash when shot (tracked like wrecks, on their health). */
  private krakenFlashes = new WreckFlashes(TUNING.client.hitFlashMs);
  /** Closing-storm and kraken hits flash the hull red (tracked like gun hits, on the ship's count of both). */
  private stormEffects = new ShipEffects(TUNING.client.hitFlashMs, TUNING.client.sinkFadeMs);
  /** Stage 5 slice 7: the name labels on the sea, by ship ("3") or ghost ("g3"), with the text and size they were laid out for. */
  private labels = new Map<string, { box: Phaser.GameObjects.Container; key: string }>();
  /** Stage 5 slice 3: the follow camera's centre now (null until the match's first frame: it starts there). */
  private cameraAt: Vec | null = null;

  /** Stage 5 slice 3: the scene stays for the whole visit; each match's game view attaches its own link. */
  private link!: SceneLink;
  private attached = false;
  private created = false;

  constructor() {
    super("game");
  }

  /** A new match's game view: fresh effects, the chart and pack icons redrawn, the camera starting on the ship. */
  attach(link: SceneLink): void {
    this.link = link;
    this.attached = true;
    this.effects = new ShipEffects(TUNING.client.hitFlashMs, TUNING.client.sinkFadeMs);
    this.empRings = new EmpRings();
    this.wreckFlashes = new WreckFlashes(TUNING.client.hitFlashMs);
    this.krakenFlashes = new WreckFlashes(TUNING.client.hitFlashMs);
    this.stormEffects = new ShipEffects(TUNING.client.hitFlashMs, TUNING.client.sinkFadeMs);
    this.cameraAt = null;
    this.chartKey = "";
    this.eTapped = false;
    for (const icon of this.packIcons.values()) icon.destroy();
    this.packIcons.clear();
    for (const label of this.labels.values()) label.box.destroy();
    this.labels.clear();
    if (this.created) this.input.keyboard!.resetKeys().enableGlobalCapture();
  }

  /** The game view closed (back to the lobby): nothing drawn or read until the next match attaches. */
  detach(): void {
    this.attached = false;
    // Keys pressed in the lobby (typing a name) go to the page, not the sleeping game.
    if (this.created) this.input.keyboard!.resetKeys().disableGlobalCapture();
  }

  /**
   * Stage 5 slice 7: the crew's names under every ship afloat ("▲ Ana + Jon"), for everyone, hidden with the ship (in a
   * moving storm, or sunk), and faintly under a ghost. Ink on a cream backing, the same size on the screen at any zoom.
   * Returns what is shown, for the browser tests.
   */
  private drawLabels(frame: Frame | null, ownCrew: number | null): string[] {
    const L = TUNING.client.labels;
    const players = this.link.players();
    const wanted = new Map<string, { x: number; y: number; crew: number; alpha: number }>();
    if (frame) {
      frame.ships.forEach((ship, crew) => {
        if (lifebarShown(ship, crew, ownCrew, frame.hazards)) wanted.set(String(crew), { x: ship.x, y: ship.y + hullReach(ship.type), crew, alpha: 1 });
      });
      for (const [id, ghost] of frame.ghosts) {
        const crew = Number(id);
        if (ghostLabelShown(ghost, crew, ownCrew, frame.hazards)) wanted.set(`g${id}`, { x: ghost.x, y: ghost.y + hullReach("frigate"), crew, alpha: L.ghostAlpha });
      }
    }
    const font = labelFontPx(TUNING.sea.width, this.scale.displaySize.width);
    const zoom = this.cameras.main.zoom;
    const shown: string[] = [];
    for (const [id, at] of wanted) {
      const label = shipLabel(players, at.crew);
      if (!label.text) continue;
      const key = `${label.symbol} ${label.text}@${font.toFixed(1)}`;
      let entry = this.labels.get(id);
      if (!entry || entry.key !== key) {
        entry?.box.destroy();
        entry = { box: this.makeLabel(label, font), key };
        this.labels.set(id, entry);
      }
      // Kept the same size on the screen: the camera's zoom undone.
      entry.box.setPosition(at.x, at.y + L.gap / zoom).setScale(1 / zoom).setAlpha(at.alpha).setVisible(true);
      shown.push(`${id}:${label.symbol} ${label.text}`);
    }
    for (const [id, entry] of this.labels) {
      if (!wanted.has(id)) entry.box.setVisible(false);
    }
    return shown;
  }

  /** One label: the symbol in the crew colour and the names in ink, side by side on a cream backing, its top at 0. */
  private makeLabel(label: { symbol: string; colour: number; text: string }, font: number): Phaser.GameObjects.Container {
    const style = { fontFamily: 'Georgia, "Times New Roman", serif', fontSize: `${font}px` };
    const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
    const symbol = this.add.text(0, 0, label.symbol, { ...style, color: hex(label.colour) });
    const names = this.add.text(0, 0, ` ${label.text}`, { ...style, color: hex(INK_DARK) });
    const pad = font * 0.3;
    const width = symbol.width + names.width + 2 * pad;
    const height = Math.max(symbol.height, names.height);
    symbol.setPosition(-width / 2 + pad, 0);
    names.setPosition(symbol.x + symbol.width, 0);
    const backing = this.add.rectangle(0, 0, width, height, CHART.cream, TUNING.client.labels.backingAlpha).setOrigin(0.5, 0);
    return this.add.container(0, 0, [backing, symbol, names]);
  }

  /** Stage 3: the pack icons, from the same SVG files as the page (drawn large, shown small, so they stay sharp). */
  preload(): void {
    for (const [type, url] of Object.entries(PACK_ICONS)) this.load.svg(`pack-${type}`, url, { width: 96, height: 96 });
  }

  create(): void {
    this.chart = this.add.graphics();
    this.g = this.add.graphics();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,SPACE,E") as typeof this.keys;
    this.input.keyboard!.on("keydown-E", () => { this.eTapped = true; });
    this.input.mouse?.disableContextMenu();
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (pointer === this.input.mousePointer) this.mouseSeen = true;
    });
    this.created = true;
    if (!this.attached) this.input.keyboard!.disableGlobalCapture();
  }

  update(): void {
    if (!this.attached) return;
    const frame = this.link.frame();
    const seat = this.link.seat();
    const now = performance.now();
    const effects = frame ? frame.ships.map((ship, id) => this.effects.update(id, ship, now)) : [];
    const stormFlashes = frame ? frame.ships.map((ship, id) => this.stormEffects.update(id, { hits: ship.stormHits + ship.krakenHits, sunk: ship.sunk }, now).flashing) : [];
    if (frame) this.empRings.update(frame.ships, now);
    const view = this.moveCamera(frame, seat?.crew ?? null);
    this.draw(frame, seat?.crew ?? null, effects, stormFlashes);
    const labels = this.drawLabels(frame, seat?.crew ?? null);
    this.link.setInput(this.readInput(frame, seat));
    this.link.drawn(frame, effects, view, labels);
  }

  /**
   * Stage 5 slice 3: on a sea bigger than the view, the camera follows your ship (or ghost), kept inside the sea,
   * gliding toward it. On a one-screen sea, and for a player without a seat, it shows the whole sea as before.
   */
  private moveCamera(frame: Frame | null, ownCrew: number | null): SeaRect {
    const sea = this.link.sea();
    const own = ownCrew !== null ? frame?.ships[ownCrew] : undefined;
    const view = ownCrew === null ? { width: sea.width, height: sea.height } : viewSize(sea, { scale: this.link.viewScale, longGun: own?.type === "longGun" });
    const focus = frame ? cameraFocus(frame.ships, frame.ghosts, ownCrew) : null;
    const target = cameraCentre(focus ?? this.cameraAt ?? seaCentre(sea), view, sea);
    // The first frame of a match starts on the ship; after that it glides (to a respawn spot too).
    this.cameraAt = this.cameraAt === null || !focus ? target : glide(this.cameraAt, target, TUNING.client.camera.glide);
    const camera = this.cameras.main;
    // The game's canvas is today's sea in size; a view of more sea (a spectator's whole big sea) is zoomed out.
    camera.setZoom(TUNING.sea.width / view.width, TUNING.sea.height / view.height);
    camera.centerOn(this.cameraAt.x, this.cameraAt.y);
    return { x: this.cameraAt.x - view.width / 2, y: this.cameraAt.y - view.height / 2, ...view };
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
    // Stage 5 slice 3: from where the camera is now (it may have moved since the mouse did).
    const mouse = this.mouseSeen ? this.cameras.main.getWorldPoint(pointer.x, pointer.y) : null;
    const fromMouse = gunnerFromMouse(ship ? mouse : null, ship ?? { x: 0, y: 0 }, pointer.leftButtonDown(), pointer.rightButtonDown(), ePressed);
    const input = mergeGunner(fromMouse, touch.gunnerInput());
    return { ...input, pack: lit && !!input.pack };
  }

  private draw(frame: Frame | null, ownCrew: number | null, effects: ShipEffect[], stormFlashes: boolean[]): void {
    const g = this.g;
    g.clear();

    if (this.link.chartKey() !== this.chartKey) this.drawChart();
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
      // Stage 3 lifebar: not over another crew's ship hidden in a moving storm (it would give the ship away).
      const bar = crew === ownCrew || !hiddenByStorms(ship, frame.hazards);
      // Stage 4: a dashed ink ring round your own ship, so you find it at a glance.
      // Stage 5: as far outside the hull as the Frigate's, whatever the type.
      if (!ship.sunk && crew === ownCrew) this.dashedCircle(ship.x, ship.y, TUNING.client.ownShipRing - TUNING.ship.radius + statsOf(ship).radius, 1.6, INK, 0.8);
      if (!ship.sunk) this.drawShip(ship, crew, flash, 1, bar);
      else if (effect?.sinkAlpha) this.drawShip(ship, crew, null, effect.sinkAlpha, bar);
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
    // Stage 4: ink dots, each with two smaller, fainter dots trailing it.
    for (const shot of frame.shots.values()) {
      for (const dot of shotTrail(shot)) {
        g.fillStyle(INK_DARK, dot.alpha);
        g.fillCircle(dot.pos.x, dot.pos.y, dot.radius);
      }
      g.fillStyle(INK_DARK, 1);
      g.fillCircle(shot.x, shot.y, TUNING.client.shotRadius);
    }
    if (ownCrew !== null) {
      const own = frame.ships[ownCrew];
      if (own && !own.sunk) this.drawAimGuide(own);
      if (own) drawOne(own, ownCrew);
    }

    // EMP rings: grow from the firing ship, then fade.
    for (const ring of this.empRings.active(performance.now())) {
      g.lineStyle(4, CHART.emp, ring.alpha);
      g.strokeCircle(ring.x, ring.y, ring.radius);
      g.fillStyle(CHART.emp, 0.12 * ring.alpha);
      g.fillCircle(ring.x, ring.y, ring.radius);
    }
  }

  /**
   * Glowing spots pulse; packs on the water show their shape and icon (mine circle, torpedo capsule, EMP diamond, health square),
   * and blink in their last seconds before they disappear.
   */
  private drawPacks(packs: Map<string, PackView>, hazards: Map<string, HazardView>): void {
    const g = this.g;
    const r = TUNING.packs.radius;
    const pulse = (Math.sin(performance.now() / 150) + 1) / 2;
    for (const [id, pack] of packs) {
      if (pack.signalled) {
        this.dashedCircle(pack.x, pack.y, r + 4 + 8 * pulse, 2.5, INK, 0.35 + 0.5 * pulse);
        continue;
      }
      const visible = packBlinkVisible(pack.lifeLeft);
      // Icons are drawn above everything, so one under a moving storm is hidden here.
      this.packIcons.get(id)?.setVisible(visible && !hiddenByStorms(pack, hazards));
      if (!visible) continue;
      // Stage 4: cream shapes with ink outlines and ink icons, in a faint dashed ring (the mock-up's pack).
      const { x, y } = pack;
      this.dashedCircle(x, y, r + 9, 1.4, INK, 0.5);
      g.fillStyle(PACK_FILL, 1);
      g.lineStyle(2, INK, 1);
      if (pack.type === "mine") {
        g.fillCircle(x, y, r);
        g.strokeCircle(x, y, r);
      } else if (pack.type === "torpedo") {
        g.fillRoundedRect(x - r, y - r * 0.55, 2 * r, 1.1 * r, r * 0.55);
        g.strokeRoundedRect(x - r, y - r * 0.55, 2 * r, 1.1 * r, r * 0.55);
      } else if (pack.type === "emp") {
        this.polygon([{ x, y: y - r }, { x: x + r, y }, { x, y: y + r }, { x: x - r, y }], PACK_FILL, INK, 1);
      } else {
        g.fillRect(x - r * 0.85, y - r * 0.85, 1.7 * r, 1.7 * r);
        g.strokeRect(x - r * 0.85, y - r * 0.85, 1.7 * r, 1.7 * r);
      }
      if (!this.packIcons.has(id) && this.textures.exists(`pack-${pack.type}`)) {
        const size = r * 1.6;
        this.packIcons.set(id, this.add.image(x, y, `pack-${pack.type}`).setDisplaySize(size, size).setTint(INK_DARK));
      }
    }
    // Remove icons for packs that are gone or only glowing.
    for (const [id, icon] of this.packIcons) {
      const pack = packs.get(id);
      if (!pack || pack.signalled) {
        icon.destroy();
        this.packIcons.delete(id);
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
      // Stage 4: a broken mast leaning off the deck.
      const mast = spot.angle - 1;
      g.lineStyle(2.2, WRECK_EDGE, 1);
      g.lineBetween(spot.pos.x, spot.pos.y, spot.pos.x + Math.cos(mast) * 18, spot.pos.y + Math.sin(mast) * 18);
      if (wreck.hasPack) {
        // A four-pointed glint on the deck.
        const { x, y } = spot.pos;
        const r = 7 + 5 * pulse;
        // Stage 4: an ink glint behind a cream one, so it shows on the pale sea and the tan deck.
        g.fillStyle(INK, 0.8);
        g.fillTriangle(x - r - 2, y, x + r + 2, y, x, y - 5);
        g.fillTriangle(x - r - 2, y, x + r + 2, y, x, y + 5);
        g.fillTriangle(x, y - r - 2, x, y + r + 2, x - 5, y);
        g.fillTriangle(x, y - r - 2, x, y + r + 2, x + 5, y);
        g.fillStyle(CHART.cream, 0.55 + 0.45 * pulse);
        g.fillTriangle(x - r, y, x + r, y, x, y - 3);
        g.fillTriangle(x - r, y, x + r, y, x, y + 3);
        g.fillTriangle(x, y - r, x, y + r, x - 3, y);
        g.fillTriangle(x, y - r, x, y + r, x + 3, y);
      }
    }
  }

  /**
   * Mines, visible to everyone (Stage 4: the chart's ink mine with four spikes): an open ink-grey ring until armed,
   * then solid ink with a blinking red ring.
   */
  private drawMines(mines: Map<string, MineView>): void {
    const g = this.g;
    const r = TUNING.mine.radius;
    const blink = Math.floor(performance.now() / 250) % 2 === 0;
    for (const mine of mines.values()) {
      const { x, y } = mine;
      const colour = mine.armed ? INK_DARK : MINE_UNARMED;
      if (mine.armed) {
        g.fillStyle(INK_DARK, 1);
        g.fillCircle(x, y, r * 0.6);
        if (blink) {
          g.lineStyle(2.5, MINE_ARMED, 1);
          g.strokeCircle(x, y, r);
        }
      } else {
        g.lineStyle(2, colour, 1);
        g.strokeCircle(x, y, r * 0.6);
      }
      g.lineStyle(2, colour, 1);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        g.lineBetween(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95);
      }
    }
  }

  /** A torpedo: a dark capsule 22 × 8 pointing the way it travels, with a short white wake. */
  private drawTorpedo(x: number, y: number, angle: number): void {
    const g = this.g;
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    const side = { x: -dir.y, y: dir.x };
    g.lineStyle(2, INK, 0.6);
    for (const s of [-3, 3]) {
      g.lineBetween(x - dir.x * 11 + side.x * s, y - dir.y * 11 + side.y * s, x - dir.x * 26 + side.x * s * 1.6, y - dir.y * 26 + side.y * s * 1.6);
    }
    g.lineStyle(8, INK_DARK, 1);
    g.lineBetween(x - dir.x * 7, y - dir.y * 7, x + dir.x * 7, y + dir.y * 7);
    g.fillStyle(INK_DARK, 1);
    g.fillCircle(x - dir.x * 7, y - dir.y * 7, 4);
    g.fillCircle(x + dir.x * 7, y + dir.y * 7, 4);
    // Stage 4: a cream nose.
    g.fillStyle(CHART.cream, 1);
    g.fillCircle(x + dir.x * 9, y + dir.y * 9, 2);
  }

  private drawSparks(ship: ShipView, alpha: number): void {
    const g = this.g;
    const t = Math.floor(performance.now() / 90);
    g.lineStyle(2, CHART.emp, alpha);
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
    const guide = aimGuide(ship, ship.turret, statsOf(ship).shotRange);
    g.fillStyle(INK_DARK, 0.08);
    g.fillTriangle(ship.x, ship.y, guide.coneLeft.x, guide.coneLeft.y, guide.coneRight.x, guide.coneRight.y);
    g.lineStyle(2, INK_DARK, 0.6);
    for (const [a, b] of dashes(ship, guide.end, 12, 8)) g.lineBetween(a.x, a.y, b.x, b.y);
    const c = guide.crosshair;
    g.strokeCircle(c.x, c.y, 10);
    g.lineBetween(c.x - 16, c.y, c.x - 6, c.y);
    g.lineBetween(c.x + 6, c.y, c.x + 16, c.y);
    g.lineBetween(c.x, c.y - 16, c.x, c.y - 6);
    g.lineBetween(c.x, c.y + 6, c.x, c.y + 16);
  }

  /** `flash` is the hit-flash colour (white for a hit, red for the storm), or null; `fade` < 1 while a sunk ship fades out; protection makes the ship see-through and blink. */
  private drawShip(ship: ShipView, crew: number, flash: number | null, fade: number, lifebar = true): void {
    const g = this.g;
    const style = CREW_STYLES[crew] ?? CREW_STYLES[0];
    const protectedAlpha = blinkVisible(ship.protection, TUNING.client.protectionBlinkHz) ? 0.6 : 0.2;
    const alpha = (ship.protection > 0 ? protectedAlpha : 1) * fade;
    // Stage 5: the ship type's size, against the Frigate's the deck marks were placed for.
    const { radius } = statsOf(ship);
    const size = radius / TUNING.ship.radius;

    if (ship.boosting) {
      g.lineStyle(3, INK, 0.5 * alpha);
      const back = Math.PI + ship.heading;
      for (const side of [-0.35, 0.35]) {
        const from = { x: ship.x + Math.cos(back + side) * (radius - 2), y: ship.y + Math.sin(back + side) * (radius - 2) };
        g.lineBetween(from.x, from.y, from.x + Math.cos(back + side) * 22, from.y + Math.sin(back + side) * 22);
      }
    }

    // EMP'd: grey hull with flickering blue sparks.
    const disabled = ship.disabled > 0;
    this.polygon(hullPoints(ship, ship.heading, ship.type), flash ?? (disabled ? 0x8a8a8a : style.colour), HULL_EDGE, alpha, 2.5);
    if (disabled) this.drawSparks(ship, alpha);

    // Stage 4: cream deck planks (the mock-up's).
    g.lineStyle(1.8, CHART.cream, alpha);
    for (const line of deckLines(ship, ship.heading, ship.type)) {
      g.beginPath();
      g.moveTo(line[0]!.x, line[0]!.y);
      for (const p of line.slice(1)) g.lineTo(p.x, p.y);
      g.strokePath();
    }

    // Crew flag on the deck near the stern, in cream: the crew's symbol (● for crew 1, ■ for crew 2, …).
    const flag = { x: ship.x - Math.cos(ship.heading) * 13 * size, y: ship.y - Math.sin(ship.heading) * 13 * size };
    g.fillStyle(CHART.cream, alpha);
    const shape = crewFlag(crew, flag, 4.5);
    if ("circle" in shape) g.fillCircle(flag.x, flag.y, shape.circle);
    else this.fillPolygon(g, shape.points, CHART.cream, alpha);

    // Stage 4: an ink turret with a cream rim (the barrel too).
    const end = turretEnd(ship, ship.turret, ship.type);
    g.lineStyle(8, CHART.cream, alpha);
    g.lineBetween(ship.x, ship.y, end.x, end.y);
    g.lineStyle(5, HULL_EDGE, alpha);
    g.lineBetween(ship.x, ship.y, end.x, end.y);
    g.fillStyle(CHART.cream, alpha);
    g.fillCircle(ship.x, ship.y, 8.5);
    g.fillStyle(HULL_EDGE, alpha);
    g.fillCircle(ship.x, ship.y, 7);

    if (ship.shielding) {
      g.lineStyle(3, SHIELD, 0.9);
      g.strokeCircle(ship.x, ship.y, radius + 8);
    }
    // Stage 4 slice 6: below a quarter of full health, cracks, flames and smoke (not on a ship hidden in a storm).
    if (lifebar && isDamaged(ship)) this.drawDamage(ship, alpha);
    if (lifebar) this.drawLifebar(ship, alpha);
  }

  /** Visible damage: ink cracks on the deck, two flickering flames, and smoke drifting back from the stern. */
  private drawDamage(ship: ShipView, alpha: number): void {
    const g = this.g;
    const now = performance.now();
    g.lineStyle(1.6, INK_DARK, alpha);
    for (const line of hullCracks(ship, ship.heading, ship.type)) {
      g.beginPath();
      g.moveTo(line[0]!.x, line[0]!.y);
      for (const p of line.slice(1)) g.lineTo(p.x, p.y);
      g.strokePath();
    }
    flameSpots(ship, ship.heading, ship.type).forEach((p, i) => {
      const flicker = 1 + 0.25 * Math.sin(now / 70 + i * 2);
      // Red with a thin ink rim and a yellow heart, so they show on every crew's hull.
      g.fillStyle(INK_DARK, alpha);
      g.fillCircle(p.x, p.y, 6 * flicker);
      g.fillStyle(FLAME_OUTER, alpha);
      g.fillCircle(p.x, p.y, 5 * flicker);
      g.fillStyle(FLAME_INNER, alpha);
      g.fillCircle(p.x, p.y, 2.5 * flicker);
    });
    for (const puff of smokePuffs(ship, now)) {
      g.fillStyle(SMOKE, puff.alpha * alpha);
      g.fillCircle(puff.x, puff.y, puff.radius);
    }
  }

  /** Stage 3: a level bar above the ship, filled by its health (green, amber, red); Stage 4: in the chart's style. */
  private drawLifebar(ship: ShipView, alpha: number): void {
    const g = this.g;
    const C = TUNING.client;
    const fill = lifebarFill(ship.health, statsOf(ship).maxHealth);
    const x = ship.x - C.lifebarWidth / 2;
    const y = ship.y - C.lifebarOffset - C.lifebarHeight / 2;
    // Stage 4 slice 6: a cream bar with a thin ink outline, and ink ticks where the colour changes.
    g.fillStyle(CHART.cream, alpha);
    g.fillRect(x, y, C.lifebarWidth, C.lifebarHeight);
    g.fillStyle(LIFEBAR_COLOURS[lifebarColour(fill)], alpha);
    g.fillRect(x, y, C.lifebarWidth * fill, C.lifebarHeight);
    g.lineStyle(1, INK_DARK, alpha);
    for (const tick of LIFEBAR_TICKS) g.lineBetween(x + C.lifebarWidth * tick, y, x + C.lifebarWidth * tick, y + C.lifebarHeight);
    g.lineStyle(1.2, INK_DARK, alpha);
    g.strokeRect(x - 0.5, y - 0.5, C.lifebarWidth + 1, C.lifebarHeight + 1);
  }

  /**
   * The closing storm: dark cloud over the sea outside the safe circle, with a jagged, shifting edge, and the
   * final circle as a faint dashed line (shown all match, so crews know where to head).
   */
  private drawStorm(radius: number): void {
    const g = this.g;
    const sea = this.link.sea();
    const { x, y } = seaCentre(sea);
    const S = TUNING.closingStorm;
    // Stage 5: the circles grow with the sea.
    const endRadius = S.endRadius * seaScale(sea);
    // A filled ring from the circle out past every corner, in segments that don't overlap (so the shade is even).
    const outer = S.startRadius * seaScale(sea) + 40;
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
    // Stage 4: diagonal ink hatching over the storm, like an old chart's shaded border.
    g.lineStyle(1.5, INK_DARK, 0.4);
    for (const [a, b] of stormHatch(radius, undefined, sea)) g.lineBetween(a.x, a.y, b.x, b.y);
    const t = performance.now() / 400;
    g.lineStyle(2.5, STORM_EDGE, 0.8);
    g.beginPath();
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const r = radius + 6 * Math.sin(a * 9 + t) + 4 * Math.sin(a * 23 - t * 1.7);
      if (i === 0) g.moveTo(x + r * Math.cos(a), y + r * Math.sin(a));
      else g.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
    }
    g.strokePath();
    g.lineStyle(2, INK, 0.35);
    for (let i = 0; i < 90; i += 2) {
      const a = (i / 90) * Math.PI * 2;
      const b = ((i + 1) / 90) * Math.PI * 2;
      g.lineBetween(x + endRadius * Math.cos(a), y + endRadius * Math.sin(a), x + endRadius * Math.cos(b), y + endRadius * Math.sin(b));
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
        g.lineStyle(3, INK, 0.35 + 0.5 * pulse);
        for (let i = 0; i < 48; i += 2) {
          const a = (i / 48) * Math.PI * 2 + t * 0.5;
          const b = ((i + 1) / 48) * Math.PI * 2 + t * 0.5;
          g.lineBetween(h.x + R * Math.cos(a), h.y + R * Math.sin(a), h.x + R * Math.cos(b), h.y + R * Math.sin(b));
        }
        const dir = { x: Math.cos(h.heading), y: Math.sin(h.heading) };
        const tip = { x: h.x + dir.x * 60, y: h.y + dir.y * 60 };
        g.lineBetween(h.x - dir.x * 30, h.y - dir.y * 30, tip.x, tip.y);
        g.fillStyle(INK, 0.35 + 0.5 * pulse);
        g.fillTriangle(tip.x + dir.x * 14, tip.y + dir.y * 14, tip.x - dir.y * 12, tip.y + dir.x * 12, tip.x + dir.y * 12, tip.y - dir.x * 12);
        continue;
      }
      const alpha = hazardAlpha(h);
      if (alpha <= 0) continue;
      clouds.push({ x: h.x, y: h.y, alpha });
      // A billowing edge: puffs around the rim that swell and shrink, each inked (Stage 4: a scalloped ink edge).
      const puffs = Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2 + t * 0.25;
        const r = R - 8 + 6 * Math.sin(t * 1.3 + i * 1.7);
        return { x: h.x + r * Math.cos(a), y: h.y + r * Math.sin(a), r: 20 + 4 * Math.sin(t * 2 + i) };
      });
      g.fillStyle(INK_DARK, 0.96 * alpha);
      for (const p of puffs) g.fillCircle(p.x, p.y, p.r + 2.5);
      g.fillStyle(MOVING_STORM_CLOUD, 0.96 * alpha);
      g.fillCircle(h.x, h.y, R);
      for (const p of puffs) g.fillCircle(p.x, p.y, p.r);
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
        g.lineStyle(3, INK, 0.35 + 0.5 * pulse);
        for (let i = 0; i < 60; i += 2) {
          const a = (i / 60) * Math.PI * 2 + turn;
          const b = ((i + 1) / 60) * Math.PI * 2 + turn;
          g.lineBetween(h.x + W.reach * Math.cos(a), h.y + W.reach * Math.sin(a), h.x + W.reach * Math.cos(b), h.y + W.reach * Math.sin(b));
        }
        // Four arrowheads on the ring, pointing the way it will turn.
        g.fillStyle(INK, 0.35 + 0.5 * pulse);
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
      g.fillStyle(WHIRLPOOL_WATER, 0.25 * alpha);
      g.fillCircle(h.x, h.y, W.reach);
      g.lineStyle(1.5, WHIRLPOOL_FOAM, 0.35 * alpha);
      g.strokeCircle(h.x, h.y, W.reach);
      g.lineStyle(3, WHIRLPOOL_FOAM, 0.75 * alpha);
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
          g.lineStyle(3, INK, 0.7 * (1 - k));
          g.strokeCircle(h.x, h.y, 10 + k * K.grabReach);
        }
        g.fillStyle(INK, 0.7);
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
      // Stage 4: an old-map sea monster: each tentacle inked, then washed in its colour.
      const arms = krakenTentacles(h, t, held && !held.sunk ? held : null, held ? statsOf(held).radius : undefined);
      for (const [width, colour] of [[10, KRAKEN_EDGE], [6, flashing ? CHART.cream : KRAKEN_SKIN]] as const) {
        g.lineStyle(width, colour, alpha);
        for (const arm of arms) {
          g.beginPath();
          g.moveTo(arm[0]!.x, arm[0]!.y);
          for (const p of arm.slice(1)) g.lineTo(p.x, p.y);
          g.strokePath();
        }
      }
      g.fillStyle(flashing ? CHART.cream : KRAKEN_SKIN, alpha);
      g.lineStyle(3, KRAKEN_EDGE, alpha);
      g.fillCircle(h.x, h.y, K.bodyRadius);
      g.strokeCircle(h.x, h.y, K.bodyRadius);
      const ahead = { x: Math.cos(h.heading), y: Math.sin(h.heading) };
      for (const side of [-1, 1]) {
        const eye = { x: h.x + ahead.x * 14 - ahead.y * 11 * side, y: h.y + ahead.y * 14 + ahead.x * 11 * side };
        g.fillStyle(CHART.cream, alpha);
        g.fillCircle(eye.x, eye.y, 7);
        g.fillStyle(INK_DARK, alpha);
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
      g.lineStyle(2, INK, 0.7);
      const shape = crewFlag(crew, flag, 5);
      if ("circle" in shape) g.strokeCircle(flag.x, flag.y, shape.circle);
      else {
        g.beginPath();
        g.moveTo(shape.points[0]!.x, shape.points[0]!.y);
        for (const p of shape.points.slice(1)) g.lineTo(p.x, p.y);
        g.closePath();
        g.strokePath();
      }
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
      const r = zoneRect(zone, this.link.sea());
      // Stage 4: smudged, darkening ink (a brown-black wash and drifting ink smudges).
      g.fillStyle(CHART.storm, 0.3 * meter);
      g.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
      g.fillStyle(CHART.storm, 0.12 * meter);
      for (let i = 0; i < 7; i++) {
        const px = r.x0 + (((i * 0.37 + t * 0.02 * (1 + (i % 3))) % 1) + 1) % 1 * (r.x1 - r.x0);
        const py = r.y0 + ((i * 0.61) % 1) * (r.y1 - r.y0) + Math.sin(t * 0.5 + i) * 12;
        g.fillCircle(px, py, 40 + 25 * meter + (i % 3) * 10);
      }
    });
  }

  /**
   * Stage 4 slice 3: the chart layer. Pale chart-blue sea with a faint ink grid, wave squiggles and a compass rose;
   * reefs as a lighter tint with the chart's rock marks (dots and crosses); islands in sand with a hand-inked coast,
   * a dotted line of shallows off it and palm marks; a ruled ink line round the sea and a soft darker edge.
   */
  private drawChart(): void {
    const g = this.chart;
    const sea = this.link.sea();
    const { width, height } = sea;
    const islands = this.link.islands();
    const reefs = this.link.reefs();
    this.chartKey = this.link.chartKey();
    g.clear();
    g.fillStyle(CHART.sea, 1);
    g.fillRect(0, 0, width, height);
    g.lineStyle(1, INK, 0.13);
    for (const [a, b] of gridLines(sea)) g.lineBetween(a.x, a.y, b.x, b.y);

    const waves = waveSpots(islands, reefs, this.link.wrecks(), sea);
    g.lineStyle(1.4, INK, 0.35);
    for (const w of waves) {
      // Two little humps, like the mock-up's "q6 -5 12 0 t12 0".
      g.beginPath();
      for (let i = 0; i <= 12; i++) {
        const x = w.x - 12 + i * 2;
        g.lineTo(x, w.y - Math.abs(Math.sin((i / 12) * Math.PI * 2)) * 4);
      }
      g.strokePath();
    }
    this.compassRose(g);

    let marks = 0;
    for (const reef of reefs) {
      this.fillPolygon(g, reef, CHART.reefWater, 0.85);
      g.lineStyle(1, REEF_EDGE, 0.3);
      reef.forEach((p, i) => {
        for (const [a, b] of dashes(p, reef[(i + 1) % reef.length]!, 2, 6)) g.lineBetween(a.x, a.y, b.x, b.y);
      });
      for (const m of reefMarks(reef)) {
        marks++;
        if (m.kind === "dot") {
          g.fillStyle(INK, 1);
          g.fillCircle(m.pos.x, m.pos.y, 2.2);
        } else {
          g.lineStyle(1.5, INK, 1);
          g.lineBetween(m.pos.x - 3, m.pos.y - 3, m.pos.x + 3, m.pos.y + 3);
          g.lineBetween(m.pos.x + 3, m.pos.y - 3, m.pos.x - 3, m.pos.y + 3);
        }
      }
    }

    let palms = 0;
    for (const island of islands) {
      const shallows = offsetPolygon(island, TUNING.client.chart.shallowOffset);
      g.lineStyle(1, INK, 0.6);
      shallows.forEach((p, i) => {
        for (const [a, b] of dashes(p, shallows[(i + 1) % shallows.length]!, 2, 5)) g.lineBetween(a.x, a.y, b.x, b.y);
      });
      const coast = inkOutline(island);
      this.fillPolygon(g, coast, ISLAND_SAND, 1);
      g.lineStyle(2.5, INK, 1);
      g.beginPath();
      g.moveTo(coast[0]!.x, coast[0]!.y);
      for (const p of coast.slice(1)) g.lineTo(p.x, p.y);
      g.closePath();
      g.strokePath();
      for (const p of palmSpots(island)) {
        palms++;
        this.palm(g, p);
      }
    }

    // A soft darker edge: thin strips along each side, fading inward; then the ruled line round the sea.
    const strips = 16;
    const strip = 4;
    for (let i = 0; i < strips; i++) {
      g.fillStyle(CHART.deep, 0.05 * (1 - i / strips));
      const d = i * strip;
      g.fillRect(d, d, width - 2 * d, strip);
      g.fillRect(d, height - d - strip, width - 2 * d, strip);
      g.fillRect(d, d + strip, strip, height - 2 * d - 2 * strip);
      g.fillRect(width - d - strip, d + strip, strip, height - 2 * d - 2 * strip);
    }
    g.lineStyle(2, INK, 1);
    g.strokeRect(1, 1, width - 2, height - 2);
    this.link.chartDrawn({ waves: waves.length, palms, reefMarks: marks });
  }

  /** A faint compass rose: two rings, a filled north–south needle and an open east–west one. */
  private compassRose(g: Phaser.GameObjects.Graphics): void {
    const { x, y, radius: r } = compassSpot(this.link.sea());
    g.lineStyle(1.3, INK, 0.4);
    g.strokeCircle(x, y, r * 0.76);
    g.strokeCircle(x, y, r * 0.53);
    g.fillStyle(INK, 0.4);
    g.fillTriangle(x, y - r, x + 5, y, x - 5, y);
    g.fillTriangle(x, y + r, x + 5, y, x - 5, y);
    g.strokeTriangle(x - r, y, x, y - 5, x, y + 5);
    g.strokeTriangle(x + r, y, x, y - 5, x, y + 5);
  }

  /** A palm mark: a curved trunk and three fronds, in ink. */
  private palm(g: Phaser.GameObjects.Graphics, p: Vec): void {
    g.lineStyle(2, INK, 1);
    const top = { x: p.x - 2, y: p.y - 24 };
    g.beginPath();
    g.moveTo(p.x, p.y);
    g.lineTo(p.x + 1, p.y - 12);
    g.lineTo(top.x, top.y);
    g.strokePath();
    for (const [dx, dy] of [[-16, 6], [16, 3], [-10, -10]]) {
      g.beginPath();
      g.moveTo(top.x, top.y);
      g.lineTo(top.x + dx * 0.6, top.y + dy * 0.6 - 3);
      g.lineTo(top.x + dx, top.y + dy);
      g.strokePath();
    }
  }

  /** A dashed circle (Graphics has no dashed lines): `dash` arcs of about 6 units with gaps of 5. */
  private dashedCircle(x: number, y: number, radius: number, width: number, colour: number, alpha: number): void {
    const g = this.g;
    const count = Math.max(8, Math.round((2 * Math.PI * radius) / 11));
    g.lineStyle(width, colour, alpha);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const b = a + ((6 / 11) * Math.PI * 2) / count;
      g.beginPath();
      g.arc(x, y, radius, a, b);
      g.strokePath();
    }
  }

  private fillPolygon(g: Phaser.GameObjects.Graphics, points: readonly Vec[], fill: number, alpha: number): void {
    g.fillStyle(fill, alpha);
    g.beginPath();
    g.moveTo(points[0]!.x, points[0]!.y);
    for (const p of points.slice(1)) g.lineTo(p.x, p.y);
    g.closePath();
    g.fillPath();
  }

  private polygon(points: readonly Vec[], fill: number, edge: number, alpha = 1, width = 2): void {
    const g = this.g;
    g.fillStyle(fill, alpha);
    g.lineStyle(width, edge, alpha);
    g.beginPath();
    g.moveTo(points[0]!.x, points[0]!.y);
    for (const p of points.slice(1)) g.lineTo(p.x, p.y);
    g.closePath();
    g.fillPath();
    g.strokePath();
  }
}
