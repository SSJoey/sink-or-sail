import { describe, expect, it } from "vitest";
import { botShipCount, crewRows, myCrew, readyCount, type LobbyPlayer, shipTypeFacts } from "./crewList.ts";

const p = (id: string, name: string, crew: number | undefined, role: string | undefined, ready = false, connected = true): LobbyPlayer => ({ id, name, crew, role, ready, connected });

describe("the crews in the room (Stage 3)", () => {
  const players = [
    p("ana", "Ana", 0, "pilot", true), p("ben", "Ben", 0, "gunner", true),
    p("sam", "Sam", 1, "pilot"),
    p("kim", "Kim", 2, "gunner", false, false), p("lee", "Lee", 2, "pilot", true),
    p("new", "New", undefined, undefined),
  ];

  it("lists each crew in order with its colour, players (pilot first), and whether it's ready or needs someone", () => {
    expect(crewRows(players, "ana", "sam").map(({ crew, label, names, status }) => ({ crew, label, names, status }))).toEqual([
      { crew: 0, label: "● Crew 1", names: "Ana ★ & Ben", status: "Ready" },
      { crew: 1, label: "■ Crew 2", names: "Sam (you)", status: "Needs a gunner" },
      { crew: 2, label: "▲ Crew 3", names: "Lee & Kim (reconnecting)", status: "Not ready" },
    ]);
  });

  it("offers Join (with the free role) on a crew with one player that isn't yours", () => {
    expect(crewRows(players, "ana", "ana").map((r) => r.join)).toEqual([null, "gunner", null]);
    expect(crewRows(players, "ana", "sam").map((r) => r.join)).toEqual([null, null, null]);
    expect(crewRows(players, "ana", "new").map((r) => r.join)).toEqual([null, "gunner", null]);
  });

  it("counts crews whose players are all ready", () => {
    expect(readyCount(players)).toEqual({ ready: 1, crews: 3 });
  });
});

describe("your own crew (Stage 3)", () => {
  it("shows who holds each role, whether you are alone, and its colour", () => {
    const players = [p("ana", "Ana", 1, "gunner"), p("ben", "Ben", 1, "pilot"), p("sam", "Sam", 0, "pilot")];
    expect(myCrew(players, "ana")).toEqual({ crew: 1, label: "■ Crew 2", colour: "#B0407A", role: "gunner", pilot: "Ben", gunner: "Ana (you)", alone: false, withBot: false, shipType: "frigate", picker: false, crews: 2 });
    expect(myCrew(players, "sam")).toMatchObject({ crew: 0, pilot: "Sam (you)", gunner: null, alone: true });
  });

  it("says whether your partner is a bot (slice 9), for Remove bot", () => {
    const bot = { ...p("bot:1", "Bot", 0, "gunner", true), bot: true };
    expect(myCrew([p("ana", "Ana", 0, "pilot"), bot], "ana")).toMatchObject({ gunner: "Bot", alone: false, withBot: true });
    expect(myCrew([p("ana", "Ana", 0, "pilot"), p("ben", "Ben", 0, "gunner")], "ana")).toMatchObject({ withBot: false });
    expect(crewRows([p("ana", "Ana", 0, "pilot"), bot], "ana", "ana")[0]).toMatchObject({ names: "Ana ★ (you) & Bot", status: "Not ready", join: null });
  });

  it("shows a bot ship (slice 10) as one, always ready, and counts them", () => {
    const ship = [{ ...p("botship:0:pilot", "Bot", 1, "pilot", true), bot: true }, { ...p("botship:0:gunner", "Bot", 1, "gunner", true), bot: true }];
    const players = [p("ana", "Ana", 0, "pilot"), ...ship];
    expect(crewRows(players, "ana", "ana")[1]).toMatchObject({ names: "Bot & Bot (bot ship)", status: "Ready", join: null });
    expect(botShipCount(players)).toBe(1);
    expect(botShipCount([p("ana", "Ana", 0, "pilot"), { ...p("bot:1", "Bot", 0, "gunner", true), bot: true }])).toBe(0);
  });

  it("is null for a player without a crew (joined during a match)", () => {
    expect(myCrew([p("new", "New", undefined, undefined)], "new")).toBeNull();
  });
});

describe("ship types in the lobby (Stage 5)", () => {
  const p = (id: string, crew: number, role: string, extra: Partial<LobbyPlayer> = {}): LobbyPlayer =>
    ({ id, name: id, crew, role, ready: false, connected: true, ...extra });

  it("each crew row names its ship: the pilot's pick, or the gunner's with a bot pilot; a bot ship's is a Frigate", () => {
    const players = [
      p("Ana", 0, "pilot", { shipType: "cutter" }), p("Ben", 0, "gunner", { shipType: "ironclad" }),
      p("Bot1", 1, "pilot", { bot: true }), p("Cat", 1, "gunner", { shipType: "longGun" }),
      p("Bot2", 2, "pilot", { bot: true }), p("Bot3", 2, "gunner", { bot: true }),
    ];
    expect(crewRows(players, "Ana", "Ana").map((r) => r.ship)).toEqual(["Cutter", "Long gun", "Frigate"]);
  });

  it("your crew: its ship type, and whether you pick it", () => {
    const players = [p("Ana", 0, "pilot", { shipType: "gunboat" }), p("Ben", 0, "gunner")];
    expect(myCrew(players, "Ana")).toMatchObject({ shipType: "gunboat", picker: true });
    expect(myCrew(players, "Ben")).toMatchObject({ shipType: "gunboat", picker: false });
    const alone = [p("Ben", 0, "gunner", { shipType: "cutter" })];
    expect(myCrew(alone, "Ben")).toMatchObject({ shipType: "cutter", picker: true });
  });

  it("describes a type in one line", () => {
    expect(shipTypeFacts("cutter")).toBe("Health 75 · speed 175 · range 450 · fires every 0.3 s");
    expect(shipTypeFacts("longGun")).toBe("Health 85 · speed 145 · range 850 · fires every 0.7 s");
  });
});
