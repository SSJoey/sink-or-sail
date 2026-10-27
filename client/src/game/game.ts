import * as Phaser from "phaser";
import type { Room } from "@colyseus/sdk";
import { ClientMessage, DEFAULT_LAYOUT, LAYOUTS, Phase, TUNING, inStorm, isLayoutId, isReefAmount, reefsFor, rolePack, type PackType, type Role } from "@sink-or-sail/shared";
import { CREW_STYLES } from "./crews.ts";
import { GameScene } from "./GameScene.ts";
import type { ShipEffect } from "./effects.ts";
import { empText, formatClock, livesHtml, packSlotText, scoreHtml } from "./hud.ts";
import { startInputSender } from "./inputSender.ts";
import { PackLatch } from "./packLatch.ts";
import { gunnerPackBuzz } from "./packBuzz.ts";
import { SnapshotBuffer, type Frame } from "./interpolation.ts";
import { frameLimit } from "./frameLimit.ts";
import { hiddenShips } from "./hazardLook.ts";
import { countdownLabel, outBanner, pausedText, resultLine, respawnText, resultTitle, scoreRows, sinkBanner, stormText } from "./matchText.ts";
import { blockGestures, goFullscreenLandscape, isPortrait, isTouchFirst } from "./phone.ts";
import { snapshotFromState, type GameStateView } from "./snapshot.ts";
import { layoutText } from "../lobby/settings.ts";
import { TouchControls } from "./touchControls.ts";
import { createTouchLayer } from "./touchLayer.ts";

export interface PlayerView {
  name: string;
  crew?: number;
  role?: string;
  connected: boolean;
}
export interface RoomStateView extends GameStateView {
  players: {
    get(sessionId: string): PlayerView | undefined;
    forEach(cb: (player: PlayerView, sessionId: string) => void): void;
  };
  hostId: string;
  packsEnabled: boolean;
  /** Room settings for the next match (Stage 2). */
  mode: string;
  lives: number;
  /** The mode of the current (or last) match. */
  matchMode: string;
  /** The layout setting ("random" or a layout id) and the current (or last) match's layout. */
  layout: string;
  matchLayout: string;
  /** Hazards on/off and the reefs setting for the next match; the reefs of the current (or last) match. */
  hazardsEnabled: boolean;
  reefs: string;
  matchReefs: string;
  /** Stage 2 closing storm: whether the match has one, its times and the safe circle's radius now. */
  matchStorm: boolean;
  stormStartsAt: number;
  stormClosedAt: number;
  stormRadius: number;
  phase: string;
  pausedBy: string;
  countdown: number;
  timeLeft: number;
  winner: number;
}

export interface GameHandle {
  stop(): void;
}

const byId = (id: string) => document.getElementById(id)!;

/**
 * Shows the game view from the countdown to the scoreboard: draws the sea, sends this player's input,
 * and shows the countdown, sink banner and end-of-match scoreboard. `onExit` runs on "Back to room".
 */
