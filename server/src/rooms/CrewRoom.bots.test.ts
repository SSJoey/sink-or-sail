import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import type { Room as ClientRoom } from "@colyseus/sdk";
import { ClientMessage, MAX_PLAYERS, Phase, ROOM_NAME, RejectReason, ServerMessage, TUNING, wrapAngle } from "@sink-or-sail/shared";
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
/** The room's bots, as [crew, role]. */
const bots = (room: CrewRoom) => [...room.state.players.values()].filter((p) => p.bot).map((p) => [p.crew, p.role]);

/** A host alone in Crew 1 (as pilot, or gunner if asked) who plays with a bot. */
async function soloWithBot(role: "pilot" | "gunner" = "pilot") {
  const host = await colyseus.sdk.create(ROOM_NAME, { name: "Ana" });
  const room = colyseus.getRoomById<CrewRoom>(host.roomId) as CrewRoom;
  room.countdownSeconds = 0.1;
  if (role === "gunner") {
    host.send(ClientMessage.TakeSeat, { crew: 0, role: "gunner" });
    await waitFor(() => playerOf(room, host)?.role === "gunner");
  }
  host.send(ClientMessage.PlayWithBot);
  await waitFor(() => bots(room).length === 1);
  return { host, room, code: host.roomId };
}

/** Ana (the host) in Crew 1 with a bot in the other role, and Ben alone in Crew 2 as its pilot. */
async function botAndRival(role: "pilot" | "gunner") {
  const host = await colyseus.sdk.create(ROOM_NAME, { name: "Ana" });
  const room = colyseus.getRoomById<CrewRoom>(host.roomId) as CrewRoom;
  room.countdownSeconds = 0.1;
  const ben = await join(host.roomId, "Ben");
  await waitFor(() => playerOf(room, ben)?.crew === 0);
  ben.send(ClientMessage.LeaveCrew);
  await waitFor(() => playerOf(room, ben)?.crew === 1);
  ben.send(ClientMessage.TakeSeat, { crew: 1, role: "pilot" });
  host.send(ClientMessage.TakeSeat, { crew: 0, role });
  await waitFor(() => playerOf(room, host)?.role === role && playerOf(room, ben)?.role === "pilot");
  host.send(ClientMessage.PlayWithBot);
  await waitFor(() => bots(room).length === 1);
  return { host, ben, room, code: host.roomId };
}

/** Moves the match clock to just before time-up and waits for the end. */
async function endMatch(room: CrewRoom) {
  room.world = { ...room.world!, time: TUNING.match.duration - 0.1 };
  await waitFor(() => room.state.phase === Phase.Over);
}

describe("Play with a bot", () => {
  it("a bot named Bot takes the free role of a player who is alone; it's always ready", async () => {
    const { room } = await soloWithBot("gunner");
    const bot = [...room.state.players.values()].find((p) => p.bot)!;
    expect(bot).toMatchObject({ name: "Bot", crew: 0, role: "pilot", ready: true, connected: true });
  });

  it("isn't for a player who has a partner", async () => {
    const host = await colyseus.sdk.create(ROOM_NAME, { name: "Ana" });
    const room = colyseus.getRoomById<CrewRoom>(host.roomId) as CrewRoom;
    await join(host.roomId, "Ben");
    const rejected = host.waitForMessage(ServerMessage.Rejected);
    host.send(ClientMessage.PlayWithBot);
    expect(await rejected).toEqual({ reason: RejectReason.AlreadyPaired });
    expect(bots(room)).toEqual([]);
  });

  it("Remove bot: the bot leaves and the crew waits for a partner again (the next joiner pairs in)", async () => {
    const { host, room, code } = await soloWithBot();
    host.send(ClientMessage.RemoveBot);
    await waitFor(() => bots(room).length === 0);
    const ben = await join(code, "Ben");
    await waitFor(() => playerOf(room, ben)?.crew === 0);
    expect(playerOf(room, ben)?.role).toBe("gunner");
  });

  it("a player who joins between matches takes the bot's place", async () => {
    const { host, room, code } = await soloWithBot();
    const ben = await join(code, "Ben");
    await waitFor(() => bots(room).length === 0);
    expect([playerOf(room, host)?.crew, playerOf(room, ben)?.crew, playerOf(room, ben)?.role]).toEqual([0, 0, "gunner"]);
  });

  it("goes when its player leaves", async () => {
    const { host, room, code } = await soloWithBot();
    const ben = await join(code, "Ben");
    await waitFor(() => playerOf(room, ben)?.crew === 0);
    ben.send(ClientMessage.LeaveCrew);
    await waitFor(() => playerOf(room, ben)?.crew === 1);
    ben.send(ClientMessage.PlayWithBot);
    await waitFor(() => bots(room).length === 1);
    await ben.leave();
    await waitFor(() => bots(room).length === 0);
    expect(playerOf(room, host)?.crew).toBe(0);
  });

  it("bots don't count toward the 6 players", async () => {
    const { room, code } = await soloWithBot();
    const others = [];
    for (let i = 1; i < MAX_PLAYERS; i++) others.push(await join(code, `P${i}`));
    expect([...room.state.players.values()].filter((p) => !p.bot)).toHaveLength(MAX_PLAYERS);
  });
});

