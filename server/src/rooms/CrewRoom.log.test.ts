import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import type { Room as ClientRoom } from "@colyseus/sdk";
import { ClientMessage, Phase, ROOM_NAME, TUNING, type Crew, type Role } from "@sink-or-sail/shared";
import { server } from "../app.config.ts";
import { memorySink, type LogSink } from "../log/matchLog.ts";
import type { CrewRoom } from "./CrewRoom.ts";
import { sleep, waitFor } from "./testUtils.ts";

let colyseus: ColyseusTestServer;
beforeAll(async () => { colyseus = await boot(server); });
afterAll(async () => { await colyseus.shutdown(); });
beforeEach(async () => { await colyseus.cleanup(); });

type Line = { t: number; type: string } & Record<string, unknown>;

/** A crewed room whose match log goes to memory; returns the file names asked for and the lines written. */
async function loggedRoom() {
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

  const files: string[] = [];
  const sink = memorySink();
  room.logSinkFor = (name: string) => { files.push(name); return sink; };
  room.countdownSeconds = 0.1;
  const lines = (): Line[] => sink.text().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const start = async () => {
    pilot.send(ClientMessage.Start);
    await waitFor(() => room.state.phase === Phase.Running);
  };
  return { room, pilot, gunner, watcher, files, lines, start };
}

const ofType = (lines: Line[], type: string) => lines.filter((l) => l.type === type);

