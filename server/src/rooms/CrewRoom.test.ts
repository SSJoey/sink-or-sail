import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { matchMaker } from "@colyseus/core";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import type { Room as ClientRoom } from "@colyseus/sdk";
import {
  ClientMessage,
  JoinError,
  MAX_PLAYERS,
  MAX_SPECTATORS,
  RECONNECT_WINDOW_SECONDS,
  ROOM_NAME,
  RejectReason,
  ServerMessage,
  Phase,
  normaliseCode,
} from "@sink-or-sail/shared";
import { server } from "../app.config.ts";
import { CODES_KEY, type CrewRoom } from "./CrewRoom.ts";
import { waitFor } from "./testUtils.ts";

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

async function createRoom(name = "Host") {
  const client = await colyseus.sdk.create(ROOM_NAME, { name });
  const room = colyseus.getRoomById<CrewRoom>(client.roomId) as CrewRoom;
  return { client, room, code: client.roomId };
}

const join = (code: string, name: string) => colyseus.sdk.joinById(code, { name });

const playerOf = (room: CrewRoom, client: ClientRoom) => room.state.players.get(client.sessionId);

/** Ends the connection without consent, as a dropped phone would. */
function drop(client: ClientRoom) {
  client.reconnection.enabled = false;
  client.connection.close(4010);
}

describe("creating a room", () => {
  it("gives the room a 4-character code", async () => {
    const { code } = await createRoom();
    expect(normaliseCode(code)).toBe(code);
  });

  it("gives each open room a different code and registers it", async () => {
    const a = await createRoom();
    const b = await createRoom();
    expect(a.code).not.toBe(b.code);
    const codes = await matchMaker.presence.smembers(CODES_KEY);
    expect(codes).toEqual(expect.arrayContaining([a.code, b.code]));
  });

  it("puts the creator in a new crew of their own, as pilot (Stage 3)", async () => {
    const { client, room } = await createRoom("Host");
    expect(playerOf(room, client)?.toJSON()).toEqual({ name: "Host", crew: 0, role: "pilot", connected: true, ready: false, nextRole: "pilot", partner: "", spectator: false });
  });

  it("frees the code when the last player leaves and the room closes", async () => {
    const { client, code } = await createRoom();
    await client.leave();
    await expect.poll(() => matchMaker.presence.smembers(CODES_KEY)).not.toContain(code);
  });
});

describe("joining by code", () => {
  it("joins the room with that code", async () => {
    const { room, code } = await createRoom();
    const client = await join(code, "Sam");
    expect(client.roomId).toBe(code);
    await waitFor(() => room.state.players.size === 2);
    expect(playerOf(room, client)?.name).toBe("Sam");
  });

  it("rejects a code with no room", async () => {
    await createRoom();
    await expect(join("ZZZZ", "Sam")).rejects.toThrow(/not found/);
  });

  it(`rejects a player when ${MAX_PLAYERS} are already in`, async () => {
    const { code } = await createRoom("P1");
    for (let i = 2; i <= MAX_PLAYERS; i++) await join(code, `P${i}`);
    await expect(join(code, `P${MAX_PLAYERS + 1}`)).rejects.toThrow(JoinError.RoomFull);
  });

  it("trims the name", async () => {
    const { room, code } = await createRoom();
    const client = await join(code, "  Sam  ");
    expect(playerOf(room, client)?.name).toBe("Sam");
  });

  it("rejects a missing, blank or too-long name", async () => {
    const { code } = await createRoom();
    await expect(colyseus.sdk.joinById(code, {})).rejects.toThrow(JoinError.InvalidName);
    await expect(join(code, "   ")).rejects.toThrow(JoinError.InvalidName);
    await expect(join(code, "Abcdefghijklm")).rejects.toThrow(JoinError.InvalidName);
  });

  it("rejects a name already in the room, whatever its case", async () => {
    const { code } = await createRoom("Sam");
    await expect(join(code, "sAM")).rejects.toThrow(JoinError.NameTaken);
  });

  it("rejects a bad name when creating a room too", async () => {
    await expect(colyseus.sdk.create(ROOM_NAME, { name: "" })).rejects.toThrow(JoinError.InvalidName);
  });
});