export function startGame(room: Room, onExit: () => void): GameHandle {
  const buffer = new SnapshotBuffer();
  const onState = (state: RoomStateView) => buffer.push(snapshotFromState(state, performance.now()));
  room.onStateChange(onState);
  onState(room.state as RoomStateView);

  const seat = (): { crew: number; role: Role } | null => {
    const me = (room.state as RoomStateView).players.get(room.sessionId);
    if (!me || me.crew === undefined || me.role === undefined) return null;
    return { crew: me.crew, role: me.role as Role };
  };

  let input: { pack?: boolean } | null = null;
  let heldBefore: PackType | null = null;
  const packLatch = new PackLatch();
  const stopSending = startInputSender(
    () => (input === null ? null : { ...input, pack: packLatch.take() }),
    (message) => room.send(ClientMessage.Input, message),
    TUNING.client.inputRate,
  );

  const screen = byId("game-screen");
  const canvasHost = byId("game");
  const rotate = byId("rotate");
  const countdown = byId("countdown");
  const banner = byId("banner");
  const stormStatus = byId("storm-status");
  const scoreboard = byId("scoreboard");
  const paused = byId("paused");
  screen.hidden = false;
  byId("back-to-room").onclick = onExit;

  // Pause: any seated player. Resume and Exit: host only (the server checks both).
  const endMatch = () => {
    if (window.confirm("End the match now?")) room.send(ClientMessage.EndMatch);
  };
  byId("hud-pause").onclick = () => room.send(ClientMessage.Pause);
  byId("hud-exit").onclick = endMatch;
  byId("resume").onclick = () => room.send(ClientMessage.Resume);
  byId("paused-exit").onclick = endMatch;

  // Phone controls: shown on touch-first devices, or as soon as anyone touches the screen.
  const touch = new TouchControls(TUNING.client.stickRadius, TUNING.client.stickDeadZone);
  const touchLayer = createTouchLayer(touch);
  if (isTouchFirst()) touchLayer.activate();
  const unblockGestures = blockGestures(screen);
  const onFirstTouch = (e: PointerEvent) => {
    if (e.pointerType !== "touch") return;
    touchLayer.activate();
    void goFullscreenLandscape(document.documentElement);
    screen.removeEventListener("pointerdown", onFirstTouch, true);
  };
  screen.addEventListener("pointerdown", onFirstTouch, true);

  const scene = new GameScene({
    frame: (): Frame | null => buffer.sample(performance.now() - TUNING.client.interpolationDelayMs),
    islands: () => {
      const id = (room.state as RoomStateView).matchLayout;
      return LAYOUTS[isLayoutId(id) ? id : DEFAULT_LAYOUT].islands;
    },
    stormRadius: () => {
      const state = room.state as RoomStateView;
      return state.matchStorm ? state.stormRadius : null;
    },
    wrecks: () => {
      const id = (room.state as RoomStateView).matchLayout;
      return LAYOUTS[isLayoutId(id) ? id : DEFAULT_LAYOUT].wrecks;
    },
    reefs: () => {
      const state = room.state as RoomStateView;
      return reefsFor(isLayoutId(state.matchLayout) ? state.matchLayout : DEFAULT_LAYOUT, isReefAmount(state.matchReefs) ? state.matchReefs : "none");
    },
    seat,
    touch,
    setInput: (next) => {
      input = next as { pack?: boolean } | null;
      packLatch.update(!!input?.pack);
    },
    drawn: (frame, effects) => {
      const mine = seat();
      const state = room.state as RoomStateView;
      showMatchOverlays(state, frame, effects, mine?.crew ?? null, { countdown, banner, scoreboard });
      showPauseControls(state, mine !== null, state.hostId === room.sessionId, paused);
      // Read by the browser smoke tests (a canvas has no elements to inspect).
      canvasHost.dataset.ships = String(frame?.ships.filter((s) => !s.sunk).length ?? 0);
      canvasHost.dataset.shots = String(frame?.shots.size ?? 0);
      canvasHost.dataset.layout = state.matchLayout;
      const own = mine ? frame?.ships[mine.crew] : undefined;
      if (own) {
        canvasHost.dataset.ownX = String(Math.round(own.x));
        canvasHost.dataset.ownY = String(Math.round(own.y));
      }
      // Packs on the water as "type@x,y;…", for the browser smoke tests.
      canvasHost.dataset.packs = [...(frame?.packs.values() ?? [])]
        .filter((p) => !p.signalled)
        .map((p) => `${p.type}@${Math.round(p.x)},${Math.round(p.y)}`)
        .join(";");
      canvasHost.dataset.mines = String(frame?.mines.size ?? 0);
      if (own) canvasHost.dataset.ownHealth = String(Math.round(own.health));
      showStormStatus(state, own ?? null, stormStatus);
      // Wrecks still standing as "id:health:pack;…" (pack 1 when it holds one), for the browser smoke tests.
      canvasHost.dataset.wrecks = [...(frame?.wrecks ?? new Map())].map(([id, w]) => `${id}:${Math.round(w.health)}:${w.hasPack ? 1 : 0}`).join(";");
      canvasHost.dataset.torpedoes = String(frame?.torpedoes.size ?? 0);
      // Stage 2 hazards as "id:kind:phase:x,y;…", and the ships a moving storm hides from this player, for the browser smoke tests.
      canvasHost.dataset.hazards = [...(frame?.hazards ?? new Map())].map(([id, h]) => `${id}:${h.kind}:${h.phase}:${Math.round(h.x)},${Math.round(h.y)}`).join(";");
      canvasHost.dataset.hidden = frame ? hiddenShips(frame.ships, frame.hazards, mine?.crew ?? null).join(",") : "";
      // A short buzz on the gunner's phone when the crew picks up a torpedo or EMP (Android only).
      const heldNow = own?.gunnerPack ?? null;
      if (mine && gunnerPackBuzz(heldBefore, heldNow, mine.role)) navigator.vibrate?.(TUNING.client.gunnerPackVibrateMs);
      heldBefore = heldNow;
      touchLayer.update(mine?.role ?? null, own && mine ? rolePack(own, mine.role) : null, (own?.disabled ?? 0) > 0);
      // Read by the EMP smoke test: is any ship disabled right now?
      canvasHost.dataset.disabled = (frame?.ships ?? []).map((s) => (s.disabled > 0 ? "1" : "0")).join("");
      rotate.hidden = !(touchLayer.active && isPortrait(window.innerWidth, window.innerHeight));
      updateHud(frame, mine, state.timeLeft, state.matchMode === "lastAfloat");
    },
  });

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: canvasHost,
    backgroundColor: "#1d4f91",
    // Touch is handled by our own touch layer. Phaser's touch input listens on the whole window,
    // so a thumb on the aiming stick would also count as a pressed mouse button (and fire).
    input: { touch: false },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: TUNING.sea.width,
      height: TUNING.sea.height,
    },
    // Browser tests only: ?fps=20 draws less often, to keep a busy test machine responsive.
    ...(frameLimit(location.search) !== undefined && { fps: { limit: frameLimit(location.search) } }),
    scene,
  });

  return {
    stop() {
      stopSending();
      room.onStateChange.remove(onState);
      game.destroy(true);
      touchLayer.destroy();
      unblockGestures();
      screen.removeEventListener("pointerdown", onFirstTouch, true);
      delete canvasHost.dataset.ships;
      delete canvasHost.dataset.ownX;
      delete canvasHost.dataset.ownY;
      delete canvasHost.dataset.packs;
      delete canvasHost.dataset.mines;
      delete canvasHost.dataset.ownHealth;
      delete canvasHost.dataset.wrecks;
      delete canvasHost.dataset.torpedoes;
      delete canvasHost.dataset.hazards;
      delete canvasHost.dataset.hidden;
      delete canvasHost.dataset.disabled;
      delete canvasHost.dataset.shots;
      rotate.hidden = true;
      countdown.hidden = true;
      banner.hidden = true;
      stormStatus.hidden = true;
      scoreboard.hidden = true;
      paused.hidden = true;
      screen.hidden = true;
    },
  };
}

