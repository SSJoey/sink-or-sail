import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import type { Room as ClientRoom } from "@colyseus/sdk";
import { ClientMessage, Phase, ROOM_NAME, RejectReason, ServerMessage, TUNING } from "@sink-or-sail/shared";
import { server } from "../app.config.ts";
import { memorySink } from "../log/matchLog.ts";
import type { CrewRoom } from "./CrewRoom.ts";
import { waitFor } from "./testUtils.ts";

let colyseus: ColyseusTestServer;
beforeAll(async () => { colyseus = await boot(server); });
afterAll(async () => { await colyseus.shutdown(); });
beforeEach(async () => { await colyseus.cleanup(); });

const join = (code: string, name: string) => colyseus.sdk.joinById(code, { name });
const playerOf = (room: CrewRoom, client: ClientRoom) => room.state.players.get(client.sessionId);
const bots = (room: CrewRoom) => [...room.state.players.values()].filter((p) => p.bot);

/** Ana (host, Crew 1 pilot) and Ben (Crew 1 gunner). */
async function crew() {
  const ana = await colyseus.sdk.create(ROOM_NAME, { name: "Ana" });
  const room = colyseus.getRoomById<CrewRoom>(ana.roomId) as CrewRoom;
  room.countdownSeconds = 0.1;
  const ben = await join(ana.roomId, "Ben");
  await waitFor(() => playerOf(room, ben)?.crew === 0);
  return { ana, ben, room, code: ana.roomId };
}

async function endMatch(room: CrewRoom) {
  room.world = { ...room.world!, time: TUNING.match.duration - 0.1 };
  await waitFor(() => room.state.phase === Phase.Over);
}