describe("changing your name (Stage 3)", () => {
  it("changes it between matches, trimmed; everyone sees the new name", async () => {
    const { client, room } = await createRoom("Ana");
    client.send(ClientMessage.SetName, { name: "  Robin " });
    await waitFor(() => playerOf(room, client)?.name === "Robin");
  });

  it("lets a player change only the case of their own name", async () => {
    const { client, room } = await createRoom("ana");
    client.send(ClientMessage.SetName, { name: "Ana" });
    await waitFor(() => playerOf(room, client)?.name === "Ana");
  });

  it("rejects a name another player has, whatever its case, and says why", async () => {
    const { client: a, room, code } = await createRoom("Ana");
    const b = await join(code, "Ben");
    const rejected = b.waitForMessage(ServerMessage.Rejected);
    b.send(ClientMessage.SetName, { name: "ANA" });
    expect(await rejected).toEqual({ reason: RejectReason.NameTaken });
    expect(playerOf(room, b)?.name).toBe("Ben");
    expect(playerOf(room, a)?.name).toBe("Ana");
  });

  it("rejects a blank or too-long name", async () => {
    const { client, room } = await createRoom("Ana");
    for (const name of ["   ", "x".repeat(13), 7]) {
      const rejected = client.waitForMessage(ServerMessage.Rejected);
      client.send(ClientMessage.SetName, { name });
      expect(await rejected).toEqual({ reason: RejectReason.InvalidName });
    }
    expect(playerOf(room, client)?.name).toBe("Ana");
  });

  it("is locked from the countdown until the match is over", async () => {
    const { client, room } = await createRoom("Ana");
    for (const phase of [Phase.Countdown, Phase.Running, Phase.Paused]) {
      room.state.phase = phase;
      const rejected = client.waitForMessage(ServerMessage.Rejected);
      client.send(ClientMessage.SetName, { name: "Robin" });
      expect(await rejected).toEqual({ reason: RejectReason.NameLocked });
    }
    expect(playerOf(room, client)?.name).toBe("Ana");
    room.state.phase = Phase.Over;
    client.send(ClientMessage.SetName, { name: "Robin" });
    await waitFor(() => playerOf(room, client)?.name === "Robin");
  });
});

describe("the join address for the QR code (Stage 3)", () => {
  it("is the JOIN_ADDRESS setting, or empty without one", async () => {
    process.env.JOIN_ADDRESS = "192.168.1.11";
    try {
      expect((await createRoom("A")).room.state.joinAddress).toBe("192.168.1.11");
    } finally {
      delete process.env.JOIN_ADDRESS;
    }
    expect((await createRoom("B")).room.state.joinAddress).toBe("");
  });
});

