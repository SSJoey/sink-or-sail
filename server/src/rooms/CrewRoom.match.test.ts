import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import type { Room as ClientRoom } from "@colyseus/sdk";
import { ClientMessage, MAX_MESSAGES_PER_SECOND, Phase, ROOM_NAME, RejectReason, ServerMessage, TUNING, type Crew, type Role } from "@sink-or-sail/shared";
import { server } from "../app.config.ts";
import type { CrewRoom } from "./CrewRoom.ts";
import { sleep, waitFor } from "./testUtils.ts";

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  colyseus = await boot(server);
});
afterAll(async () => {
  await colyseus.shutdown();
});
beforeEach(async () => {
  await colyseus.cleanup();
});

const steer = (x: number, y: number, boost = false) => ({ steer: { x, y }, boost });
const gun = (x: number, y: number, fire = false, shield = false) => ({ aim: { x, y }, fire, shield });

/** A room with Crew 1's pilot and gunner seated, plus an unseated watcher. */
async function crewedRoom() {
  const pilot = await colyseus.sdk.create(ROOM_NAME, { name: "Pilot" });
  const room = colyseus.getRoomById<CrewRoom>(pilot.roomId) as CrewRoom;
  const gunner = await colyseus.sdk.joinById(pilot.roomId, { name: "Gunner" });
  const watcher = await colyseus.sdk.joinById(pilot.roomId, { name: "Watcher" });
  const seat = async (client: ClientRoom, crew: Crew, role: Role) => {
    client.send(ClientMessage.TakeSeat, { crew, role });
    await waitFor(() => room.state.players.get(client.sessionId)?.role === role);
  };
  await seat(pilot, 0, "pilot");
  await seat(gunner, 0, "gunner");
  return { room, pilot, gunner, watcher };
}

/** Starts a match from the host (the pilot, who created the room), with a short countdown so tests stay quick. */
async function started() {
  const crewed = await crewedRoom();
  crewed.room.countdownSeconds = 0.1;
  crewed.pilot.send(ClientMessage.Start);
  await waitFor(() => crewed.room.state.phase === Phase.Running);
  return crewed;
}

const ship0 = (room: CrewRoom) => room.state.ships[0]!;

/** Moves the match clock to just before time-up, optionally with scores, and waits for the end. */
async function endMatch(room: CrewRoom, sinkings: [number, number] = [0, 0]) {
  const world = room.world!;
  room.world = { ...world, time: TUNING.match.duration - 0.1, ships: world.ships.map((s, i) => ({ ...s, sinkings: sinkings[i]! })) };
  await waitFor(() => room.state.phase === Phase.Over);
}

describe("host", () => {
  it("is the player who created the room", async () => {
    const { room, pilot } = await crewedRoom();
    expect(room.state.hostId).toBe(pilot.sessionId);
  });

  it("passes to the longest-present player when the host leaves", async () => {
    const { room, pilot, gunner } = await crewedRoom();
    await pilot.leave();
    await waitFor(() => room.state.hostId === gunner.sessionId);
  });

  it("stays with a host who only dropped", async () => {
    const { room, pilot } = await crewedRoom();
    pilot.reconnection.enabled = false;
    pilot.connection.close(4010);
    await waitFor(() => room.state.players.get(pilot.sessionId)?.connected === false);
    expect(room.state.hostId).toBe(pilot.sessionId);
  });
});

describe("starting the match", () => {
  it("waits until the host starts it, then counts down with ships frozen, then runs", async () => {
    const { room, pilot } = await crewedRoom();
    await sleep(150);
    expect(room.state.phase).toBe(Phase.Waiting);
    expect(room.state.ships.length).toBe(0);
    expect(room.countdownSeconds).toBe(TUNING.match.countdown);

    room.countdownSeconds = 0.5;
    pilot.send(ClientMessage.Start);
    await waitFor(() => room.state.phase === Phase.Countdown);
    expect(room.state.ships.length).toBe(2);
    expect(room.state.countdown).toBeGreaterThan(0);
    const x0 = ship0(room).x;
    pilot.send(ClientMessage.Input, steer(1, 0, true));
    await sleep(200);
    expect(room.state.phase).toBe(Phase.Countdown);
    expect(ship0(room).x).toBe(x0);
    expect(room.world!.time).toBe(0);

    await waitFor(() => room.state.phase === Phase.Running);
    expect(room.state.timeLeft).toBeLessThanOrEqual(TUNING.match.duration);
  });

  it("ignores a start from anyone but the host", async () => {
    const { room, gunner, watcher } = await crewedRoom();
    gunner.send(ClientMessage.Start);
    watcher.send(ClientMessage.Start);
    await sleep(150);
    expect(room.state.phase).toBe(Phase.Waiting);
  });

  it("lets the host start without a seat", async () => {
    const host = await colyseus.sdk.create(ROOM_NAME, { name: "Host" });
    const room = colyseus.getRoomById<CrewRoom>(host.roomId) as CrewRoom;
    host.send(ClientMessage.Start);
    await waitFor(() => room.state.phase === Phase.Countdown);
  });

  it("ignores a start while a match is on", async () => {
    const { room, pilot } = await started();
    await sleep(300);
    const before = room.world!.time;
    pilot.send(ClientMessage.Start);
    await sleep(150);
    expect(room.world!.time).toBeGreaterThan(before);
  });

  it(`runs the simulation at ${TUNING.server.tickRate} ticks per second`, async () => {
    const { room } = await started();
    const t0 = room.world!.time;
    await sleep(1000);
    const ticks = (room.world!.time - t0) * TUNING.server.tickRate;
    expect(ticks).toBeGreaterThan(TUNING.server.tickRate * 0.8);
    expect(ticks).toBeLessThan(TUNING.server.tickRate * 1.2);
  });
});

