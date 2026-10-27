import { describe, expect, it } from "vitest";
import { crewRows, myCrew, readyCount, type LobbyPlayer } from "./crewList.ts";

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
    expect(myCrew(players, "ana")).toEqual({ crew: 1, label: "■ Crew 2", colour: "#E8559A", role: "gunner", pilot: "Ben", gunner: "Ana (you)", alone: false, crews: 2 });
    expect(myCrew(players, "sam")).toMatchObject({ crew: 0, pilot: "Sam (you)", gunner: null, alone: true });
  });

  it("is null for a player without a crew (joined during a match)", () => {
    expect(myCrew([p("new", "New", undefined, undefined)], "new")).toBeNull();
  });
});