describe("spectators (Stage 3)", () => {
  const watch = (code: string, name: string) => colyseus.sdk.joinById(code, { name, watch: true });

  it("joins to watch: no crew, and not counted among the players", async () => {
    const { room, code } = await createRoom("P1");
    for (let i = 2; i <= MAX_PLAYERS; i++) await join(code, `P${i}`);
    const tv = await watch(code, "TV");
    expect(playerOf(room, tv)?.toJSON()).toMatchObject({ name: "TV", spectator: true });
    expect(playerOf(room, tv)?.crew).toBeUndefined();
  });

  it(`takes at most ${MAX_SPECTATORS} spectators`, async () => {
    const { code } = await createRoom("P1");
    for (let i = 1; i <= MAX_SPECTATORS; i++) await watch(code, `TV${i}`);
    await expect(watch(code, "TV9")).rejects.toThrow(JoinError.SpectatorsFull);
  });

  it("Watch instead: a player becomes a spectator between matches, freeing their seat (crews close up)", async () => {
    const { client: a, room, code } = await createRoom("A");
    const b = await join(code, "B");
    const c = await join(code, "C");
    a.send(ClientMessage.Watch);
    await waitFor(() => playerOf(room, a)?.spectator === true);
    expect(playerOf(room, a)?.crew).toBeUndefined();
    expect(playerOf(room, b)?.crew).toBe(0);
    expect(playerOf(room, c)?.crew).toBe(1);
    expect(room.state.hostId).toBe(a.sessionId);
  });

  it("Play next round: a spectator becomes a player, paired in like a joiner; refused with 6 players", async () => {
    const { room, code } = await createRoom("A");
    const tv = await watch(code, "TV");
    tv.send(ClientMessage.PlayNextRound);
    await waitFor(() => playerOf(room, tv)?.spectator === false);
    expect(playerOf(room, tv)?.crew).toBe(0);
    expect(playerOf(room, tv)?.role).toBe("gunner");
    tv.send(ClientMessage.Watch);
    await waitFor(() => playerOf(room, tv)?.spectator === true);
    for (let i = 2; i <= MAX_PLAYERS; i++) await join(code, `P${i}`);
    const full = tv.waitForMessage(ServerMessage.Rejected);
    tv.send(ClientMessage.PlayNextRound);
    expect(await full).toEqual({ reason: RejectReason.RoomFull });
  });

  it("a spectator can't take a seat (Play next round first)", async () => {
    const { room, code } = await createRoom("A");
    const tv = await watch(code, "TV");
    const rejected = tv.waitForMessage(ServerMessage.Rejected);
    tv.send(ClientMessage.TakeSeat, { crew: 0, role: "gunner" });
    expect(await rejected).toEqual({ reason: RejectReason.InvalidSeat });
    expect(playerOf(room, tv)?.crew).toBeUndefined();
  });

  it("Watch instead is locked during a match", async () => {
    const { client, room } = await createRoom("A");
    room.state.phase = Phase.Running;
    const rejected = client.waitForMessage(ServerMessage.Rejected);
    client.send(ClientMessage.Watch);
    expect(await rejected).toEqual({ reason: RejectReason.SeatLocked });
    expect(playerOf(room, client)?.spectator).toBe(false);
  });
});