describe("a bot during a match", () => {
  it("a bot gunner aims and fires at the other ship", async () => {
    const { host, room, code } = await soloWithBot();
    await join(code, "Ben");
    await waitFor(() => bots(room).length === 0);
    // Crew 1: Ana and Ben. Crew 2: Cat, who plays with a bot gunner.
    const cat = await join(code, "Cat");
    await waitFor(() => playerOf(room, cat)?.crew === 1);
    cat.send(ClientMessage.PlayWithBot);
    await waitFor(() => bots(room).length === 1);
    host.send(ClientMessage.Start);
    await waitFor(() => room.state.phase === Phase.Running);
    // Bring Crew 2's ship within range of Crew 1's gun.
    const world = room.world!;
    room.world = { ...world, ships: world.ships.map((s) => (s.id === 0 ? { ...s, pos: { x: 400, y: 200 } } : s.id === 1 ? { ...s, pos: { x: 750, y: 200 } } : s)) };
    await waitFor(() => room.world!.shots.some((shot) => shot.owner === 1), 3000);
    expect(Math.abs(wrapAngle(room.world!.ships[1]!.turret - Math.PI))).toBeLessThan(0.3);
  });

  it("a bot pilot sails the ship", async () => {
    const { host, room } = await botAndRival("gunner");
    host.send(ClientMessage.Start);
    await waitFor(() => room.state.phase === Phase.Running);
    const start = room.world!.ships[0]!.pos;
    await waitFor(() => Math.hypot(room.world!.ships[0]!.pos.x - start.x, room.world!.ships[0]!.pos.y - start.y) > 40, 3000);
  });

  it("is named Bot in the match log", async () => {
    const { host, room } = await botAndRival("gunner");
    const sink = memorySink();
    room.logSinkFor = () => sink;
    host.send(ClientMessage.Start);
    await waitFor(() => room.state.phase === Phase.Running);
    await waitFor(() => sink.text().includes("\n"));
    const start = JSON.parse(sink.text().split("\n")[0]!);
    expect(start.crews[0]).toMatchObject({ pilot: "Bot", gunner: "Ana" });
  });

  it("a player who joins waits, then takes the bot's place at the next round", async () => {
    const { host, room, code } = await soloWithBot();
    const ben = await join(code, "Ben");
    await waitFor(() => playerOf(room, ben)?.crew === 0);
    ben.send(ClientMessage.LeaveCrew);
    await waitFor(() => playerOf(room, ben)?.crew === 1);
    host.send(ClientMessage.PlayWithBot);
    await waitFor(() => bots(room).length === 1);
    host.send(ClientMessage.Start);
    await waitFor(() => room.state.phase === Phase.Running);
    const cat = await join(code, "Cat");
    await waitFor(() => room.state.players.has(cat.sessionId));
    expect(playerOf(room, cat)?.crew).toBeUndefined();
    expect(bots(room)).toEqual([[0, "gunner"]]);
    await endMatch(room);
    await waitFor(() => playerOf(room, cat)?.crew === 0);
    expect(playerOf(room, cat)?.role).toBe("gunner");
    expect(bots(room)).toEqual([]);
  });

  it("a player waiting out a match can choose Play with a bot for the next round (and change their mind)", async () => {
    const host = await colyseus.sdk.create(ROOM_NAME, { name: "Ana" });
    const room = colyseus.getRoomById<CrewRoom>(host.roomId) as CrewRoom;
    room.countdownSeconds = 0.1;
    await join(host.roomId, "Ben");
    host.send(ClientMessage.Start);
    await waitFor(() => room.state.phase === Phase.Running);
    const cat = await join(host.roomId, "Cat");
    await waitFor(() => room.state.players.has(cat.sessionId));
    cat.send(ClientMessage.SetNextRole, { role: "gunner" });
    cat.send(ClientMessage.PlayWithBot);
    await waitFor(() => playerOf(room, cat)?.withBot === true);
    cat.send(ClientMessage.RemoveBot);
    await waitFor(() => playerOf(room, cat)?.withBot === false);
    cat.send(ClientMessage.PlayWithBot);
    await waitFor(() => playerOf(room, cat)?.withBot === true);
    await endMatch(room);
    await waitFor(() => playerOf(room, cat)?.crew === 1);
    expect(playerOf(room, cat)?.role).toBe("gunner");
    expect(bots(room)).toEqual([[1, "pilot"]]);
    expect(playerOf(room, cat)?.withBot).toBe(false);
  });

  it("Play with a bot and Remove bot are locked for a player in a crew during a match", async () => {
    const { host, room } = await soloWithBot();
    host.send(ClientMessage.Start);
    await waitFor(() => room.state.phase === Phase.Running);
    const rejected = host.waitForMessage(ServerMessage.Rejected);
    host.send(ClientMessage.RemoveBot);
    expect(await rejected).toEqual({ reason: RejectReason.SeatLocked });
    expect(bots(room)).toHaveLength(1);
  });
});