const roleLabel: Record<Role, string> = { pilot: "Pilot", gunner: "Gunner" };

/** Fills a scoreboard element: result title and one row per crew. Also used on the room screen. */
export function renderResult(el: HTMLElement, state: RoomStateView): void {
  const players: PlayerView[] = [];
  state.players.forEach((p) => players.push(p));
  const ships = [...state.ships];
  const lastAfloat = state.matchMode === "lastAfloat";
  const title = document.createElement("h2");
  title.textContent = resultTitle(state.winner);
  const layout = document.createElement("p");
  layout.textContent = layoutText(state.layout, state.matchLayout);
  const rows = scoreRows(ships.map((ship) => ship.sinkings), players).map((row, i) => {
    const line = document.createElement("p");
    line.textContent = resultLine(row, lastAfloat ? ships[i] : undefined);
    return line;
  });
  el.replaceChildren(title, ...rows, layout);
}

function showPauseControls(state: RoomStateView, seated: boolean, isHost: boolean, paused: HTMLElement): void {
  const phase = state.phase;
  const playing = phase === Phase.Countdown || phase === Phase.Running;
  byId("hud-pause").hidden = !(seated && playing);
  byId("hud-exit").hidden = !(isHost && (playing || phase === Phase.Paused));

  paused.hidden = phase !== Phase.Paused;
  if (phase !== Phase.Paused) return;
  const text = pausedText(state.pausedBy, isHost);
  const line = byId("paused-text");
  if (line.textContent !== text) line.textContent = text;
  byId("paused-host").hidden = !isHost;
}

