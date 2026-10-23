import { Client, type Room } from "@colyseus/sdk";
import {
  ClientMessage,
  JoinError,
  Phase,
  CREWS,
  ROLES,
  ROOM_NAME,
  ServerMessage,
  normaliseCode,
  normaliseName,
  type Crew,
  type RejectedMessage,
  type Role,
} from "@sink-or-sail/shared";
import { renderResult, startGame, type GameHandle, type PlayerView, type RoomStateView } from "../game/game.ts";
import { joinErrorText, rejectedText } from "./messages.ts";
import { clearToken, loadToken, saveToken } from "./reconnectToken.ts";

/** The parts of the server's room state the lobby reads. */
type StateView = RoomStateView;

const CONSENTED = 4000; // Colyseus close code for a deliberate leave.

const roleLabel: Record<Role, string> = { pilot: "Pilot", gunner: "Gunner" };

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function startLobby(): void {
  const client = new Client(location.origin);
  const storage = sessionStorage;

  const joinScreen = byId("join-screen");
  const roomScreen = byId("room-screen");
  const nameInput = byId<HTMLInputElement>("name");
  const codeInput = byId<HTMLInputElement>("code-input");
  const errorLine = byId("error");

  const showError = (text: string) => { errorLine.textContent = text; };
  let game: GameHandle | null = null;
  let lastPhase = "";
  const stopGame = () => {
    game?.stop();
    game = null;
  };

  function showJoinScreen(): void {
    roomScreen.hidden = true;
    joinScreen.hidden = false;
  }

  function enterRoom(room: Room): void {
    saveToken(storage, room.reconnectionToken);
    joinScreen.hidden = true;
    roomScreen.hidden = false;
    byId("code").textContent = room.roomId;
    byId("status").textContent = "";
    showError("");

    room.onStateChange((state: StateView) => renderRoom(room, state));
    room.onMessage(ServerMessage.Rejected, (message: RejectedMessage) => showError(rejectedText(message)));
    room.onDrop(() => { byId("status").textContent = "Connection lost — reconnecting…"; });
    room.onReconnect(() => {
      saveToken(storage, room.reconnectionToken);
      byId("status").textContent = "";
    });
    room.onLeave((code) => {
      stopGame();
      clearToken(storage);
      showJoinScreen();
      if (code !== CONSENTED) showError("You were disconnected from the room.");
    });
    byId("leave").onclick = () => { void room.leave(); };
    // Only the host sees Start; the server checks it too.
    byId("start").onclick = () => room.send(ClientMessage.Start);
  }

  function renderRoom(room: Room, state: StateView): void {
    const phase = state.phase;
    const matchOn = phase === Phase.Countdown || phase === Phase.Running || phase === Phase.Paused;
    const host = (sessionId: string) => (sessionId === state.hostId ? " ★" : "");
    let iAmSeated = false;
    state.players.forEach((p, id) => { if (id === room.sessionId && p.role !== undefined) iAmSeated = true; });

    const seats = byId("seats");
    seats.replaceChildren();
    const unseated: string[] = [];
    const holders = new Map<string, { player: PlayerView; sessionId: string }>();
    state.players.forEach((player, sessionId) => {
      if (player.crew === undefined || player.role === undefined) unseated.push(player.name + host(sessionId));
      else holders.set(`${player.crew}:${player.role}`, { player, sessionId });
    });

    for (const crew of CREWS) {
      for (const role of ROLES) {
        const holder = holders.get(`${crew}:${role}`);
        const button = document.createElement("button");
        let label = `Crew ${crew + 1} · ${roleLabel[role]} — `;
        if (!holder) label += "free";
        else label += holder.player.name + host(holder.sessionId) + (holder.player.connected ? "" : " (reconnecting)");
        if (holder?.sessionId === room.sessionId) label += " ✓";
        button.textContent = label;
        // Seated players can't switch during a match; a seatless player may still take a free seat.
        button.disabled = holder !== undefined || (matchOn && iAmSeated);
        button.onclick = () => takeSeat(room, crew, role);
        seats.append(button);
      }
    }
    byId("unseated").textContent = unseated.join(", ") || "nobody";

    // The game view runs from the countdown until the player leaves the scoreboard.
    // A countdown straight after "over" is a new match (a fresh game view); after a pause it's a resume.
    if (phase === Phase.Countdown && lastPhase === Phase.Over && game) stopGame();
    if (matchOn && !game) game = startGame(room, stopGame);
    if (phase === Phase.Waiting && game) stopGame();
    lastPhase = phase;

    const isHost = state.hostId === room.sessionId;
    const start = byId<HTMLButtonElement>("start");
    start.hidden = !isHost;
    start.disabled = matchOn;
    byId("match").textContent = matchOn
      ? "Match on"
      : isHost ? "" : "Waiting for the host to start";

    const lastResult = byId("last-result");
    lastResult.hidden = phase !== Phase.Over;
    if (phase === Phase.Over) renderResult(lastResult, state);
  }

  function takeSeat(room: Room, crew: Crew, role: Role): void {
    showError("");
    room.send(ClientMessage.TakeSeat, { crew, role });
  }

  function readName(): string | null {
    const name = normaliseName(nameInput.value);
    if (name === null) showError(joinErrorText(new Error(JoinError.InvalidName)));
    return name;
  }

  byId("create").onclick = async () => {
    const name = readName();
    if (name === null) return;
    try {
      enterRoom(await client.create(ROOM_NAME, { name }));
    } catch (error) {
      showError(joinErrorText(error));
    }
  };

  byId("join").onclick = async () => {
    const name = readName();
    if (name === null) return;
    const code = normaliseCode(codeInput.value);
    if (code === null) {
      showError("Room codes are 4 letters.");
      return;
    }
    try {
      enterRoom(await client.joinById(code, { name }));
    } catch (error) {
      showError(joinErrorText(error));
    }
  };

  // After a page reload, try to take back the seat we had.
  const token = loadToken(storage);
  if (token) {
    client.reconnect(token)
      .then(enterRoom)
      .catch(() => {
        clearToken(storage);
        showJoinScreen();
      });
  }
}