describe("input", () => {
  it("lets the pilot sail their crew's ship", async () => {
    const { room, pilot } = await started();
    const x0 = ship0(room).x;
    pilot.send(ClientMessage.Input, steer(1, 0, true));
    await waitFor(() => ship0(room).x > x0 + 20);
    expect(ship0(room).boosting).toBe(true);
    expect(room.state.ships[1]!.x).toBe(room.world!.ships[1]!.pos.x); // the other ship didn't move
  });

  it("keeps the last input in force until the next one", async () => {
    const { room, pilot } = await started();
    pilot.send(ClientMessage.Input, steer(0, 1));
    await waitFor(() => ship0(room).y > 460);
    const y = ship0(room).y;
    await sleep(200);
    expect(ship0(room).y).toBeGreaterThan(y);
  });

  it("lets the gunner aim and fire", async () => {
    const { room, gunner } = await started();
    gunner.send(ClientMessage.Input, gun(0, -1, true));
    await waitFor(() => room.state.shots.size > 0);
    expect(ship0(room).turret).toBeCloseTo(-Math.PI / 2, 4);
  });

  it("lets the gunner raise the shield", async () => {
    const { room, gunner } = await started();
    gunner.send(ClientMessage.Input, gun(0, 0, false, true));
    await waitFor(() => ship0(room).shielding);
  });

  it("ignores pilot input from the gunner and gunner input from the pilot", async () => {
    const { room, pilot, gunner } = await started();
    const x0 = ship0(room).x;
    gunner.send(ClientMessage.Input, steer(1, 0, true));
    pilot.send(ClientMessage.Input, gun(0, -1, true));
    await sleep(300);
    expect(ship0(room).x).toBe(x0);
    expect(ship0(room).boosting).toBe(false);
    expect(room.state.shots.size).toBe(0);
  });

  it("ignores input from a player without a seat", async () => {
    const { room, watcher } = await started();
    const before = room.world!.ships.map((s) => s.pos);
    watcher.send(ClientMessage.Input, steer(1, 0, true));
    watcher.send(ClientMessage.Input, gun(0, 1, true));
    await sleep(300);
    expect(room.world!.ships.map((s) => s.pos)).toEqual(before);
    expect(room.state.shots.size).toBe(0);
  });

  it("ignores malformed input and keeps the last good one", async () => {
    const { room, pilot } = await started();
    pilot.send(ClientMessage.Input, steer(0, 1));
    await waitFor(() => ship0(room).y > 460);
    for (const bad of [null, "go", { steer: { x: NaN, y: 0 }, boost: false }, { steer: { x: 1, y: 0 }, boost: true, x: 9000 }, { pos: { x: 0, y: 0 } }]) {
      pilot.send(ClientMessage.Input, bad);
    }
    await sleep(300);
    expect(ship0(room).boosting).toBe(false);
    expect(ship0(room).heading).toBeCloseTo(Math.PI / 2, 2);
  });

  it("ignores anything other than input: unknown messages change nothing", async () => {
    const { room, pilot } = await started();
    const x0 = ship0(room).x;
    pilot.send("setPosition", { x: 800, y: 450 });
    pilot.send("hit", { target: 1, damage: 100 });
    await sleep(300);
    expect(ship0(room).x).toBe(x0);
    expect(room.state.ships[1]!.health).toBe(TUNING.ship.maxHealth);
    expect(room.state.players.get(pilot.sessionId)?.connected).toBe(true);
  });

  it("ignores input before the match starts", async () => {
    const { room, pilot } = await crewedRoom();
    pilot.send(ClientMessage.Input, steer(1, 0, true));
    await sleep(150);
    expect(room.world).toBeNull();
  });

  it("drops a player's input when they disconnect", async () => {
    const { room, pilot } = await started();
    pilot.send(ClientMessage.Input, steer(1, 0, true));
    await waitFor(() => ship0(room).boosting);
    pilot.reconnection.enabled = false;
    pilot.connection.close(4010);
    await waitFor(() => !ship0(room).boosting);
  });

  it(`limits clients to ${MAX_MESSAGES_PER_SECOND} messages per second`, async () => {
    const { room } = await crewedRoom();
    expect(room.maxMessagesPerSecond).toBe(MAX_MESSAGES_PER_SECOND);
  });
});