describe("match event log", () => {
  it("opens no log until a match starts", async () => {
    const { files } = await loggedRoom();
    await sleep(200);
    expect(files).toEqual([]);
  });

  it("writes one file per match, named by date, time and room code", async () => {
    const { room, files, start } = await loggedRoom();
    await start();
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(new RegExp(`^\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2}_${room.roomId}\\.jsonl$`));
  });

  it("logs a whole match: start with crews and tuning, actions with names and roles, pause, early end", async () => {
    const { room, pilot, gunner, watcher, lines, start } = await loggedRoom();
    await start();
    pilot.send(ClientMessage.Input, { steer: { x: 0, y: -1 }, boost: true });
    gunner.send(ClientMessage.Input, { aim: { x: 1, y: 0 }, fire: true, shield: false });
    await sleep(1300);
    gunner.send(ClientMessage.Pause);
    await waitFor(() => room.state.phase === Phase.Paused);
    await watcher.leave();
    pilot.send(ClientMessage.Resume);
    await waitFor(() => room.state.phase === Phase.Running);
    pilot.send(ClientMessage.EndMatch);
    await waitFor(() => ofType(lines(), "matchEnd").length === 1, 3000);

    const log = lines();
    for (const line of log) {
      expect(Number.isInteger(line.t)).toBe(true);
      expect(typeof line.type).toBe("string");
    }
    expect(log[0]).toMatchObject({
      t: 0,
      type: "matchStart",
      room: room.roomId,
      crews: [{ ship: 0, pilot: "Pilot", gunner: "Gunner" }, { ship: 1, pilot: null, gunner: null }],
    });
    expect(log[0]!.tuning).toEqual(JSON.parse(JSON.stringify(TUNING)));
    expect(ofType(log, "shotFired")[0]).toMatchObject({ ship: 0, player: "Gunner", role: "gunner" });
    expect(ofType(log, "boostUsed")[0]).toMatchObject({ ship: 0, player: "Pilot", role: "pilot" });
    expect(ofType(log, "paused")[0]).toMatchObject({ player: "Gunner", role: "gunner" });
    expect(ofType(log, "playerLeft")[0]).toMatchObject({ player: "Watcher", ship: null });
    expect(ofType(log, "resumed")[0]).toMatchObject({ player: "Pilot" });
    expect(ofType(log, "endedEarly")[0]).toMatchObject({ player: "Pilot" });
    const end = log.at(-1)!;
    expect(end).toMatchObject({ type: "matchEnd", endedEarly: true, winner: null });
    expect((end.scores as { boostEnergy: number }[])[0]!.boostEnergy).toBeGreaterThan(0);
  });

  it("writes each ship's position about once a second of match time", async () => {
    const { pilot, lines, start } = await loggedRoom();
    await start();
    await sleep(2300);
    pilot.send(ClientMessage.EndMatch);
    await waitFor(() => ofType(lines(), "matchEnd").length === 1, 3000);
    const times = ofType(lines(), "position").filter((l) => l.ship === 0).map((l) => l.t);
    expect(times.slice(0, 3)).toEqual([0, 1000, 2000]);
    expect(ofType(lines(), "position")[0]).toMatchObject({ ship: 0, x: 150, y: 450, health: 100, energy: 100 });
  });

  it("logs a sinking with who did it, and the respawn", async () => {
    const { room, gunner, lines, start } = await loggedRoom();
    await start();
    const world = room.world!;
    room.world = {
      ...world,
      ships: [{ ...world.ships[0]!, pos: { x: 300, y: 200 } }, { ...world.ships[1]!, pos: { x: 450, y: 200 }, health: 20 }],
    };
    gunner.send(ClientMessage.Input, { aim: { x: 1, y: 0 }, fire: true, shield: false });
    await waitFor(() => ofType(lines(), "sunk").length === 1, 3000);
    expect(ofType(lines(), "hit")[0]).toMatchObject({ ship: 0, player: "Gunner", target: 1, damage: 20 });
    expect(ofType(lines(), "sunk")[0]).toMatchObject({ ship: 1, by: 0, crew: { pilot: null, gunner: null } });
    await waitFor(() => ofType(lines(), "respawn").length === 1, 6000);
  }, 10_000);

  it("ends with the result at time-up", async () => {
    const { room, lines, start } = await loggedRoom();
    await start();
    room.world = { ...room.world!, time: TUNING.match.duration - 0.1 };
    await waitFor(() => ofType(lines(), "matchEnd").length === 1, 3000);
    expect(lines().at(-1)).toMatchObject({ type: "matchEnd", endedEarly: false, t: TUNING.match.duration * 1000 });
  });

  it("logs players joining and reconnecting mid-match, and seats taken", async () => {
    const { room, gunner, lines, start } = await loggedRoom();
    await start();
    const late = await colyseus.sdk.joinById(room.roomId, { name: "Late" });
    late.send(ClientMessage.TakeSeat, { crew: 1, role: "pilot" });
    await waitFor(() => room.state.players.get(late.sessionId)?.role === "pilot");
    const token = gunner.reconnectionToken;
    gunner.reconnection.enabled = false;
    gunner.connection.close(4010);
    await waitFor(() => room.state.players.get(gunner.sessionId)?.connected === false);
    await colyseus.sdk.reconnect(token);
    await waitFor(() => room.state.players.get(gunner.sessionId)?.connected === true);
    await sleep(1100);

    const log = lines();
    expect(ofType(log, "playerJoined")[0]).toMatchObject({ player: "Late", ship: null, role: null });
    expect(ofType(log, "seatTaken")[0]).toMatchObject({ player: "Late", ship: 1, role: "pilot" });
    expect(ofType(log, "playerDropped")[0]).toMatchObject({ player: "Gunner", ship: 0, role: "gunner" });
    expect(ofType(log, "playerReconnected")[0]).toMatchObject({ player: "Gunner", ship: 0, role: "gunner" });
  });

  it("keeps the match running if the log can't be written", async () => {
    const { room, start } = await loggedRoom();
    const broken: LogSink = { append: async () => { throw new Error("disk full"); } };
    room.logSinkFor = () => broken;
    room.logErrors = () => {};
    await start();
    const t = room.world!.time;
    await sleep(1300);
    expect(room.state.phase).toBe(Phase.Running);
    expect(room.world!.time).toBeGreaterThan(t + 1);
  });
});
