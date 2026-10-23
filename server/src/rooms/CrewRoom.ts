import { Room, ServerError, ErrorCode, type Client } from "@colyseus/core";
import {
  ClientMessage,
  JoinError,
  MAX_MESSAGES_PER_SECOND,
  MAX_PLAYERS,
  RECONNECT_WINDOW_SECONDS,
  ServerMessage,
  TUNING,
  createWorld,
  normaliseName,
  parseGunnerInput,
  parsePilotInput,
  step,
  type Crew,
  type GunnerInput,
  type PilotInput,
  type RejectedMessage,
  type Role,
  type Seat,
  type ShipInput,
  type World,
} from "@sink-or-sail/shared";
import { generateUniqueCode } from "./roomCode.ts";
import { isNameTaken, takeSeat, type SeatMap } from "./seats.ts";
import { CrewState, Player } from "./state.ts";
import { syncWorld } from "./sync.ts";

/** Presence set of codes held by open rooms (Colyseus "custom room ID" recipe). */
export const CODES_KEY = "crew-room-codes";

interface JoinOptions {
  name?: unknown;
}

/** A player's latest input, tagged with the role it was sent for. */
type LatestInput = { role: "pilot"; input: PilotInput } | { role: "gunner"; input: GunnerInput };

const NEUTRAL_PILOT: PilotInput = { steer: { x: 0, y: 0 }, boost: false };
const NEUTRAL_GUNNER: GunnerInput = { aim: { x: 0, y: 0 }, fire: false, shield: false };

export class CrewRoom extends Room<{ state: CrewState }> {
  maxClients = MAX_PLAYERS;
  maxMessagesPerSecond = MAX_MESSAGES_PER_SECOND;
  patchRate = 1000 / TUNING.server.tickRate;
  state = new CrewState();
  /** Seconds a dropped player's seat is held; a field so tests can shorten it. */
  reconnectSeconds = RECONNECT_WINDOW_SECONDS;
  /** The running simulation; null until the first match starts. */
  world: World | null = null;
  /** Latest valid input per session id. */
  private latestInput = new Map<string, LatestInput>();

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

    this.onMessage(ClientMessage.Start, (client) => {
      if (!this.seatOf(client.sessionId) || (this.world && !this.world.over)) return;
      this.startMatch();
    });

    this.onMessage(ClientMessage.Input, (client, message: unknown) => this.receiveInput(client.sessionId, message));

    // Clients send only input; any other message type is ignored.
    this.onMessage("*", () => {});

    this.setFixedTimestep((ctx) => this.tick(ctx.dt), TUNING.server.tickRate);
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
    this.latestInput.delete(client.sessionId);
    this.allowReconnection(client, this.reconnectSeconds);
  }

  onReconnect(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = true;
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.latestInput.delete(client.sessionId);
  }

  async onDispose(): Promise<void> {
    await this.presence.srem(CODES_KEY, this.roomId);
  }

  private startMatch(): void {
    this.world = createWorld();
    this.latestInput.clear();
    syncWorld(this.state, this.world);
  }

  private tick(dt: number): void {
    if (!this.world || this.world.over) return;
    this.world = step(this.world, this.shipInputs(), dt).world;
    syncWorld(this.state, this.world);
  }

  /** Keeps the latest valid input for the sender's current role; anything else is ignored. */
  private receiveInput(sessionId: string, message: unknown): void {
    if (!this.world || this.world.over) return;
    const seat = this.seatOf(sessionId);
    if (!seat) return;
    if (seat.role === "pilot") {
      const input = parsePilotInput(message);
      if (input) this.latestInput.set(sessionId, { role: "pilot", input });
    } else {
      const input = parseGunnerInput(message);
      if (input) this.latestInput.set(sessionId, { role: "gunner", input });
    }
  }

  /** Builds each ship's input from its seated, connected crew; empty seats are neutral. */
  private shipInputs(): ShipInput[] {
    const inputs: ShipInput[] = this.world!.ships.map(() => ({ pilot: NEUTRAL_PILOT, gunner: NEUTRAL_GUNNER }));
    this.state.players.forEach((player, sessionId) => {
      const seat = this.seatOf(sessionId);
      const latest = this.latestInput.get(sessionId);
      if (!seat || !player.connected || !latest || latest.role !== seat.role) return;
      const ship = inputs[seat.crew];
      if (!ship) return;
      if (latest.role === "pilot") ship.pilot = latest.input;
      else ship.gunner = latest.input;
    });
    return inputs;
  }

  private seatOf(sessionId: string): Seat | null {
    const player = this.state.players.get(sessionId);
    if (!player || player.crew === undefined || player.role === undefined) return null;
    return { crew: player.crew as Crew, role: player.role as Role };
  }

  private seatMap(): SeatMap {
    const seats = new Map<string, Seat | null>();
    this.state.players.forEach((_player, sessionId) => seats.set(sessionId, this.seatOf(sessionId)));
    return seats;
  }

  private applySeat(sessionId: string, seat: Seat | null): void {
    const player = this.state.players.get(sessionId);
    if (!player) return;
    player.crew = seat?.crew;
    player.role = seat?.role;
  }
}