describe("match end", () => {
  it("ends after the match duration and stops ticking", async () => {
    const { room, pilot } = await started();
    room.world = { ...room.world!, time: TUNING.match.duration - 0.1 };
    await waitFor(() => room.state.phase === Phase.Over);
    expect(room.state.timeLeft).toBe(0);
    const ended = room.world;
    pilot.send(ClientMessage.Input, steer(1, 0, true));
    await sleep(200);
    expect(room.world).toBe(ended);
  });

  it("records the winner", async () => {
    const { room } = await started();
    await endMatch(room, [1, 3]);
    expect(room.state.winner).toBe(1);
  });

  it("records a draw as -1", async () => {
    const { room } = await started();
    await endMatch(room, [2, 2]);
    expect(room.state.winner).toBe(-1);
  });

  it("starts a new match with scores, hits and the result reset", async () => {
    const { room, pilot } = await started();
    room.state.ships[0]!.hits = 4;
    room.state.ships[1]!.sunkBy = 0;
    await endMatch(room, [3, 1]);
    expect(room.state.ships[0]!.sinkings).toBe(3);

    pilot.send(ClientMessage.Start);
    await waitFor(() => room.state.phase === Phase.Running);
    expect(room.world!.time).toBeLessThan(1);
    expect(room.state.ships.map((s) => s.sinkings)).toEqual([0, 0]);
    expect(room.state.ships.map((s) => s.hits)).toEqual([0, 0]);
    expect(room.state.ships.map((s) => s.sunkBy)).toEqual([-1, -1]);
    expect(room.state.winner).toBe(-1);
  });
});

describe("sinking", () => {
  it("shows who sank whom, the hits taken and the score", async () => {
    const { room, gunner } = await started();
    // Put the ships in open water, Crew 2's ship nearly sunk, right in front of Crew 1's gun.
    const world = room.world!;
    room.world = {
      ...world,
      ships: [
        { ...world.ships[0]!, pos: { x: 300, y: 200 } },
        { ...world.ships[1]!, pos: { x: 450, y: 200 }, health: 20 },
      ],
    };
    gunner.send(ClientMessage.Input, gun(1, 0, true));
    await waitFor(() => room.state.ships[1]!.sunk);
    expect(room.state.ships[1]!.sunkBy).toBe(0);
    expect(room.state.ships[1]!.hits).toBeGreaterThanOrEqual(1);
    expect(room.state.ships[0]!.sinkings).toBe(1);
  });
});

describe("seats during a match", () => {
  it("stops a seated player leaving their seat", async () => {
    const { room, pilot } = await started();
    const rejected = pilot.waitForMessage(ServerMessage.Rejected);
    pilot.send(ClientMessage.LeaveSeat);
    expect(await rejected).toEqual({ reason: RejectReason.SeatLocked });
    expect(room.state.players.get(pilot.sessionId)?.crew).toBe(0);
  });

  it("stops a seated player switching seats", async () => {
    const { room, pilot } = await started();
    const rejected = pilot.waitForMessage(ServerMessage.Rejected);
    pilot.send(ClientMessage.TakeSeat, { crew: 1, role: "pilot" });
    expect(await rejected).toEqual({ reason: RejectReason.SeatLocked });
    expect(room.state.players.get(pilot.sessionId)?.crew).toBe(0);
  });

  it("lets a seatless player take a free seat", async () => {
    const { room, watcher } = await started();
    watcher.send(ClientMessage.TakeSeat, { crew: 1, role: "gunner" });
    await waitFor(() => room.state.players.get(watcher.sessionId)?.role === "gunner");
  });

  it("lets players switch again once the match is over", async () => {
    const { room, pilot } = await started();
    await endMatch(room);
    pilot.send(ClientMessage.TakeSeat, { crew: 1, role: "pilot" });
    await waitFor(() => room.state.players.get(pilot.sessionId)?.crew === 1);
  });
});

