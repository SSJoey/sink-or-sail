import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import type { Room as ClientRoom } from "@colyseus/sdk";
import { ClientMessage, MAX_MESSAGES_PER_SECOND, Phase, ROOM_NAME, TUNING, type Crew, type Role } from "@sink-or-sail/shared";
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

async function started() {
  const crewed = await crewedRoom();
  crewed.pilot.send(ClientMessage.Start);
  await waitFor(() => crewed.room.state.phase === Phase.Running);
  return crewed;
}

const ship0 = (room: CrewRoom) => room.state.ships[0]!;

describe("starting the match", () => {
  it("waits until a seated player starts it", async () => {
    const { room, pilot } = await crewedRoom();
    await sleep(150);
    expect(room.state.phase).toBe(Phase.Waiting);
    expect(room.state.ships.length).toBe(0);

    pilot.send(ClientMessage.Start);
    await waitFor(() => room.state.phase === Phase.Running);
    expect(room.state.ships.length).toBe(2);
    expect(room.state.timeLeft).toBeLessThanOrEqual(TUNING.match.duration);
  });

  it("ignores a start from a player without a seat", async () => {
    const { room, watcher } = await crewedRoom();
    watcher.send(ClientMessage.Start);
    await sleep(150);
    expect(room.state.phase).toBe(Phase.Waiting);
  });

  it("ignores a start while a match is running", async () => {
    const { room, gunner } = await started();
    await sleep(300);
    const before = room.world!.time;
    gunner.send(ClientMessage.Start);
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

  it("can start a new match once the last one is over", async () => {
    const { room, pilot } = await started();
    room.world = { ...room.world!, time: TUNING.match.duration - 0.1 };
    await waitFor(() => room.state.phase === Phase.Over);
    pilot.send(ClientMessage.Start);
    await waitFor(() => room.state.phase === Phase.Running);
    expect(room.world!.time).toBeLessThan(1);
  });
});