function showMatchOverlays(
  state: RoomStateView,
  frame: Frame | null,
  effects: ShipEffect[],
  ownCrew: number | null,
  els: { countdown: HTMLElement; banner: HTMLElement; scoreboard: HTMLElement },
): void {
  const duration = state.matchMode === "lastAfloat" ? TUNING.lastAfloat.duration : TUNING.match.duration;
  const label = countdownLabel(state.phase, state.countdown, state.timeLeft, duration);
  els.countdown.hidden = label === null;
  if (label !== null && els.countdown.textContent !== label) els.countdown.textContent = label;

  const own = ownCrew !== null ? frame?.ships[ownCrew] : undefined;
  // During the 3-2-1, the banner names the layout (with Random, the one it picked).
  const countingDown = state.phase === Phase.Countdown;
  const showBanner = countingDown || (own?.sunk === true && state.phase === Phase.Running);
  els.banner.hidden = !showBanner;
  if (countingDown) {
    const text = layoutText(state.layout, state.matchLayout);
    if (els.banner.textContent !== text) els.banner.textContent = text;
  } else if (showBanner && own) {
    // A crew that is out (Last Afloat) keeps its banner until the match ends.
    const text = own.out ? outBanner(own.sunkBy, own.sunkCause) : `${sinkBanner(own.sunkBy, own.sunkCause)} · ${respawnText(own.respawnIn)}`;
    if (els.banner.textContent !== text) els.banner.textContent = text;
  }
  if (ownCrew !== null && effects[ownCrew]?.justSank) navigator.vibrate?.(TUNING.client.sinkVibrateMs);

  const over = state.phase === Phase.Over;
  if (over && els.scoreboard.hidden) renderResult(byId("result"), state);
  els.scoreboard.hidden = !over;
}

/** Stage 2 closing storm: the status line at the top of the sea, while a match with the storm is on. */
function showStormStatus(state: RoomStateView, own: { x: number; y: number; sunk: boolean } | null, el: HTMLElement): void {
  const on = state.matchStorm && (state.phase === Phase.Countdown || state.phase === Phase.Running || state.phase === Phase.Paused);
  el.hidden = !on;
  if (!on) return;
  const elapsed = TUNING.lastAfloat.duration - state.timeLeft;
  const outside = own !== null && !own.sunk && inStorm(own, state.stormRadius);
  const text = stormText(elapsed, { startsAt: state.stormStartsAt, closedAt: state.stormClosedAt }, outside);
  if (el.textContent !== text) el.textContent = text;
  el.classList.toggle("in-storm", outside);
}

function updateHud(frame: Frame | null, seat: { crew: number; role: Role } | null, timeLeft: number, lastAfloat: boolean): void {
  const role = byId("hud-role");
  const crew = byId("hud-crew");
  const bar = byId("hud-energy");
  const fill = byId("hud-energy-fill");

  byId("hud-clock").textContent = formatClock(timeLeft);
  const empLine = byId("hud-emp");
  const emp = seat ? empText(frame?.ships[seat.crew]?.disabled ?? 0) : "";
  if (empLine.textContent !== emp) empLine.textContent = emp;
  const packSlot = byId("hud-pack");
  const crewShip = seat ? frame?.ships[seat.crew] : undefined;
  const slotText = seat ? packSlotText(crewShip?.pilotPack ?? null, crewShip?.gunnerPack ?? null) : "";
  if (packSlot.textContent !== slotText) packSlot.textContent = slotText;
  const score = byId("hud-score");
  const ships = frame?.ships ?? [];
  const html = lastAfloat ? livesHtml(ships) : scoreHtml(ships.map((ship) => ship.sinkings));
  if (score.innerHTML !== html) score.innerHTML = html;

  if (!seat) {
    role.textContent = "Watching";
    crew.textContent = "";
    bar.hidden = true;
    return;
  }
  const style = CREW_STYLES[seat.crew] ?? CREW_STYLES[0];
  role.textContent = roleLabel[seat.role];
  crew.textContent = `${style.symbol} ${style.name}`;
  crew.style.color = style.css;
  bar.hidden = false;
  const energy = frame?.ships[seat.crew]?.energy ?? 0;
  fill.style.width = `${(100 * energy) / TUNING.energy.max}%`;
}