describe("a third ship", () => {
  it("has 2 ships when nobody sits in Crew 3", async () => {
    const { room } = await started();
    expect(room.world!.ships).toHaveLength(2);
    expect(room.state.ships).toHaveLength(2);
  });

  it("has 3 ships when someone sits in Crew 3 at the start, with the 3-ship starts", async () => {
    const crewed = await crewedRoom();
    crewed.watcher.send(ClientMessage.TakeSeat, { crew: 2, role: "pilot" });
    await waitFor(() => crewed.room.state.players.get(crewed.watcher.sessionId)?.crew === 2);
    crewed.room.countdownSeconds = 0.1;
    crewed.pilot.send(ClientMessage.Start);
    await waitFor(() => crewed.room.state.phase === Phase.Running);
    expect(crewed.room.world!.ships).toHaveLength(3);
    await waitFor(() => crewed.room.state.ships.length === 3);
  });

  it("drives the third ship from Crew 3's input", async () => {
    const crewed = await crewedRoom();
    crewed.watcher.send(ClientMessage.TakeSeat, { crew: 2, role: "pilot" });
    await waitFor(() => crewed.room.state.players.get(crewed.watcher.sessionId)?.crew === 2);
    crewed.room.countdownSeconds = 0.1;
    crewed.pilot.send(ClientMessage.Start);
    await waitFor(() => crewed.room.state.phase === Phase.Running);
    const startX = crewed.room.world!.ships[2]!.pos.x;
    crewed.watcher.send(ClientMessage.Input, steer(1, 0));
    await waitFor(() => crewed.room.world!.ships[2]!.pos.x > startX + 5);
  });

  it("keeps Crew 3 closed during a match that started without it, and opens it again afterwards", async () => {
    const { room, watcher } = await started();
    const rejected = watcher.waitForMessage(ServerMessage.Rejected);
    watcher.send(ClientMessage.TakeSeat, { crew: 2, role: "gunner" });
    expect(await rejected).toEqual({ reason: RejectReason.CrewNotInMatch });
    expect(room.state.players.get(watcher.sessionId)?.crew).toBeUndefined();
    await endMatch(room);
    watcher.send(ClientMessage.TakeSeat, { crew: 2, role: "gunner" });
    await waitFor(() => room.state.players.get(watcher.sessionId)?.crew === 2);
  });

  it("goes back to 2 ships for the next match once Crew 3 is empty", async () => {
    const crewed = await crewedRoom();
    crewed.watcher.send(ClientMessage.TakeSeat, { crew: 2, role: "pilot" });
    await waitFor(() => crewed.room.state.players.get(crewed.watcher.sessionId)?.crew === 2);
    crewed.room.countdownSeconds = 0.1;
    crewed.pilot.send(ClientMessage.Start);
    await waitFor(() => crewed.room.state.phase === Phase.Running);
    await endMatch(crewed.room);
    crewed.watcher.send(ClientMessage.LeaveSeat);
    await waitFor(() => crewed.room.state.players.get(crewed.watcher.sessionId)?.crew === undefined);
    crewed.pilot.send(ClientMessage.Start);
    await waitFor(() => crewed.room.state.phase === Phase.Running);
    expect(crewed.room.world!.ships).toHaveLength(2);
    await waitFor(() => crewed.room.state.ships.length === 2);
  });
});

