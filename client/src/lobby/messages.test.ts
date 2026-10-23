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
  });
});
