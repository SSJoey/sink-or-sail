import { describe, expect, it } from "vitest";
import { JoinError, RejectReason } from "@sink-or-sail/shared";
import { joinErrorText, rejectedText } from "./messages.ts";

describe("joinErrorText", () => {
  it("explains each way a join can fail", () => {
    expect(joinErrorText(new Error(JoinError.InvalidName))).toBe("Enter a name of 1–12 characters.");
    expect(joinErrorText(new Error(JoinError.NameTaken))).toBe("That name is already in this room.");
    expect(joinErrorText(new Error('room "ZZZZ" not found'))).toBe("No room with that code.");
    expect(joinErrorText(new Error('room "KWPZ" is locked'))).toBe("That room is full.");
  });

  it("falls back to a general message", () => {
    expect(joinErrorText(new Error("socket hang up"))).toBe("Could not connect. Check the Wi-Fi and try again.");
    expect(joinErrorText("weird")).toBe("Could not connect. Check the Wi-Fi and try again.");
  });
});

describe("rejectedText", () => {
  it("explains seat rejections", () => {
    expect(rejectedText({ reason: RejectReason.SeatTaken })).toBe("That seat is taken.");
    expect(rejectedText({ reason: RejectReason.InvalidSeat })).toBe("That seat doesn't exist.");
    expect(rejectedText({ reason: RejectReason.SeatLocked })).toBe("Seats are locked during a match.");
    expect(rejectedText({ reason: RejectReason.CrewNotInMatch })).toBe("Crew 3 joins from the next match.");
    expect(rejectedText({ reason: RejectReason.CrewsNeedPlayers })).toBe("Every crew needs a player for Last Afloat.");
  });
});

describe("refused name changes (Stage 3)", () => {
  it("explains each", () => {
    expect(rejectedText({ reason: RejectReason.NameTaken })).toBe("That name is already in this room.");
    expect(rejectedText({ reason: RejectReason.InvalidName })).toBe("Enter a name of 1–12 characters.");
    expect(rejectedText({ reason: RejectReason.NameLocked })).toBe("Names can be changed between matches.");
  });
});

describe("refused crew moves (Stage 3)", () => {
  it("explains each", () => {
    expect(rejectedText({ reason: RejectReason.NoPartnerWaiting })).toBe("Nobody is waiting for a partner yet: the next player to join will be paired with you.");
    expect(rejectedText({ reason: RejectReason.AlreadyPaired })).toBe("You already have a partner.");
    expect(rejectedText({ reason: RejectReason.NoFreeCrew })).toBe("There are already 3 crews.");
    expect(rejectedText({ reason: RejectReason.AlreadyAlone })).toBe("You're already in a crew of your own.");
  });
});

describe("spectators (Stage 3)", () => {
  it("explains a full room or a full set of spectators", () => {
    expect(joinErrorText(new Error(JoinError.RoomFull))).toBe("That room is full.");
    expect(joinErrorText(new Error(JoinError.SpectatorsFull))).toBe("That room already has 4 watching.");
    expect(rejectedText({ reason: RejectReason.RoomFull })).toBe("The room already has 6 players: keep watching for now.");
    expect(rejectedText({ reason: RejectReason.NoBot })).toBe("Your crew has no bot.");
  });
});