describe("crews (Stage 3)", () => {
  const seatOf = (room: CrewRoom, client: ClientRoom) => ({ crew: playerOf(room, client)?.crew, role: playerOf(room, client)?.role });

  it("pairs each joiner into the crew waiting for a partner; with none waiting, a new crew of their own", async () => {
    const { client: a, room, code } = await createRoom("A");
    const b = await join(code, "B");
    const c = await join(code, "C");
    const d = await join(code, "D");
    expect([a, b, c, d].map((x) => seatOf(room, x))).toEqual([
      { crew: 0, role: "pilot" }, { crew: 0, role: "gunner" }, { crew: 1, role: "pilot" }, { crew: 1, role: "gunner" },
    ]);
  });

  it("lets a player switch to their crew's free role", async () => {
    const { client, room } = await createRoom();
    client.send(ClientMessage.TakeSeat, { crew: 0, role: "gunner" });
    await waitFor(() => playerOf(room, client)?.role === "gunner");
    expect(playerOf(room, client)?.crew).toBe(0);
  });

  it("rejects a seat another player holds and tells them why", async () => {
    const { client: a, room, code } = await createRoom("A");
    const b = await join(code, "B");
    const rejected = b.waitForMessage(ServerMessage.Rejected);
    b.send(ClientMessage.TakeSeat, { crew: 0, role: "pilot" });
    expect(await rejected).toEqual({ reason: RejectReason.SeatTaken });
    expect(seatOf(room, b)).toEqual({ crew: 0, role: "gunner" });
    expect(seatOf(room, a)).toEqual({ crew: 0, role: "pilot" });
  });

  it("Join: moves a player into another crew's free role", async () => {
    const { client: a, room, code } = await createRoom("A");
    const b = await join(code, "B");
    const c = await join(code, "C");
    b.send(ClientMessage.TakeSeat, { crew: 1, role: "gunner" });
    await waitFor(() => playerOf(room, b)?.crew === 1);
    expect([a, b, c].map((x) => seatOf(room, x))).toEqual([{ crew: 0, role: "pilot" }, { crew: 1, role: "gunner" }, { crew: 1, role: "pilot" }]);
  });

  it("closes up the crew numbers between matches, so the crews are 1, 2 (and 3)", async () => {
    const { room, code } = await createRoom("A");
    await join(code, "B");
    const c = await join(code, "C");
    const d = await join(code, "D");
    const e = await join(code, "E");
    expect(seatOf(room, e)).toEqual({ crew: 2, role: "pilot" });
    await c.leave();
    await d.leave();
    await waitFor(() => playerOf(room, e)?.crew === 1);
    expect(seatOf(room, e)).toEqual({ crew: 1, role: "pilot" });
  });

  it("Find me a partner: into the crew that has waited longest, in its free role", async () => {
    const { client: a, room, code } = await createRoom("A");
    const b = await join(code, "B");
    const c = await join(code, "C");
    b.send(ClientMessage.LeaveCrew);
    await waitFor(() => playerOf(room, b)?.crew === 2);
    // Crews now: 0 (A, waiting since B left), 1 (C, waiting longest), 2 (B). C's own crew doesn't count.
    a.send(ClientMessage.FindPartner);
    await waitFor(() => playerOf(room, a)?.role === "gunner");
    expect([a, b, c].map((x) => seatOf(room, x))).toEqual([{ crew: 0, role: "gunner" }, { crew: 1, role: "gunner" }, { crew: 0, role: "pilot" }]);
  });

  it("Find me a partner is refused with nobody waiting, or when you have a partner", async () => {
    const { client: a, code } = await createRoom("A");
    const alone = a.waitForMessage(ServerMessage.Rejected);
    a.send(ClientMessage.FindPartner);
    expect(await alone).toEqual({ reason: RejectReason.NoPartnerWaiting });
    await join(code, "B");
    const paired = a.waitForMessage(ServerMessage.Rejected);
    a.send(ClientMessage.FindPartner);
    expect(await paired).toEqual({ reason: RejectReason.AlreadyPaired });
  });

  it("Leave this crew: to a new crew of your own, keeping your role; refused when alone or with 3 crews", async () => {
    const { client: a, room, code } = await createRoom("A");
    const b = await join(code, "B");
    b.send(ClientMessage.LeaveCrew);
    await waitFor(() => playerOf(room, b)?.crew === 1);
    expect(seatOf(room, b)).toEqual({ crew: 1, role: "gunner" });
    const alone = a.waitForMessage(ServerMessage.Rejected);
    a.send(ClientMessage.LeaveCrew);
    expect(await alone).toEqual({ reason: RejectReason.AlreadyAlone });
    const c = await join(code, "C");
    await join(code, "D");
    expect(seatOf(room, c)).toEqual({ crew: 0, role: "gunner" });
    await join(code, "E");
    const full = c.waitForMessage(ServerMessage.Rejected);
    c.send(ClientMessage.LeaveCrew);
    expect(await full).toEqual({ reason: RejectReason.NoFreeCrew });
  });

  it("keeps the host as host after leaving their crew", async () => {
    const { client, room, code } = await createRoom("Host");
    await join(code, "B");
    client.send(ClientMessage.LeaveCrew);
    await waitFor(() => playerOf(room, client)?.crew === 1);
    expect(room.state.hostId).toBe(client.sessionId);
  });

  it("Ready: each player's own; moving crew or role clears it; a bad message is ignored", async () => {
    const { client: a, room, code } = await createRoom("A");
    const b = await join(code, "B");
    a.send(ClientMessage.SetReady, { ready: true });
    await waitFor(() => playerOf(room, a)?.ready === true);
    expect(playerOf(room, b)?.ready).toBe(false);
    a.send(ClientMessage.SetReady, { ready: "yes" });
    a.send(ClientMessage.LeaveCrew);
    await waitFor(() => playerOf(room, a)?.crew === 1);
    expect(playerOf(room, a)?.ready).toBe(false);
  });

  it("rejects a malformed seat", async () => {
    const { client, room } = await createRoom();
    const rejected = client.waitForMessage(ServerMessage.Rejected);
    client.send(ClientMessage.TakeSeat, { crew: 5, role: "captain" });
    expect(await rejected).toEqual({ reason: RejectReason.InvalidSeat });
    expect(playerOf(room, client)?.role).toBe("pilot");
  });
});