describe("pause and resume", () => {
  it("lets any seated player pause; everything freezes", async () => {
    const { room, gunner, pilot } = await started();
    pilot.send(ClientMessage.Input, steer(1, 0, true));
    await sleep(200);
    gunner.send(ClientMessage.Pause);
    await waitFor(() => room.state.phase === Phase.Paused);
    expect(room.state.pausedBy).toBe("Gunner");
    const time = room.world!.time;
    const x = ship0(room).x;
    await sleep(300);
    expect(room.world!.time).toBe(time);
    expect(ship0(room).x).toBe(x);
  });

  it("ignores a pause from a player without a seat", async () => {
    const { room, watcher } = await started();
    watcher.send(ClientMessage.Pause);
    await sleep(150);
    expect(room.state.phase).toBe(Phase.Running);
  });

  it("ignores input while paused", async () => {
    const { room, pilot } = await started();
    pilot.send(ClientMessage.Pause);
    await waitFor(() => room.state.phase === Phase.Paused);
    pilot.send(ClientMessage.Input, steer(1, 0, true));
    await sleep(200);
    expect(ship0(room).boosting).toBe(false);
  });

  it("lets only the host resume, with a countdown, carrying on where it stopped", async () => {
    const { room, pilot, gunner } = await started();
    await sleep(300);
    gunner.send(ClientMessage.Pause);
    await waitFor(() => room.state.phase === Phase.Paused);
    const time = room.world!.time;

    gunner.send(ClientMessage.Resume);
    await sleep(150);
    expect(room.state.phase).toBe(Phase.Paused);

    room.countdownSeconds = 0.3;
    pilot.send(ClientMessage.Resume);
    await waitFor(() => room.state.phase === Phase.Countdown);
    expect(room.world!.time).toBe(time);
    await waitFor(() => room.state.phase === Phase.Running);
    await waitFor(() => room.world!.time > time);
    expect(room.world!.time).toBeLessThan(time + 1);
  });

  it("keeps seats locked while paused", async () => {
    const { room, pilot } = await started();
    pilot.send(ClientMessage.Pause);
    await waitFor(() => room.state.phase === Phase.Paused);
    const rejected = pilot.waitForMessage(ServerMessage.Rejected);
    pilot.send(ClientMessage.TakeSeat, { crew: 1, role: "pilot" });
    expect(await rejected).toEqual({ reason: RejectReason.SeatLocked });
  });
});

describe("ending the match early", () => {
  it("lets the host end the match now, with the current score as the result", async () => {
    const { room, pilot } = await started();
    const world = room.world!;
    room.world = { ...world, ships: world.ships.map((s, i) => ({ ...s, sinkings: i === 1 ? 2 : 0 })) };
    pilot.send(ClientMessage.EndMatch);
    await waitFor(() => room.state.phase === Phase.Over);
    expect(room.state.winner).toBe(1);
    expect(room.state.timeLeft).toBeGreaterThan(TUNING.match.duration - 10);
    expect(room.world!.over).toBe(true);
  });

  it("works while paused", async () => {
    const { room, pilot, gunner } = await started();
    gunner.send(ClientMessage.Pause);
    await waitFor(() => room.state.phase === Phase.Paused);
    pilot.send(ClientMessage.EndMatch);
    await waitFor(() => room.state.phase === Phase.Over);
    expect(room.state.winner).toBe(-1);
  });

  it("ignores an end request from anyone but the host", async () => {
    const { room, gunner, watcher } = await started();
    gunner.send(ClientMessage.EndMatch);
    watcher.send(ClientMessage.EndMatch);
    await sleep(150);
    expect(room.state.phase).toBe(Phase.Running);
  });

  it("lets the host start a fresh match afterwards", async () => {
    const { room, pilot } = await started();
    pilot.send(ClientMessage.EndMatch);
    await waitFor(() => room.state.phase === Phase.Over);
    pilot.send(ClientMessage.Start);
    await waitFor(() => room.state.phase === Phase.Running);
    expect(room.world!.time).toBeLessThan(1);
  });
});

describe("packs on/off (Stage 1)", () => {
  it("is on by default and only the host can switch it, between matches", async () => {
    const { room, pilot, gunner } = await crewedRoom();
    expect(room.state.packsEnabled).toBe(true);
    gunner.send(ClientMessage.SetPacks, { on: false });
    await sleep(150);
    expect(room.state.packsEnabled).toBe(true);
    pilot.send(ClientMessage.SetPacks, { on: false });
    await waitFor(() => room.state.packsEnabled === false);
  });

  it("ignores a malformed toggle", async () => {
    const { room, pilot } = await crewedRoom();
    for (const bad of [null, "off", { on: "no" }, { on: false, extra: 1 }]) pilot.send(ClientMessage.SetPacks, bad);
    await sleep(150);
    expect(room.state.packsEnabled).toBe(true);
  });

  it("applies from the next match: a running match keeps its setting", async () => {
    const { room, pilot } = await started();
    expect(room.world!.packsOn).toBe(true);
    pilot.send(ClientMessage.SetPacks, { on: false });
    await sleep(150);
    expect(room.state.packsEnabled).toBe(true);
    expect(room.world!.packsOn).toBe(true);

    await endMatch(room);
    pilot.send(ClientMessage.SetPacks, { on: false });
    await waitFor(() => room.state.packsEnabled === false);
    pilot.send(ClientMessage.Start);
    await waitFor(() => room.state.phase === Phase.Running);
    expect(room.world!.packsOn).toBe(false);
  });

  it("gives every match a new seed", async () => {
    const { room, pilot } = await started();
    const first = room.world!.rng;
    await endMatch(room);
    pilot.send(ClientMessage.Start);
    await waitFor(() => room.state.phase === Phase.Running);
    expect(room.world!.rng).not.toBe(first);
  });

  it("shows packs and the held packs to clients", async () => {
    const { room } = await started();
    const world = room.world!;
    room.world = { ...world, packs: [{ id: 0, spot: 2, type: "torpedo", signalLeft: 0, lifeLeft: 20 }], nextPackId: 1, nextSignalIn: null, ships: [{ ...world.ships[0]!, pos: { x: 450, y: 300 } }, world.ships[1]!] };
    await waitFor(() => room.state.ships[0]!.gunnerPack === "torpedo");
    expect(room.state.packs.size).toBe(0);
  });
});

