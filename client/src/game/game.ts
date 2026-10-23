import * as Phaser from "phaser";
import type { Room } from "@colyseus/sdk";
import { ClientMessage, TUNING, type Role } from "@sink-or-sail/shared";
import { CREW_STYLES } from "./crews.ts";
import { GameScene } from "./GameScene.ts";
import { startInputSender } from "./inputSender.ts";
import { SnapshotBuffer, type Frame } from "./interpolation.ts";
import { snapshotFromState, type GameStateView } from "./snapshot.ts";

interface PlayerView {
  crew?: number;
  role?: string;
}
interface RoomStateView extends GameStateView {
  players: { get(sessionId: string): PlayerView | undefined };
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
  screen.hidden = false;

  const scene = new GameScene({
    frame: (): Frame | null => buffer.sample(performance.now() - TUNING.client.interpolationDelayMs),
    seat,
    setInput: (next) => { input = next; },
    drawn: (frame) => {
      canvasHost.dataset.ships = String(frame?.ships.filter((s) => !s.sunk).length ?? 0);
      updateHud(frame, seat());
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
      delete canvasHost.dataset.ships;
      screen.hidden = true;
    },
  };
}

const roleLabel: Record<Role, string> = { pilot: "Pilot", gunner: "Gunner" };

function updateHud(frame: Frame | null, seat: { crew: number; role: Role } | null): void {
  const role = byId("hud-role");
  const crew = byId("hud-crew");
  const bar = byId("hud-energy");
  const fill = byId("hud-energy-fill");
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
