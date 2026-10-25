import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { matchMaker } from "@colyseus/core";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import type { Room as ClientRoom } from "@colyseus/sdk";
import {
  ClientMessage,
  JoinError,
  MAX_PLAYERS,
  RECONNECT_WINDOW_SECONDS,
  ROOM_NAME,
  RejectReason,
  ServerMessage,
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

  it("adds the creator as a player without a seat", async () => {
    const { client, room } = await createRoom("Host");
    expect(playerOf(room, client)?.toJSON()).toEqual({ name: "Host", connected: true });
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
    await join(code, "P2");
    await join(code, "P3");
    await join(code, "P4");
    await expect(join(code, "P5")).rejects.toThrow(/locked/);
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

describe("picking a seat", () => {
  it("gives a player a free seat", async () => {
    const { client, room } = await createRoom();
    client.send(ClientMessage.TakeSeat, { crew: 1, role: "gunner" });
    await waitFor(() => playerOf(room, client)?.role === "gunner");
    expect(playerOf(room, client)?.crew).toBe(1);
  });

  it("rejects a seat another player holds and tells them why", async () => {
    const { client: a, room, code } = await createRoom("A");
    const b = await join(code, "B");
    a.send(ClientMessage.TakeSeat, { crew: 0, role: "pilot" });
    await waitFor(() => playerOf(room, a)?.role === "pilot");

    const rejected = b.waitForMessage(ServerMessage.Rejected);
    b.send(ClientMessage.TakeSeat, { crew: 0, role: "pilot" });
    expect(await rejected).toEqual({ reason: RejectReason.SeatTaken });
    expect(playerOf(room, b)?.role).toBeUndefined();
  });

  it("lets a player switch seats, freeing the old one", async () => {
    const { client: a, room, code } = await createRoom("A");
    const b = await join(code, "B");
    a.send(ClientMessage.TakeSeat, { crew: 0, role: "pilot" });
    a.send(ClientMessage.TakeSeat, { crew: 1, role: "pilot" });
    await waitFor(() => playerOf(room, a)?.crew === 1);
    b.send(ClientMessage.TakeSeat, { crew: 0, role: "pilot" });
    await waitFor(() => playerOf(room, b)?.role === "pilot");
    expect(playerOf(room, b)?.crew).toBe(0);
  });

  it("lets a player leave their seat, so someone else can take it", async () => {
    const { client: a, room, code } = await createRoom("A");
    const b = await join(code, "B");
    a.send(ClientMessage.TakeSeat, { crew: 0, role: "pilot" });
    await waitFor(() => playerOf(room, a)?.role === "pilot");
    a.send(ClientMessage.LeaveSeat);
    await waitFor(() => playerOf(room, a)?.role === undefined);
    expect(playerOf(room, a)?.crew).toBeUndefined();
    b.send(ClientMessage.TakeSeat, { crew: 0, role: "pilot" });
    await waitFor(() => playerOf(room, b)?.role === "pilot");
  });

  it("keeps the host as host after leaving their seat", async () => {
    const { client, room } = await createRoom("Host");
    client.send(ClientMessage.TakeSeat, { crew: 0, role: "pilot" });
    await waitFor(() => playerOf(room, client)?.role === "pilot");
    client.send(ClientMessage.LeaveSeat);
    await waitFor(() => playerOf(room, client)?.role === undefined);
    expect(room.state.hostId).toBe(client.sessionId);
  });

  it("rejects a malformed seat", async () => {
    const { client, room } = await createRoom();
    const rejected = client.waitForMessage(ServerMessage.Rejected);
    client.send(ClientMessage.TakeSeat, { crew: 5, role: "captain" });
    expect(await rejected).toEqual({ reason: RejectReason.InvalidSeat });
    expect(playerOf(room, client)?.role).toBeUndefined();
  });
});

describe("leaving and reconnecting", () => {
  it("frees the seat and name at once when a player leaves on purpose", async () => {
    const { room, code } = await createRoom("Host");
    const sam = await join(code, "Sam");
    sam.send(ClientMessage.TakeSeat, { crew: 0, role: "pilot" });
    await waitFor(() => playerOf(room, sam)?.role === "pilot");

    await sam.leave();
    await waitFor(() => room.state.players.size === 1);
    const again = await join(code, "Sam");
    again.send(ClientMessage.TakeSeat, { crew: 0, role: "pilot" });
    await waitFor(() => playerOf(room, again)?.role === "pilot");
  });

  it(`holds a dropped player's seat for ${RECONNECT_WINDOW_SECONDS} s`, async () => {
    const { room, code } = await createRoom("Host");
    expect(room.reconnectSeconds).toBe(RECONNECT_WINDOW_SECONDS);
    const sam = await join(code, "Sam");
    sam.send(ClientMessage.TakeSeat, { crew: 0, role: "pilot" });
    await waitFor(() => playerOf(room, sam)?.role === "pilot");

    drop(sam);
    await waitFor(() => playerOf(room, sam)?.connected === false);
    expect(playerOf(room, sam)?.role).toBe("pilot");

    const other = await join(code, "Kim");
    const rejected = other.waitForMessage(ServerMessage.Rejected);
    other.send(ClientMessage.TakeSeat, { crew: 0, role: "pilot" });
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
    sam.send(ClientMessage.TakeSeat, { crew: 1, role: "gunner" });
    await waitFor(() => playerOf(room, sam)?.role === "gunner");
    const token = sam.reconnectionToken;

    drop(sam);
    await waitFor(() => playerOf(room, sam)?.connected === false);
    const back = await colyseus.sdk.reconnect(token);

    expect(back.sessionId).toBe(sam.sessionId);
    await waitFor(() => playerOf(room, back)?.connected === true);
    expect(playerOf(room, back)?.toJSON()).toEqual({ name: "Sam", crew: 1, role: "gunner", connected: true });
  });

  it("frees the seat once the reconnection window runs out", async () => {
    const { room, code } = await createRoom("Host");
    room.reconnectSeconds = 0.2;
    const sam = await join(code, "Sam");
    sam.send(ClientMessage.TakeSeat, { crew: 0, role: "gunner" });
    await waitFor(() => playerOf(room, sam)?.role === "gunner");

    drop(sam);
    await waitFor(() => room.state.players.size === 1);
    const kim = await join(code, "Kim");
    kim.send(ClientMessage.TakeSeat, { crew: 0, role: "gunner" });
    await waitFor(() => playerOf(room, kim)?.role === "gunner");
  });

  it("counts a dropped player toward the room limit while their seat is held", async () => {
    const { room, code } = await createRoom("P1");
    await join(code, "P2");
    await join(code, "P3");
    const p4 = await join(code, "P4");
    drop(p4);
    await waitFor(() => playerOf(room, p4)?.connected === false);
    await expect(join(code, "P5")).rejects.toThrow(/locked/);
  });
});