describe("mode and lives (Stage 2)", () => {
  /** Crew 1 seated (the host is its pilot) and the watcher seated as Crew 2's pilot. */
  const twoCrews = async () => {
    const crewed = await crewedRoom();
    crewed.room.countdownSeconds = 0.1;
    crewed.watcher.send(ClientMessage.TakeSeat, { crew: 1, role: "pilot" });
    await waitFor(() => crewed.room.state.players.get(crewed.watcher.sessionId)?.crew === 1);
    return crewed;
  };

  it(`is Sink Count with ${TUNING.lastAfloat.lives} lives by default; only the host changes them, between matches`, async () => {
    const { room, pilot, gunner } = await crewedRoom();
    expect([room.state.mode, room.state.lives]).toEqual(["sinkCount", TUNING.lastAfloat.lives]);
    gunner.send(ClientMessage.SetMode, { mode: "lastAfloat" });
    gunner.send(ClientMessage.SetLives, { lives: 4 });
    await sleep(150);
    expect([room.state.mode, room.state.lives]).toEqual(["sinkCount", TUNING.lastAfloat.lives]);
    pilot.send(ClientMessage.SetMode, { mode: "lastAfloat" });
    pilot.send(ClientMessage.SetLives, { lives: 4 });
    await waitFor(() => room.state.mode === "lastAfloat" && room.state.lives === 4);
  });

  it("ignores a malformed mode or lives", async () => {
    const { room, pilot } = await crewedRoom();
    for (const bad of [null, "lastAfloat", { mode: "fleet" }, { mode: "lastAfloat", extra: 1 }]) pilot.send(ClientMessage.SetMode, bad);
    for (const bad of [null, 3, { lives: 0 }, { lives: 6 }, { lives: 2.5 }, { lives: "3" }]) pilot.send(ClientMessage.SetLives, bad);
    await sleep(150);
    expect([room.state.mode, room.state.lives]).toEqual(["sinkCount", TUNING.lastAfloat.lives]);
  });

  it("refuses to start Last Afloat while a crew with a ship has no player", async () => {
    const { room, pilot } = await crewedRoom();
    pilot.send(ClientMessage.SetMode, { mode: "lastAfloat" });
    await waitFor(() => room.state.mode === "lastAfloat");
    const rejected = pilot.waitForMessage(ServerMessage.Rejected);
    pilot.send(ClientMessage.Start);
    expect(await rejected).toEqual({ reason: RejectReason.CrewsNeedPlayers });
    expect(room.state.phase).toBe(Phase.Waiting);
  });

  it("starts Last Afloat with every crew manned, with the lives chosen, and keeps it for the match", async () => {
    const { room, pilot } = await twoCrews();
    pilot.send(ClientMessage.SetMode, { mode: "lastAfloat" });
    pilot.send(ClientMessage.SetLives, { lives: 3 });
    await waitFor(() => room.state.lives === 3);
    pilot.send(ClientMessage.Start);
    await waitFor(() => room.state.phase === Phase.Running);
    expect(room.world!.mode).toBe("lastAfloat");
    expect(room.state.matchMode).toBe("lastAfloat");
    expect([...room.state.ships].map((s) => s.livesLeft)).toEqual([3, 3]);
    expect(room.state.timeLeft).toBeGreaterThan(TUNING.match.duration);

    // Changes wait for the next match.
    pilot.send(ClientMessage.SetMode, { mode: "sinkCount" });
    await sleep(150);
    expect(room.state.mode).toBe("lastAfloat");
  });

  it("ends when one ship is left in the match, with that crew as the winner", async () => {
    const { room, pilot, gunner } = await twoCrews();
    pilot.send(ClientMessage.SetMode, { mode: "lastAfloat" });
    pilot.send(ClientMessage.SetLives, { lives: 1 });
    await waitFor(() => room.state.lives === 1);
    pilot.send(ClientMessage.Start);
    await waitFor(() => room.state.phase === Phase.Running);
    const world = room.world!;
    room.world = { ...world, ships: [{ ...world.ships[0]!, pos: { x: 400, y: 200 }, heading: 0, turret: 0 }, { ...world.ships[1]!, pos: { x: 600, y: 200 }, health: 1 }] };
    gunner.send(ClientMessage.Input, gun(1, 0, true));
    await waitFor(() => room.state.phase === Phase.Over);
    expect(room.state.winner).toBe(0);
    expect(room.state.ships[1]!).toMatchObject({ out: true, sunkCause: "shot", sunkBy: 0 });
  });

  it("Sink Count still starts with one crew, as before", async () => {
    const { room } = await started();
    expect(room.world!.mode).toBe("sinkCount");
    expect(room.state.ships[0]!.livesLeft).toBe(-1);
  });
});

