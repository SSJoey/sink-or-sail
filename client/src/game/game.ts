import * as Phaser from "phaser";
import type { Room } from "@colyseus/sdk";
import { ClientMessage, TUNING, type Role } from "@sink-or-sail/shared";
import { CREW_STYLES } from "./crews.ts";
import { GameScene } from "./GameScene.ts";
import { formatClock } from "./hud.ts";
import { startInputSender } from "./inputSender.ts";
import { SnapshotBuffer, type Frame } from "./interpolation.ts";
import { blockGestures, goFullscreenLandscape, isPortrait, isTouchFirst } from "./phone.ts";
import { snapshotFromState, type GameStateView } from "./snapshot.ts";
import { TouchControls } from "./touchControls.ts";
import { createTouchLayer } from "./touchLayer.ts";

interface PlayerView {
  crew?: number;
  role?: string;
}
interface RoomStateView extends GameStateView {
  players: { get(sessionId: string): PlayerView | undefined };
  timeLeft: number;
}

export interface GameHandle {
  stop(): void;
}

const byId = (id: string) => document.getElementById(id)!;

/** Shows the game view for a running match: draws the sea and sends this player's input. */
export function startGame(room: Room): GameHandle {
  const buffer = new SnapshotBuffer();
  const onState = (state: RoomStateView) => buffer.push(snapshotFromState(state, performance.now()));
  room.onStateChange(onState);
  onState(room.state as RoomStateView);

  const seat = (): { crew: number; role: Role } | null => {
    const me = (room.state as RoomStateView).players.get(room.sessionId);
    if (!me || me.crew === undefined || me.role === undefined) return null;
    return { crew: me.crew, role: me.role as Role };
  };

  let input: unknown | null = null;
  const stopSending = startInputSender(() => input, (message) => room.send(ClientMessage.Input, message), TUNING.client.inputRate);

  const screen = byId("game-screen");
  const canvasHost = byId("game");
  const rotate = byId("rotate");
  screen.hidden = false;

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
    setInput: (next) => { input = next; },
    drawn: (frame) => {
      const mine = seat();
      // Read by the browser smoke tests (a canvas has no elements to inspect).
      canvasHost.dataset.ships = String(frame?.ships.filter((s) => !s.sunk).length ?? 0);
      const own = mine ? frame?.ships[mine.crew] : undefined;
      if (own) canvasHost.dataset.ownX = String(Math.round(own.x));
      touchLayer.update(mine?.role ?? null);
      rotate.hidden = !(touchLayer.active && isPortrait(window.innerWidth, window.innerHeight));
      updateHud(frame, mine, (room.state as RoomStateView).timeLeft);
    },
  });

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: canvasHost,
    backgroundColor: "#1d4f91",
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
      rotate.hidden = true;
      screen.hidden = true;
    },
  };
}

const roleLabel: Record<Role, string> = { pilot: "Pilot", gunner: "Gunner" };

function updateHud(frame: Frame | null, seat: { crew: number; role: Role } | null, timeLeft: number): void {
  const role = byId("hud-role");
  const crew = byId("hud-crew");
  const bar = byId("hud-energy");
  const fill = byId("hud-energy-fill");

  byId("hud-clock").textContent = formatClock(timeLeft);
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