describe("picking a ship type (Stage 5)", () => {
  it("everyone starts with a Frigate", async () => {
    const { ana, ben, room } = await crew();
    expect(playerOf(room, ana)?.shipType).toBe("frigate");
    expect(playerOf(room, ben)?.shipType).toBe("frigate");
  });

  it("the pilot picks; the crew sails it in the next match", async () => {
    const { ana, room } = await crew();
    ana.send(ClientMessage.SetShipType, { type: "cutter" });
    await waitFor(() => playerOf(room, ana)?.shipType === "cutter");
    ana.send(ClientMessage.Start);
    await waitFor(() => room.state.phase !== Phase.Waiting);
    expect(room.world!.ships.map((s) => s.type)).toEqual(["cutter", "frigate"]);
    expect(room.state.ships.map((s) => s.type)).toEqual(["cutter", "frigate"]);
    expect(room.world!.ships[0]!.health).toBe(75);
  });

  it("the gunner can't pick while the crew has a pilot", async () => {
    const { ben, room } = await crew();
    const rejected = ben.waitForMessage(ServerMessage.Rejected);
    ben.send(ClientMessage.SetShipType, { type: "ironclad" });
    expect(await rejected).toEqual({ reason: RejectReason.NotTypePicker });
    expect(playerOf(room, ben)?.shipType).toBe("frigate");
  });

  it("a bad type or message is ignored", async () => {
    const { ana, room } = await crew();
    ana.send(ClientMessage.SetShipType, { type: "raft" });
    ana.send(ClientMessage.SetShipType, { type: "cutter", extra: 1 });
    ana.send(ClientMessage.SetShipType, { type: "gunboat" });
    await waitFor(() => playerOf(room, ana)?.shipType === "gunboat");
  });

  it("is locked once the picker is Ready, and during a match", async () => {
    const { ana, room } = await crew();
    ana.send(ClientMessage.SetReady, { ready: true });
    await waitFor(() => playerOf(room, ana)?.ready === true);
    const locked = ana.waitForMessage(ServerMessage.Rejected);
    ana.send(ClientMessage.SetShipType, { type: "cutter" });
    expect(await locked).toEqual({ reason: RejectReason.ShipTypeLocked });
    ana.send(ClientMessage.Start);
    await waitFor(() => room.state.phase === Phase.Running);
    const during = ana.waitForMessage(ServerMessage.Rejected);
    ana.send(ClientMessage.SetShipType, { type: "cutter" });
    expect(await during).toEqual({ reason: RejectReason.ShipTypeLocked });
    expect(playerOf(room, ana)?.shipType).toBe("frigate");
  });

  it("the pick is kept for the next round", async () => {
    const { ana, room } = await crew();
    ana.send(ClientMessage.SetShipType, { type: "longGun" });
    await waitFor(() => playerOf(room, ana)?.shipType === "longGun");
    ana.send(ClientMessage.Start);
    await waitFor(() => room.state.phase === Phase.Running);
    await endMatch(room);
    ana.send(ClientMessage.Start);
    await waitFor(() => room.state.phase !== Phase.Over);
    expect(room.world!.ships[0]!.type).toBe("longGun");
  });

  it("with a bot pilot, the human gunner picks and the bot sails it", async () => {
    const ana = await colyseus.sdk.create(ROOM_NAME, { name: "Ana" });
    const room = colyseus.getRoomById<CrewRoom>(ana.roomId) as CrewRoom;
    room.countdownSeconds = 0.1;
    ana.send(ClientMessage.TakeSeat, { crew: 0, role: "gunner" });
    await waitFor(() => playerOf(room, ana)?.role === "gunner");
    ana.send(ClientMessage.PlayWithBot);
    await waitFor(() => bots(room).length === 1);
    ana.send(ClientMessage.SetShipType, { type: "ironclad" });
    await waitFor(() => playerOf(room, ana)?.shipType === "ironclad");
    ana.send(ClientMessage.Start);
    await waitFor(() => room.state.phase === Phase.Running);
    expect(room.world!.ships[0]!.type).toBe("ironclad");
  });

  it("bot ships are always Frigates", async () => {
    const ana = await colyseus.sdk.create(ROOM_NAME, { name: "Ana" });
    const room = colyseus.getRoomById<CrewRoom>(ana.roomId) as CrewRoom;
    room.countdownSeconds = 0.1;
    ana.send(ClientMessage.PlayWithBot);
    await waitFor(() => bots(room).length === 1);
    ana.send(ClientMessage.SetBotShips, { count: 1 });
    await waitFor(() => bots(room).length === 3);
    ana.send(ClientMessage.SetShipType, { type: "cutter" });
    await waitFor(() => playerOf(room, ana)?.shipType === "cutter");
    ana.send(ClientMessage.Start);
    await waitFor(() => room.state.phase === Phase.Running);
    expect(room.world!.ships.map((s) => s.type)).toEqual(["cutter", "frigate"]);
  });

  it("the results say each crew's type", async () => {
    const { ana, room } = await crew();
    ana.send(ClientMessage.SetShipType, { type: "gunboat" });
    await waitFor(() => playerOf(room, ana)?.shipType === "gunboat");
    ana.send(ClientMessage.Start);
    await waitFor(() => room.state.phase === Phase.Running);
    await endMatch(room);
    expect(room.state.results.map((r) => [r.ship, r.type])).toEqual(expect.arrayContaining([[0, "gunboat"], [1, "frigate"]]));
  });

  it("the match log records each crew's type and the type values", async () => {
    const { ana, room } = await crew();
    const sink = memorySink();
    room.logSinkFor = () => sink;
    ana.send(ClientMessage.SetShipType, { type: "cutter" });
    await waitFor(() => playerOf(room, ana)?.shipType === "cutter");
    ana.send(ClientMessage.Start);
    await waitFor(() => room.state.phase === Phase.Running);
    await waitFor(() => sink.text().includes("matchStart"));
    const start = sink.text().trim().split("\n").map((l) => JSON.parse(l)).find((l) => l.type === "matchStart");
    expect(start.crews.map((c: { type: string }) => c.type)).toEqual(["cutter", "frigate"]);
    expect(start.tuning.shipTypes.cutter.maxHealth).toBe(75);
  });
});

describe("the match's sea (Stage 5)", () => {
  it("2 ships: today's sea, in the room state and the match log", async () => {
    const { ana, room } = await crew();
    const sink = memorySink();
    room.logSinkFor = () => sink;
    ana.send(ClientMessage.Start);
    await waitFor(() => room.state.phase === Phase.Running);
    expect([room.state.seaWidth, room.state.seaHeight]).toEqual([1600, 900]);
    await waitFor(() => sink.text().includes("matchStart"));
    const start = sink.text().trim().split("\n").map((l) => JSON.parse(l)).find((l) => l.type === "matchStart");
    expect(start.sea).toEqual({ width: 1600, height: 900 });
  });

  it("SEA_SIZE gives the match a bigger sea (test servers only)", async () => {
    process.env.SEA_SIZE = "3200x1800";
    try {
      const { ana, room } = await crew();
      ana.send(ClientMessage.Start);
      await waitFor(() => room.state.phase === Phase.Running);
      expect(room.world!.sea).toEqual({ width: 3200, height: 1800 });
      expect([room.state.seaWidth, room.state.seaHeight]).toEqual([3200, 1800]);
    } finally {
      delete process.env.SEA_SIZE;
    }
  });
});
