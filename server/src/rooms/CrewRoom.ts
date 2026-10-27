import { join } from "node:path";
import { Room, ServerError, ErrorCode, type Client } from "@colyseus/core";
import {
  ClientMessage,
  DEFAULT_LAYOUT,
  RANDOM_LAYOUT,
  isLayoutId,
  isReefAmount,
  randomLayout,
  type LayoutId,
  JoinError,
  MAX_MESSAGES_PER_SECOND,
  Phase,
  RejectReason,
  MAX_PLAYERS,
  RECONNECT_WINDOW_SECONDS,
  ServerMessage,
  TUNING,
  closeTally,
  createWorld,
  earnedAwards,
  newTally,
  pickAwards,
  shipResults,
  updateTally,
  type AwardTally,
  sinkForTest,
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
import { LOG_DIR, firstHazardAt, fixedSeed, fixedStormTimes, joinAddress, testSink } from "../config.ts";
import { awardsLine, controlLine, matchEndLine, matchMs, matchStartLine, playerLine, positionLines, seatLine, simEventLines, type LogLine, type Roster } from "../log/events.ts";
import { MatchLog, fileSink, logFileName, type LogSink } from "../log/matchLog.ts";
import { canChangeSeat, canEndMatch, canPause, canResume, canSetPacks, canStart, crewHasShip, everyCrewManned, nextHost, readLayout, readOnOff, readReefs, readLives, readMode, readReady, shipCount } from "./matchFlow.ts";
import { generateUniqueCode } from "./roomCode.ts";
import { isNameTaken, takeSeat, type SeatMap } from "./seats.ts";
import { closeUpCrews, findPartner, leaveCrew, placeJoiner, refreshWaiting, seatWaiting, type CrewResult, type CrewRoster } from "./crews.ts";
import { AwardState, CrewState, Player, ResultState } from "./state.ts";
import { GhostControl } from "./ghostControl.ts";
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
  /** Stage 2: which crewmate each ghost follows (the one who moved it last). */
  private readonly ghostControl = new GhostControl();
  /** TEST_SINK (browser tests only): the crew to sink and when, until it has been done this match. */
  private pendingTestSink: { ship: number; at: number } | null = null;
  /** Players who pressed Pack since the last tick, so a press isn't lost if a release arrives first. */
  private packPressed = new Set<string>();
  /** Order players joined in, for passing on the host. */
  private joinOrder = new Map<string, number>();
  /** Stage 3: crews with one player, and when each started waiting for a partner (on `crewClock`). */
  private crewWaiting = new Map<number, number>();
  private crewClock = 0;
  /** Stage 3 results: each ship's time on the water this match, and when each crew went out (Last Afloat). */
  private afloat: number[] = [];
  private outAt: (number | null)[] = [];
  /** Stage 3 awards: the tally through the match, and the match's seed (for the pick). */
  private tally: AwardTally = newTally(2);
  private matchSeed = 0;
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
  /** A new seed for each match's random generator (written to the log so a match can be replayed). */
  /** The last match's layout, which Random never picks again. */
  private previousLayout: LayoutId | null = null;
  seedForMatch: () => number = () => fixedSeed(process.env) ?? Math.floor(Math.random() * 2 ** 32);

  async onCreate(): Promise<void> {
    this.roomId = await generateUniqueCode(Math.random, async (code) =>
      (await this.presence.smembers(CODES_KEY)).includes(code),
    );
    await this.presence.sadd(CODES_KEY, this.roomId);
    this.state.joinAddress = joinAddress(process.env);

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
      // A match that started without Crew 3 has no third ship: Crew 3 opens again between matches.
      if (seat && !crewHasShip(this.state.phase, seat.crew, this.world?.ships.length ?? 0)) {
        client.send(ServerMessage.Rejected, { reason: RejectReason.CrewNotInMatch } satisfies RejectedMessage);
        return;
      }
      this.applyCrews({ seats: result.seats, waiting: this.crewWaiting });
    });

    // Stage 3: Find me a partner, and Leave this crew (between matches, like switching seats).
    const crewAction = (client: Client, act: (roster: CrewRoster, id: string, now: number) => CrewResult) => {
      if (!canChangeSeat(this.state.phase, this.seatOf(client.sessionId) !== null)) {
        client.send(ServerMessage.Rejected, { reason: RejectReason.SeatLocked } satisfies RejectedMessage);
        return;
      }
      const result = act(this.crewRoster(), client.sessionId, this.crewClock++);
      if (result.ok) this.applyCrews(result.roster);
      else client.send(ServerMessage.Rejected, { reason: result.reason } satisfies RejectedMessage);
    };
    this.onMessage(ClientMessage.FindPartner, (client) => crewAction(client, findPartner));
    this.onMessage(ClientMessage.LeaveCrew, (client) => crewAction(client, leaveCrew));

    // Stage 3 slice 3: a player waiting out a match (no crew) sets up their crew for the next round.
    this.onMessage(ClientMessage.SetNextRole, (client, message: unknown) => {
      const player = this.state.players.get(client.sessionId);
      const role = (message as { role?: unknown } | null)?.role;
      if (!player || player.crew !== undefined || (role !== "pilot" && role !== "gunner")) return;
      player.nextRole = role;
    });
    this.onMessage(ClientMessage.PairWith, (client, message: unknown) => {
      const player = this.state.players.get(client.sessionId);
      const otherId = (message as { player?: unknown } | null)?.player;
      if (!player || player.crew !== undefined || typeof otherId !== "string") return;
      const other = otherId ? this.state.players.get(otherId) : undefined;
      // Only another waiting player who has no partner (or already has this one).
      if (otherId && (!other || otherId === client.sessionId || other.crew !== undefined || (other.partner !== "" && other.partner !== client.sessionId))) return;
      this.unpair(client.sessionId);
      if (other) {
        player.partner = otherId;
        other.partner = client.sessionId;
      }
    });

    this.onMessage(ClientMessage.SetReady, (client, message: unknown) => {
      const player = this.state.players.get(client.sessionId);
      const ready = readReady(message);
      if (!player || ready === null || this.matchOn() || player.crew === undefined) return;
      player.ready = ready;
    });

    this.onMessage(ClientMessage.Start, (client) => {
      if (!canStart(client.sessionId, this.state.hostId, this.state.phase)) return;
      if (this.state.mode === "lastAfloat" && !everyCrewManned(this.seatedCrews())) {
        client.send(ServerMessage.Rejected, { reason: RejectReason.CrewsNeedPlayers } satisfies RejectedMessage);
        return;
      }
      this.startMatch();
    });

    this.onMessage(ClientMessage.Pause, (client) => {
      if (!canPause(this.state.phase, this.seatOf(client.sessionId) !== null)) return;
      this.state.pausedBy = this.state.players.get(client.sessionId)?.name ?? "";
      this.state.phase = Phase.Paused;
      this.latestInput.clear();
      this.ghostControl.clear();
      this.logLine(controlLine(this.logTime(), "paused", this.nameOf(client.sessionId), this.seatOf(client.sessionId)));
    });

    this.onMessage(ClientMessage.Resume, (client) => {
      if (!canResume(client.sessionId, this.state.hostId, this.state.phase)) return;
      // The same 3-2-1 as a match start; the world carries on where it stopped.
      this.state.countdown = this.countdownSeconds;
      this.state.phase = Phase.Countdown;
      this.logLine(controlLine(this.logTime(), "resumed", this.nameOf(client.sessionId), this.seatOf(client.sessionId)));
    });

    this.onMessage(ClientMessage.SetPacks, (client, message: unknown) => {
      if (!canSetPacks(client.sessionId, this.state.hostId, this.state.phase)) return;
      const valid = typeof message === "object" && message !== null && Object.keys(message).length === 1 && typeof (message as { on?: unknown }).on === "boolean";
      if (valid) this.state.packsEnabled = (message as { on: boolean }).on;
    });

    // Stage 2 room settings: the same host-only, between-matches rule as the Packs toggle.
    this.onMessage(ClientMessage.SetMode, (client, message: unknown) => {
      if (!canSetPacks(client.sessionId, this.state.hostId, this.state.phase)) return;
      const mode = readMode(message);
      if (mode) this.state.mode = mode;
    });

    this.onMessage(ClientMessage.SetLives, (client, message: unknown) => {
      if (!canSetPacks(client.sessionId, this.state.hostId, this.state.phase)) return;
      const lives = readLives(message);
      if (lives !== null) this.state.lives = lives;
    });

    this.onMessage(ClientMessage.SetHazards, (client, message: unknown) => {
      if (!canSetPacks(client.sessionId, this.state.hostId, this.state.phase)) return;
      const on = readOnOff(message);
      if (on !== null) this.state.hazardsEnabled = on;
    });

    this.onMessage(ClientMessage.SetReefs, (client, message: unknown) => {
      if (!canSetPacks(client.sessionId, this.state.hostId, this.state.phase)) return;
      const reefs = readReefs(message);
      if (reefs) this.state.reefs = reefs;
    });

    // Stage 3: change your name between matches; names stay unique in the room (ignoring case).
    this.onMessage(ClientMessage.SetName, (client, message: unknown) => {
      const reject = (reason: RejectReason) => client.send(ServerMessage.Rejected, { reason } satisfies RejectedMessage);
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const phase = this.state.phase;
      if (phase === Phase.Countdown || phase === Phase.Running || phase === Phase.Paused) return reject(RejectReason.NameLocked);
      const name = normaliseName((message as { name?: unknown } | null)?.name);
      if (name === null) return reject(RejectReason.InvalidName);
      const others = [...this.state.players.entries()].filter(([id]) => id !== client.sessionId).map(([, p]) => p.name);
      if (isNameTaken(others, name)) return reject(RejectReason.NameTaken);
      player.name = name;
    });

    this.onMessage(ClientMessage.SetLayout, (client, message: unknown) => {
      if (!canSetPacks(client.sessionId, this.state.hostId, this.state.phase)) return;
      const layout = readLayout(message);
      if (layout) this.state.layout = layout;
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
    // Stage 3: into the crew waiting longest for a partner, or a new crew of their own; during a match they wait
    // without a crew until it ends (slice 3).
    this.applyCrews(placeJoiner(this.crewRoster(), client.sessionId, this.crewClock++, this.matchOn()));
  }

  onDrop(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;
    this.latestInput.delete(client.sessionId);
    this.ghostControl.forget(client.sessionId);
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
    this.unpair(client.sessionId);
    this.state.players.delete(client.sessionId);
    if (this.log) this.roster = this.buildRoster();
    this.latestInput.delete(client.sessionId);
    this.ghostControl.forget(client.sessionId);
    this.joinOrder.delete(client.sessionId);
    if (this.state.hostId === client.sessionId) this.state.hostId = nextHost(this.joinOrder);
    this.applyCrews(this.crewRoster());
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
    this.state.results.clear();
    this.state.awards.clear();
    this.afloat = [];
    this.outAt = [];
    // Stage 3: everyone's Ready clears with each match.
    this.state.players.forEach((player) => { player.ready = false; });
    const seed = this.seedForMatch() >>> 0;
    const packsOn = this.state.packsEnabled;
    // A third ship only when someone sits in Crew 3 as the match starts.
    const ships = shipCount(this.seatedCrews());
    const mode = this.state.mode === "lastAfloat" ? "lastAfloat" : "sinkCount";
    const lives = mode === "lastAfloat" ? this.state.lives : null;
    // Random picks with the match's seed, never the room's previous layout.
    const layoutRandom = this.state.layout === RANDOM_LAYOUT;
    const layout = layoutRandom ? randomLayout(seed, this.previousLayout) : isLayoutId(this.state.layout) ? this.state.layout : DEFAULT_LAYOUT;
    this.previousLayout = layout;
    const hazardsOn = this.state.hazardsEnabled;
    const reefs = hazardsOn && isReefAmount(this.state.reefs) ? this.state.reefs : "none";
    // STORM_STARTS_AT / STORM_CLOSED_AT: a sooner closing storm, for the browser tests only.
    const storm = fixedStormTimes(process.env) ?? undefined;
    // HAZARDS_FIRST_AT: when the first dynamic hazard comes ("never" for none), for the browser tests only.
    this.world = createWorld({ packs: packsOn, seed, ships, mode, lives: lives ?? undefined, layout, hazards: hazardsOn, reefs, storm, firstHazardAt: firstHazardAt(process.env) });
    this.pendingTestSink = testSink(process.env);
    this.state.matchReefs = reefs;
    this.state.matchMode = mode;
    this.state.matchLayout = layout;
    this.roster = this.buildRoster();
    this.tally = newTally(this.world.ships.length);
    this.matchSeed = seed;
    this.log = new MatchLog(this.logSinkFor(logFileName(new Date(), this.roomId)), { onError: (error) => this.logErrors(error) });
    this.logLine(matchStartLine(this.roomId, this.roster, { packsOn, seed, mode, lives, layout, layoutRandom, hazardsOn, reefs, wrecks: this.world.wrecks, storm: this.world.storm, firstHazardAt: this.world.nextHazardIn }));
    for (const line of positionLines(this.world)) this.logLine(line);
    this.nextPositionAt = 1;
    this.latestInput.clear();
    this.ghostControl.clear();
    syncWorld(this.state, this.world);
    for (const ship of this.state.ships) {
      ship.hits = 0;
      ship.sunkBy = -1;
      ship.sunkCause = "";
      ship.empsFired = 0;
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
    this.ghostControl.clear();
    syncWorld(this.state, this.world);
    const winner = matchResult(this.world).winner;
    this.state.winner = winner ?? -1;
    this.logLine(controlLine(this.logTime(), "endedEarly", this.nameOf(sessionId), this.seatOf(sessionId)));
    this.showResults();
    this.logLine(matchEndLine(this.world, winner, true));
    void this.closeLog();
    this.settleCrews();
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
    this.packPressed.clear();
    this.world = result.world;
    // Stage 3 results: time on the water, and when each crew went out.
    this.world.ships.forEach((ship, i) => {
      if (!ship.sunk) this.afloat[i] = (this.afloat[i] ?? 0) + dt;
    });
    for (const event of result.events) if (event.type === "crewOut") this.outAt[event.ship] = this.world.time;
    // TEST_SINK (browser tests only): sink the chosen crew once its time comes.
    const sink = this.pendingTestSink;
    if (sink && this.world.time >= sink.at - 1e-9 && !this.world.over) {
      this.pendingTestSink = null;
      const sunk = sinkForTest(this.world, sink.ship);
      this.world = sunk.world;
      result.events.push(...sunk.events);
    }
    syncWorld(this.state, this.world);
    applyEvents(this.state, result.events);
    this.tally = updateTally(this.tally, this.world, result.events, dt);

    for (const line of simEventLines(this.logTime(), result.events, this.roster)) this.logLine(line);
    if (this.world.time >= this.nextPositionAt - 1e-9) {
      for (const line of positionLines(this.world)) this.logLine(line);
      this.nextPositionAt += 1;
    }
    if (this.world.over) {
      this.showResults();
      this.logLine(matchEndLine(this.world, matchResult(this.world).winner, false));
      void this.closeLog();
      this.settleCrews();
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

  /** One entry per seated player: their crew. */
  private seatedCrews(): number[] {
    return [...this.state.players.values()].flatMap((p) => (p.crew === undefined ? [] : [p.crew]));
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
      if (input?.pack) this.packPressed.add(sessionId);
      if (input?.ghost) this.ghostControl.receive(sessionId, input.ghost);
    } else {
      const input = parseGunnerInput(message);
      if (input) this.latestInput.set(sessionId, { role: "gunner", input });
      if (input?.pack) this.packPressed.add(sessionId);
      if (input?.ghost) this.ghostControl.receive(sessionId, input.ghost);
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
      const pack = !!latest.input.pack || this.packPressed.has(sessionId);
      if (latest.role === "pilot") ship.pilot = { ...latest.input, pack };
      else ship.gunner = { ...latest.input, pack };
    });
    // Stage 2: each ghost follows whichever of its crew's seated, connected players moved it last.
    for (const ghost of this.world!.ghosts) {
      const crew = [...this.state.players.entries()].filter(([id, p]) => p.connected && this.seatOf(id)?.crew === ghost.ship).map(([id]) => id);
      const ship = inputs[ghost.ship];
      if (ship) ship.ghost = this.ghostControl.steer(crew);
    }
    return inputs;
  }

  private matchOn(): boolean {
    const phase = this.state.phase;
    return phase === Phase.Countdown || phase === Phase.Running || phase === Phase.Paused;
  }

  private crewRoster(): CrewRoster {
    return { seats: this.seatMap(), waiting: this.crewWaiting };
  }

  /**
   * Stage 3: applies a crew roster. Crews with one player wait for a partner; between matches crew numbers close up
   * (so the ships are Crew 1, 2 and 3 in order). A player whose crew or role changed is no longer ready. During a
   * match, a seat taken is logged (as before).
   */
  private applyCrews(roster: CrewRoster): void {
    let next = refreshWaiting(roster, this.crewClock++);
    if (!this.matchOn()) next = closeUpCrews(next);
    for (const [id, seat] of next.seats) {
      const before = this.seatOf(id);
      const same = before && seat ? before.crew === seat.crew && before.role === seat.role : before === seat;
      if (same) continue;
      this.applySeat(id, seat);
      const player = this.state.players.get(id);
      if (player) player.ready = false;
      if (this.log && seat && this.matchOn()) this.logLine(seatLine(this.logTime(), this.nameOf(id), seat));
    }
    this.crewWaiting = new Map(next.waiting);
    if (this.log) this.roster = this.buildRoster();
  }

  /**
   * After a match: players who waited it out get crews (a pair together; in the order they joined), with their
   * chosen role; partners are forgotten; crew numbers close up.
   */
  private settleCrews(): void {
    const waiters = [...this.state.players.entries()]
      .filter(([, p]) => p.crew === undefined)
      .sort(([a], [b]) => (this.joinOrder.get(a) ?? 0) - (this.joinOrder.get(b) ?? 0))
      .map(([id, p]) => ({ id, role: (p.nextRole === "gunner" ? "gunner" : "pilot") as Role, partner: p.partner }));
    this.applyCrews(seatWaiting(this.crewRoster(), waiters, this.crewClock++));
    for (const { id } of waiters) {
      const player = this.state.players.get(id);
      if (player) player.partner = "";
    }
  }

  /** Stage 3: the results and awards everyone sees at the end of a match (the awards are logged too). */
  private showResults(): void {
    if (!this.world) return;
    const awards = pickAwards(earnedAwards(closeTally(this.tally, this.world), this.world), this.matchSeed);
    this.state.awards.clear();
    for (const a of awards) this.state.awards.push(new AwardState(a));
    this.logLine(awardsLine(this.logTime(), awards, this.roster));
    this.state.results.clear();
    for (const r of shipResults(this.world, this.afloat, this.outAt.map((t) => t ?? null))) {
      this.state.results.push(new ResultState({ ship: r.ship, place: r.place, sinkings: r.sinkings, afloatSeconds: r.afloatSeconds, livesLeft: r.livesLeft ?? -1, out: r.out }));
    }
  }

  /** A waiting player's partner (if any) is left without one. */
  private unpair(sessionId: string): void {
    const partner = this.state.players.get(this.state.players.get(sessionId)?.partner ?? "");
    if (partner?.partner === sessionId) partner.partner = "";
    const player = this.state.players.get(sessionId);
    if (player) player.partner = "";
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
