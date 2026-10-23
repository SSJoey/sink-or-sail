import { Client, type Room } from "@colyseus/sdk";
import {
  ClientMessage,
  JoinError,
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
import { joinErrorText, rejectedText } from "./messages.ts";
import { clearToken, loadToken, saveToken } from "./reconnectToken.ts";

/** The parts of the server's room state the lobby reads. */
interface PlayerView {
  name: string;
  crew?: number;
  role?: string;
  connected: boolean;
}
interface StateView {
  players: { forEach(cb: (player: PlayerView, sessionId: string) => void): void };
}

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
      clearToken(storage);
      showJoinScreen();
      if (code !== CONSENTED) showError("You were disconnected from the room.");
    });
    byId("leave").onclick = () => { void room.leave(); };
  }

  function renderRoom(room: Room, state: StateView): void {
    const seats = byId("seats");
    seats.replaceChildren();
    const unseated: string[] = [];
    const holders = new Map<string, { player: PlayerView; sessionId: string }>();
    state.players.forEach((player, sessionId) => {
      if (player.crew === undefined || player.role === undefined) unseated.push(player.name);
      else holders.set(`${player.crew}:${player.role}`, { player, sessionId });
    });

    for (const crew of CREWS) {
      for (const role of ROLES) {
        const holder = holders.get(`${crew}:${role}`);
        const button = document.createElement("button");
        let label = `Crew ${crew + 1} · ${roleLabel[role]} — `;
        if (!holder) label += "free";
        else label += holder.player.name + (holder.player.connected ? "" : " (reconnecting)");
        if (holder?.sessionId === room.sessionId) label += " ✓";
        button.textContent = label;
        button.disabled = holder !== undefined;
        button.onclick = () => takeSeat(room, crew, role);
        seats.append(button);
      }
    }
    byId("unseated").textContent = unseated.join(", ") || "nobody";
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