describe("leaving and reconnecting", () => {
  it("frees the seat and name at once when a player leaves on purpose", async () => {
    const { room, code } = await createRoom("Host");
    const sam = await join(code, "Sam");
    expect(playerOf(room, sam)?.role).toBe("gunner");

    await sam.leave();
    await waitFor(() => room.state.players.size === 1);
    // Sam's name and Crew 1's gunner seat are free again: a new Sam is paired into it.
    const again = await join(code, "Sam");
    await waitFor(() => playerOf(room, again)?.role === "gunner");
    expect(playerOf(room, again)?.crew).toBe(0);
  });

  it(`holds a dropped player's seat for ${RECONNECT_WINDOW_SECONDS} s`, async () => {
    const { room, code } = await createRoom("Host");
    expect(room.reconnectSeconds).toBe(RECONNECT_WINDOW_SECONDS);
    const sam = await join(code, "Sam");
    expect(playerOf(room, sam)?.role).toBe("gunner");

    drop(sam);
    await waitFor(() => playerOf(room, sam)?.connected === false);
    expect(playerOf(room, sam)?.role).toBe("gunner");

    // Kim isn't paired into Sam's held seat (a new crew instead), and can't take it.
    const other = await join(code, "Kim");
    expect(playerOf(room, other)?.crew).toBe(1);
    const rejected = other.waitForMessage(ServerMessage.Rejected);
    other.send(ClientMessage.TakeSeat, { crew: 0, role: "gunner" });
    expect(await rejected).toEqual({ reason: RejectReason.SeatTaken });
  });

  it("keeps a dropped player's name reserved", async () => {
    const { code, room } = await createRoom("Host");
    const sam = await join(code, "Sam");
    drop(sam);
    await waitFor(() => playerOf(room, sam)?.connected === false);
    await expect(join(code, "Sam")).rejects.toThrow(JoinError.NameTaken);
  });

  it("gives the seat back when the player reconnects", async () => {
    const { room, code } = await createRoom("Host");
    const sam = await join(code, "Sam");
    sam.send(ClientMessage.LeaveCrew);
    await waitFor(() => playerOf(room, sam)?.crew === 1);
    const token = sam.reconnectionToken;

    drop(sam);
    await waitFor(() => playerOf(room, sam)?.connected === false);
    const back = await colyseus.sdk.reconnect(token);

    expect(back.sessionId).toBe(sam.sessionId);
    await waitFor(() => playerOf(room, back)?.connected === true);
    expect(playerOf(room, back)?.toJSON()).toEqual({ name: "Sam", crew: 1, role: "gunner", connected: true, ready: false, nextRole: "pilot", partner: "", spectator: false });
  });

  it("frees the seat once the reconnection window runs out", async () => {
    const { room, code } = await createRoom("Host");
    room.reconnectSeconds = 0.2;
    const sam = await join(code, "Sam");
    expect(playerOf(room, sam)?.role).toBe("gunner");

    drop(sam);
    await waitFor(() => room.state.players.size === 1);
    const kim = await join(code, "Kim");
    await waitFor(() => playerOf(room, kim)?.role === "gunner");
    expect(playerOf(room, kim)?.crew).toBe(0);
  });

  it("counts a dropped player toward the room limit while their seat is held", async () => {
    const { room, code } = await createRoom("P1");
    for (let i = 2; i < MAX_PLAYERS; i++) await join(code, `P${i}`);
    const last = await join(code, `P${MAX_PLAYERS}`);
    drop(last);
    await waitFor(() => playerOf(room, last)?.connected === false);
    await expect(join(code, `P${MAX_PLAYERS + 1}`)).rejects.toThrow(JoinError.RoomFull);
  });
});
