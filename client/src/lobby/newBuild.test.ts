import { describe, expect, it, vi } from "vitest";
import { isNewBuild, mainScript, reloadIfNewBuild } from "./newBuild.ts";

const page = (src: string) => `<!doctype html><html><head><title>Sink or Sail</title>
<script type="module" crossorigin src="${src}"></script></head><body></body></html>`;

describe("mainScript", () => {
  it("finds the built page's main script", () => {
    expect(mainScript(page("/assets/index-Dl-18QML.js"))).toBe("/assets/index-Dl-18QML.js");
  });

  it("returns null when there is none", () => {
    expect(mainScript("<html><body>oops</body></html>")).toBeNull();
  });
});

describe("isNewBuild", () => {
  it("is true when the server's page loads a different script", () => {
    expect(isNewBuild("/assets/index-OLD.js", page("/assets/index-NEW.js"))).toBe(true);
  });

  it("is false for the same build, or when either side is unknown", () => {
    expect(isNewBuild("/assets/index-A.js", page("/assets/index-A.js"))).toBe(false);
    expect(isNewBuild(null, page("/assets/index-A.js"))).toBe(false);
    expect(isNewBuild("/assets/index-A.js", "<html></html>")).toBe(false);
  });
});

describe("reloadIfNewBuild", () => {
  it("reloads when the server has a newer build", async () => {
    const reload = vi.fn();
    expect(await reloadIfNewBuild(async () => page("/assets/index-NEW.js"), "/assets/index-OLD.js", reload)).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("does nothing for the same build", async () => {
    const reload = vi.fn();
    expect(await reloadIfNewBuild(async () => page("/assets/index-A.js"), "/assets/index-A.js", reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("does nothing if the check itself fails (e.g. Wi-Fi blip)", async () => {
    const reload = vi.fn();
    expect(await reloadIfNewBuild(async () => { throw new Error("offline"); }, "/assets/index-A.js", reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
