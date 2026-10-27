import { describe, expect, it } from "vitest";
import { codeFromSearch, joinBase, joinLink } from "./joinLink.ts";

describe("the QR code's join link (Stage 3)", () => {
  it("is the game's address with the room code", () => {
    expect(joinLink("http://192.168.1.11:2567", "KQXA")).toBe("http://192.168.1.11:2567/?code=KQXA");
  });

  it("uses the page's own address when phones can reach it", () => {
    expect(joinBase({ protocol: "http:", hostname: "192.168.1.11", port: "2567" }, "")).toBe("http://192.168.1.11:2567");
    expect(joinBase({ protocol: "http:", hostname: "laptop.local", port: "" }, "10.0.0.9")).toBe("http://laptop.local");
  });

  it("on localhost uses the laptop's address from the server, else none (the page shows a hint instead)", () => {
    for (const hostname of ["localhost", "127.0.0.1", "127.1.2.3", "[::1]", "::1"]) {
      expect(joinBase({ protocol: "http:", hostname, port: "2567" }, "192.168.1.11")).toBe("http://192.168.1.11:2567");
      expect(joinBase({ protocol: "http:", hostname, port: "2567" }, "")).toBeNull();
    }
  });
});

describe("opening a join link", () => {
  it("reads the room code from the address, cleaned up", () => {
    expect(codeFromSearch("?code=kqxa")).toBe("KQXA");
    expect(codeFromSearch("?fps=20&code=ABCD")).toBe("ABCD");
  });

  it("ignores a missing or invalid code", () => {
    for (const search of ["", "?fps=20", "?code=", "?code=ABC", "?code=AB1D", "?code=ABCDE"]) expect(codeFromSearch(search)).toBeNull();
  });
});
