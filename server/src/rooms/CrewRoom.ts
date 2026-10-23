import { Room, ServerError, ErrorCode, type Client } from "@colyseus/core";
import {
  ClientMessage,
  JoinError,
  MAX_PLAYERS,
  RECONNECT_WINDOW_SECONDS,
  ServerMessage,
  normaliseName,
  type Crew,
  type RejectedMessage,
  type Role,
  type Seat,
} from "@sink-or-sail/shared";
import { generateUniqueCode } from "./roomCode.ts";
import { isNameTaken, takeSeat, type SeatMap } from "./seats.ts";
import { CrewState, Player } from "./state.ts";

/** Presence set of codes held by open rooms (Colyseus "custom room ID" recipe). */
export const CODES_KEY = "crew-room-codes";

interface JoinOptions {
  name?: unknown;
}

export class CrewRoom extends Room<{ state: CrewState }> {
  maxClients = MAX_PLAYERS;
  state = new CrewState();
  /** Seconds a dropped player's seat is held; a field so tests can shorten it. */
  reconnectSeconds = RECONNECT_WINDOW_SECONDS;

  async onCreate(): Promise<void> {
    this.roomId = await generateUniqueCode(Math.random, async (code) =>
      (await this.presence.smembers(CODES_KEY)).includes(code),
    );
    await this.presence.sadd(CODES_KEY, this.roomId);

    this.onMessage(ClientMessage.TakeSeat, (client, message: unknown) => {
      const result = takeSeat(this.seatMap(), client.sessionId, message);
      if (!result.ok) {
        client.send(ServerMessage.Rejected, { reason: result.reason } satisfies RejectedMessage);
        return;
      }
      this.applySeat(client.sessionId, result.seats.get(client.sessionId) ?? null);
    });
  }

  onJoin(client: Client, options?: JoinOptions): void {
    const name = normaliseName(options?.name);
    if (name === null) throw new ServerError(ErrorCode.APPLICATION_ERROR, JoinError.InvalidName);
    const names = [...this.state.players.values()].map((p) => p.name);
    if (isNameTaken(names, name)) throw new ServerError(ErrorCode.APPLICATION_ERROR, JoinError.NameTaken);

    this.state.players.set(client.sessionId, new Player({ name }));
  }

  onDrop(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;
    this.allowReconnection(client, this.reconnectSeconds);
  }

  onReconnect(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = true;
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
  }

  async onDispose(): Promise<void> {
    await this.presence.srem(CODES_KEY, this.roomId);
  }

  private seatMap(): SeatMap {
    const seats = new Map<string, Seat | null>();
    this.state.players.forEach((player, sessionId) => {
      seats.set(sessionId, player.crew !== undefined && player.role !== undefined
        ? { crew: player.crew as Crew, role: player.role as Role }
        : null);
    });
    return seats;
  }

  private applySeat(sessionId: string, seat: Seat | null): void {
    const player = this.state.players.get(sessionId);
    if (!player) return;
    player.crew = seat?.crew;
    player.role = seat?.role;
  }
}
