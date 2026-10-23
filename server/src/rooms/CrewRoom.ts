import { join } from "node:path";
import { Room, ServerError, ErrorCode, type Client } from "@colyseus/core";
import {
  ClientMessage,
  JoinError,
  MAX_MESSAGES_PER_SECOND,
  Phase,
  RejectReason,
  MAX_PLAYERS,
  RECONNECT_WINDOW_SECONDS,
  ServerMessage,
  TUNING,
  createWorld,
  matchResult,
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
import { LOG_DIR } from "../config.ts";
import { controlLine, matchEndLine, matchMs, matchStartLine, playerLine, positionLines, seatLine, simEventLines, type LogLine, type Roster } from "../log/events.ts";
import { MatchLog, fileSink, logFileName, type LogSink } from "../log/matchLog.ts";
import { canChangeSeat, canEndMatch, canPause, canResume, canStart, nextHost } from "./matchFlow.ts";
import { generateUniqueCode } from "./roomCode.ts";
import { isNameTaken, takeSeat, type SeatMap } from "./seats.ts";
import { CrewState, Player } from "./state.ts";
import { applyEvents, syncWorld } from "./sync.ts";

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
  /** Length of the 3-2-1 countdown; a field so tests can shorten it. */
  countdownSeconds: number = TUNING.match.countdown;
  /** The running simulation; null until the first match starts. */
  world: World | null = null;
  /** Latest valid input per session id. */
  private latestInput = new Map<string, LatestInput>();
  /** Order players joined in, for passing on the host. */
  private joinOrder = new Map<string, number>();
  private joinCount = 0;
  /** Where each match's log goes; fields so tests can capture it in memory. */
  logSinkFor: (fileName: string) => LogSink = (fileName) => fileSink(join(LOG_DIR, fileName));
  logErrors: (error: unknown) => void = (error) => console.error("Match log write failed:", error);
  /** The current match's event log; open from match start to match end. */
  private log: MatchLog | null = null;
  /** Who crews each ship, for naming players in the log. */
  private roster: Roster = [];
  /** Match time (s) of the next once-a-second position lines. */
  private nextPositionAt = 0;

  async onCreate(): Promise<void> {
    this.roomId = await generateUniqueCode(Math.random, async (code) =>
      (await this.presence.smembers(CODES_KEY)).includes(code),
    );
    await this.presence.sadd(CODES_KEY, this.roomId);

    this.onMessage(ClientMessage.TakeSeat, (client, message: unknown) => {
      if (!canChangeSeat(this.state.phase, this.seatOf(client.sessionId) !== null)) {
        client.send(ServerMessage.Rejected, { reason: RejectReason.SeatLocked } satisfies RejectedMessage);
        return;
      }
      const result = takeSeat(this.seatMap(), client.sessionId, message);
      if (!result.ok) {
        client.send(ServerMessage.Rejected, { reason: result.reason } satisfies RejectedMessage);
        return;
      }
      const seat = result.seats.get(client.sessionId) ?? null;
      this.applySeat(client.sessionId, seat);
      if (this.log && seat) {
        this.roster = this.buildRoster();
        this.logLine(seatLine(this.logTime(), this.nameOf(client.sessionId), seat));
      }
    });

    this.onMessage(ClientMessage.Start, (client) => {
      if (canStart(client.sessionId, this.state.hostId, this.state.phase)) this.startMatch();
    });

    this.onMessage(ClientMessage.Pause, (client) => {
      if (!canPause(this.state.phase, this.seatOf(client.sessionId) !== null)) return;
      this.state.pausedBy = this.state.players.get(client.sessionId)?.name ?? "";
      this.state.phase = Phase.Paused;
      this.latestInput.clear();
      this.logLine(controlLine(this.logTime(), "paused", this.nameOf(client.sessionId), this.seatOf(client.sessionId)));
    });

    this.onMessage(ClientMessage.Resume, (client) => {
      if (!canResume(client.sessionId, this.state.hostId, this.state.phase)) return;
      // The same 3-2-1 as a match start; the world carries on where it stopped.
      this.state.countdown = this.countdownSeconds;
      this.state.phase = Phase.Countdown;
      this.logLine(controlLine(this.logTime(), "resumed", this.nameOf(client.sessionId), this.seatOf(client.sessionId)));
    });

    this.onMessage(ClientMessage.EndMatch, (client) => {
      if (canEndMatch(client.sessionId, this.state.hostId, this.state.phase)) this.endMatchNow(client.sessionId);
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
    this.joinOrder.set(client.sessionId, this.joinCount++);
    if (!this.state.hostId) this.state.hostId = client.sessionId;
    this.logLine(playerLine(this.logTime(), "playerJoined", name, null));
  }

  onDrop(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;
    this.latestInput.delete(client.sessionId);
    this.logLine(playerLine(this.logTime(), "playerDropped", this.nameOf(client.sessionId), this.seatOf(client.sessionId)));
    this.allowReconnection(client, this.reconnectSeconds);
  }

  onReconnect(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = true;
    this.logLine(playerLine(this.logTime(), "playerReconnected", this.nameOf(client.sessionId), this.seatOf(client.sessionId)));
  }

  onLeave(client: Client): void {
    this.logLine(playerLine(this.logTime(), "playerLeft", this.nameOf(client.sessionId), this.seatOf(client.sessionId)));
    this.state.players.delete(client.sessionId);
    if (this.log) this.roster = this.buildRoster();
    this.latestInput.delete(client.sessionId);
    this.joinOrder.delete(client.sessionId);
    if (this.state.hostId === client.sessionId) this.state.hostId = nextHost(this.joinOrder);
  }

  async onDispose(): Promise<void> {
    // Everyone left mid-match: note it and write out what we have.
    this.logLine({ t: this.logTime(), type: "roomClosed" });
    await this.closeLog();
    await this.presence.srem(CODES_KEY, this.roomId);
  }

  /** A fresh world, scores and result reset, then the 3-2-1 countdown with ships frozen. */
  private startMatch(): void {
    void this.closeLog();
    this.world = createWorld();
    this.roster = this.buildRoster();
    this.log = new MatchLog(this.logSinkFor(logFileName(new Date(), this.roomId)), { onError: (error) => this.logErrors(error) });
    this.logLine(matchStartLine(this.roomId, this.roster));
    for (const line of positionLines(this.world)) this.logLine(line);
    this.nextPositionAt = 1;
    this.latestInput.clear();
    syncWorld(this.state, this.world);
    for (const ship of this.state.ships) {
      ship.hits = 0;
      ship.sunkBy = -1;
    }
    this.state.winner = -1;
    this.state.countdown = this.countdownSeconds;
    this.state.phase = Phase.Countdown;
  }

  /** Host's "Exit game": the match ends now and the current score is the result, as at time-up. */
  private endMatchNow(sessionId: string): void {
    if (!this.world) return;
    this.world = { ...this.world, over: true };
    this.latestInput.clear();
    syncWorld(this.state, this.world);
    const winner = matchResult(this.world).winner;
    this.state.winner = winner ?? -1;
    this.logLine(controlLine(this.logTime(), "endedEarly", this.nameOf(sessionId), this.seatOf(sessionId)));
    this.logLine(matchEndLine(this.world, winner, true));
    void this.closeLog();
  }

  private tick(dt: number): void {
    if (!this.world) return;
    if (this.state.phase === Phase.Countdown) {
      this.state.countdown = Math.max(0, this.state.countdown - dt);
      if (this.state.countdown <= 1e-9) this.state.phase = Phase.Running;
      return;
    }
    if (this.state.phase !== Phase.Running) return;
    const result = step(this.world, this.shipInputs(), dt);
    this.world = result.world;
    syncWorld(this.state, this.world);
    applyEvents(this.state, result.events);

    for (const line of simEventLines(this.logTime(), result.events, this.roster)) this.logLine(line);
    if (this.world.time >= this.nextPositionAt - 1e-9) {
      for (const line of positionLines(this.world)) this.logLine(line);
      this.nextPositionAt += 1;
    }
    if (this.world.over) {
      this.logLine(matchEndLine(this.world, matchResult(this.world).winner, false));
      void this.closeLog();
    }
  }

  /** Match time for log lines (ms); pauses don't count. */
  private logTime(): number {
    return matchMs(this.world?.time ?? 0);
  }

  /** Only writes while a match's log is open. */
  private logLine(line: LogLine): void {
    this.log?.write(line);
  }

  private async closeLog(): Promise<void> {
    const log = this.log;
    this.log = null;
    await log?.close();
  }

  private nameOf(sessionId: string): string {
    return this.state.players.get(sessionId)?.name ?? "";
  }

  /** Names in each ship's seats right now (index = ship id). */
  private buildRoster(): Roster {
    const roster: Roster = (this.world?.ships ?? []).map(() => ({ pilot: null, gunner: null }));
    this.state.players.forEach((player, sessionId) => {
      const seat = this.seatOf(sessionId);
      const crew = seat ? roster[seat.crew] : undefined;
      if (seat && crew) crew[seat.role] = player.name;
    });
    return roster;
  }

  /** Keeps the latest valid input for the sender's current role; anything else is ignored. */
  private receiveInput(sessionId: string, message: unknown): void {
    if (this.state.phase !== Phase.Running) return;
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
