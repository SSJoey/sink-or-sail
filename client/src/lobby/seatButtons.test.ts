import { describe, expect, it } from "vitest";
import { leaveSeatShown, seatAction } from "./seatButtons.ts";

describe("seatAction", () => {
  it("takes a free seat, between matches or (for a seatless player) during one", () => {
    expect(seatAction({ holder: "none", matchOn: false, iAmSeated: false })).toBe("take");
    expect(seatAction({ holder: "none", matchOn: false, iAmSeated: true })).toBe("take");
    expect(seatAction({ holder: "none", matchOn: true, iAmSeated: false })).toBe("take");
  });

  it("leaves your own seat when you tap it again, but not during a match", () => {
    expect(seatAction({ holder: "me", matchOn: false, iAmSeated: true })).toBe("leave");
    expect(seatAction({ holder: "me", matchOn: true, iAmSeated: true })).toBeNull();
  });

  it("does nothing for someone else's seat, or for a seated player during a match", () => {
    expect(seatAction({ holder: "other", matchOn: false, iAmSeated: false })).toBeNull();
    expect(seatAction({ holder: "none", matchOn: true, iAmSeated: true })).toBeNull();
  });
});

describe("leaveSeatShown", () => {
  it("shows the Leave seat button only while seated and no match is on", () => {
    expect(leaveSeatShown({ matchOn: false, iAmSeated: true })).toBe(true);
    expect(leaveSeatShown({ matchOn: true, iAmSeated: true })).toBe(false);
    expect(leaveSeatShown({ matchOn: false, iAmSeated: false })).toBe(false);
  });
});