describe("island layouts (Stage 2)", () => {
  it("is One Island by default; only the host changes it, between matches; malformed is ignored", async () => {
    const { room, pilot, gunner } = await crewedRoom();
    expect(room.state.layout).toBe("oneIsland");
    gunner.send(ClientMessage.SetLayout, { layout: "slalom" });
    for (const bad of [null, "slalom", { layout: "atlantis" }, { layout: "slalom", extra: 1 }]) pilot.send(ClientMessage.SetLayout, bad);
    await sleep(150);
    expect(room.state.layout).toBe("oneIsland");
    pilot.send(ClientMessage.SetLayout, { layout: "slalom" });
    await waitFor(() => room.state.layout === "slalom");
  });

  it("starts the match on the chosen layout and tells clients which one", async () => {
    const { room, pilot } = await crewedRoom();
    room.countdownSeconds = 0.1;
    pilot.send(ClientMessage.SetLayout, { layout: "wall" });
    await waitFor(() => room.state.layout === "wall");
    pilot.send(ClientMessage.Start);
    await waitFor(() => room.state.phase === Phase.Running);
    expect(room.world!.layout).toBe("wall");
    expect(room.state.matchLayout).toBe("wall");
    pilot.send(ClientMessage.SetLayout, { layout: "ring" });
    await sleep(150);
    expect(room.state.layout).toBe("wall");
  });

  it("Random never picks the previous match's layout, even with the same seed", async () => {
    const { room, pilot } = await crewedRoom();
    room.countdownSeconds = 0.1;
    room.seedForMatch = () => 42;
    pilot.send(ClientMessage.SetLayout, { layout: "random" });
    await waitFor(() => room.state.layout === "random");
    const picked: string[] = [];
    for (let i = 0; i < 3; i++) {
      pilot.send(ClientMessage.Start);
      await waitFor(() => room.state.phase === Phase.Running);
      picked.push(room.state.matchLayout);
      expect(room.world!.layout).toBe(room.state.matchLayout);
      pilot.send(ClientMessage.EndMatch);
      await waitFor(() => room.state.phase === Phase.Over);
    }
    expect(picked[1]).not.toBe(picked[0]);
    expect(picked[2]).not.toBe(picked[1]);
  });
});

describe("hazards and reefs (Stage 2)", () => {
  it("hazards on and reefs All by default; only the host changes them, between matches; malformed is ignored", async () => {
    const { room, pilot, gunner } = await crewedRoom();
    expect([room.state.hazardsEnabled, room.state.reefs]).toEqual([true, "all"]);
    gunner.send(ClientMessage.SetHazards, { on: false });
    gunner.send(ClientMessage.SetReefs, { reefs: "few" });
    for (const bad of [null, { on: "no" }]) pilot.send(ClientMessage.SetHazards, bad);
    for (const bad of [null, { reefs: "lots" }]) pilot.send(ClientMessage.SetReefs, bad);
    await sleep(150);
    expect([room.state.hazardsEnabled, room.state.reefs]).toEqual([true, "all"]);
    pilot.send(ClientMessage.SetReefs, { reefs: "few" });
    pilot.send(ClientMessage.SetHazards, { on: false });
    await waitFor(() => room.state.reefs === "few" && !room.state.hazardsEnabled);
  });

  it("starts the match with the reefs chosen, and none with hazards off", async () => {
    const { room, pilot } = await crewedRoom();
    room.countdownSeconds = 0.1;
    pilot.send(ClientMessage.SetReefs, { reefs: "few" });
    await waitFor(() => room.state.reefs === "few");
    pilot.send(ClientMessage.Start);
    await waitFor(() => room.state.phase === Phase.Running);
    expect(room.world!.hazardsOn).toBe(true);
    expect(room.world!.reefs).toHaveLength(2);
    expect(room.state.matchReefs).toBe("few");
    pilot.send(ClientMessage.SetHazards, { on: false });
    await sleep(150);
    expect(room.state.hazardsEnabled).toBe(true);

    pilot.send(ClientMessage.EndMatch);
    await waitFor(() => room.state.phase === Phase.Over);
    pilot.send(ClientMessage.SetHazards, { on: false });
    await waitFor(() => !room.state.hazardsEnabled);
    pilot.send(ClientMessage.Start);
    await waitFor(() => room.state.phase === Phase.Running);
    expect(room.world!.reefs).toEqual([]);
    expect(room.state.matchReefs).toBe("none");
  });
});

