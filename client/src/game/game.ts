import * as Phaser from "phaser";
import type { Room } from "@colyseus/sdk";
import { ClientMessage, Phase, TUNING, type Role } from "@sink-or-sail/shared";
import { CREW_STYLES } from "./crews.ts";
import { GameScene } from "./GameScene.ts";
import type { ShipEffect } from "./effects.ts";
import { formatClock, packSlotText } from "./hud.ts";
import { startInputSender } from "./inputSender.ts";
import { PackLatch } from "./packLatch.ts";
import { SnapshotBuffer, type Frame } from "./interpolation.ts";
import { countdownLabel, pausedText, respawnText, resultTitle, scoreRows, sinkBanner } from "./matchText.ts";
import { blockGestures, goFullscreenLandscape, isPortrait, isTouchFirst } from "./phone.ts";
import { snapshotFromState, type GameStateView } from "./snapshot.ts";
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
      touchLayer.update(mine?.role ?? null, own?.held ?? null);
      rotate.hidden = !(touchLayer.active && isPortrait(window.innerWidth, window.innerHeight));
      updateHud(frame, mine, state.timeLeft);
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
      delete canvasHost.dataset.shots;
      rotate.hidden = true;
      countdown.hidden = true;
      banner.hidden = true;
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
  const sinkings = [...state.ships].map((ship) => ship.sinkings);
  const title = document.createElement("h2");
  title.textContent = resultTitle(state.winner);
  const rows = scoreRows(sinkings, players).map((row) => {
    const line = document.createElement("p");
    line.textContent = `${row.label}: ${row.sinkings} sinking${row.sinkings === 1 ? "" : "s"} (${row.names})`;
    return line;
  });
  el.replaceChildren(title, ...rows);
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
  const label = countdownLabel(state.phase, state.countdown, state.timeLeft);
  els.countdown.hidden = label === null;
  if (label !== null && els.countdown.textContent !== label) els.countdown.textContent = label;

  const own = ownCrew !== null ? frame?.ships[ownCrew] : undefined;
  const showBanner = own?.sunk === true && state.phase === Phase.Running;
  els.banner.hidden = !showBanner;
  if (showBanner && own) {
    const text = `${sinkBanner(own.sunkBy)} · ${respawnText(own.respawnIn)}`;
    if (els.banner.textContent !== text) els.banner.textContent = text;
  }
  if (ownCrew !== null && effects[ownCrew]?.justSank) navigator.vibrate?.(TUNING.client.sinkVibrateMs);

  const over = state.phase === Phase.Over;
  if (over && els.scoreboard.hidden) renderResult(byId("result"), state);
  els.scoreboard.hidden = !over;
}

function updateHud(frame: Frame | null, seat: { crew: number; role: Role } | null, timeLeft: number): void {
  const role = byId("hud-role");
  const crew = byId("hud-crew");
  const bar = byId("hud-energy");
  const fill = byId("hud-energy-fill");

  byId("hud-clock").textContent = formatClock(timeLeft);
  const packSlot = byId("hud-pack");
  const slotText = seat ? packSlotText(frame?.ships[seat.crew]?.held ?? null) : "";
  if (packSlot.textContent !== slotText) packSlot.textContent = slotText;
  const score = byId("hud-score");
  const parts = (frame?.ships ?? []).map((ship, i) => {
    const style = CREW_STYLES[i] ?? CREW_STYLES[0];
    return `<span style="color:${style.css}">${style.symbol} ${ship.sinkings}</span>`;
  });
  const html = parts.join(" – ");
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