describe("mines (Stage 1)", () => {
  /** Puts a mine in Crew 1's slot, in open water facing east. */
  const loadMine = (room: CrewRoom) => {
    const world = room.world!;
    room.world = { ...world, nextSignalIn: null, ships: [{ ...world.ships[0]!, pos: { x: 400, y: 300 }, heading: 0, pilotPack: "mine" }, world.ships[1]!] };
  };

  it("the pilot drops a loaded mine with the Pack button", async () => {
    const { room, pilot } = await started();
    loadMine(room);
    pilot.send(ClientMessage.Input, { steer: { x: 0, y: 0 }, boost: false, pack: true });
    await waitFor(() => room.state.mines.size === 1);
    expect(room.state.ships[0]!.pilotPack).toBe("");
    expect(room.state.mines.values().next().value?.armed).toBe(false);
  });

  it("ignores the gunner's Pack button for a mine", async () => {
    const { room, gunner } = await started();
    loadMine(room);
    gunner.send(ClientMessage.Input, { aim: { x: 1, y: 0 }, fire: false, shield: false, pack: true });
    await sleep(300);
    expect(room.state.mines.size).toBe(0);
    expect(room.state.ships[0]!.pilotPack).toBe("mine");
  });
});

describe("Pack button presses aren't lost (Stage 1)", () => {
  it("uses a press even if the release arrives before the next tick", async () => {
    const { room, pilot } = await started();
    const world = room.world!;
    room.world = { ...world, nextSignalIn: null, ships: [{ ...world.ships[0]!, pos: { x: 400, y: 300 }, heading: 0, pilotPack: "mine" }, world.ships[1]!] };
    pilot.send(ClientMessage.Input, { steer: { x: 0, y: 0 }, boost: false, pack: true });
    pilot.send(ClientMessage.Input, { steer: { x: 0, y: 0 }, boost: false, pack: false });
    await waitFor(() => room.state.mines.size === 1);
  });
});

describe("torpedoes (Stage 1)", () => {
  const loadTorpedo = (room: CrewRoom) => {
    const world = room.world!;
    room.world = { ...world, nextSignalIn: null, ships: [{ ...world.ships[0]!, pos: { x: 300, y: 200 }, heading: 0, gunnerPack: "torpedo" }, world.ships[1]!] };
  };

  it("the gunner fires a loaded torpedo with the Pack button", async () => {
    const { room, gunner } = await started();
    loadTorpedo(room);
    gunner.send(ClientMessage.Input, { aim: { x: 0, y: 1 }, fire: false, shield: false, pack: true });
    await waitFor(() => room.state.torpedoes.size === 1);
    expect(room.state.ships[0]!.gunnerPack).toBe("");
  });

  it("ignores the pilot's Pack button for a torpedo", async () => {
    const { room, pilot } = await started();
    loadTorpedo(room);
    pilot.send(ClientMessage.Input, { steer: { x: 0, y: 0 }, boost: false, pack: true });
    await sleep(300);
    expect(room.state.torpedoes.size).toBe(0);
    expect(room.state.ships[0]!.gunnerPack).toBe("torpedo");
  });
});

describe("EMP (Stage 1)", () => {
  it("the gunner fires a loaded EMP; the enemy in range is disabled", async () => {
    const { room, gunner } = await started();
    const world = room.world!;
    room.world = {
      ...world,
      nextSignalIn: null,
      ships: [{ ...world.ships[0]!, pos: { x: 400, y: 300 }, gunnerPack: "emp" }, { ...world.ships[1]!, pos: { x: 550, y: 300 } }],
    };
    gunner.send(ClientMessage.Input, { aim: { x: 1, y: 0 }, fire: false, shield: false, pack: true });
    await waitFor(() => room.state.ships[1]!.disabled > 0);
    expect(room.state.ships[0]!.gunnerPack).toBe("");
    expect(room.state.ships[0]!.empsFired).toBe(1);
  });
});
