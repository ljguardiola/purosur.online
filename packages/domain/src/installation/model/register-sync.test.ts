import { describe, expect, it } from "vitest";
import { installationSyncedLastOf, lastSuccessfulSyncOfRegister } from "./register-sync.js";

const EARLIEST = new Date("2026-10-05T13:00:00.000Z");
const EARLIER = new Date("2026-10-05T14:00:00.000Z");
const LATEST = new Date("2026-10-05T15:00:00.000Z");

describe("lastSuccessfulSyncOfRegister", () => {
  it("answers the latest accepted push among every installation the register has had", () => {
    expect(
      lastSuccessfulSyncOfRegister([
        { lastAcceptedPushAt: EARLIER },
        { lastAcceptedPushAt: LATEST },
        { lastAcceptedPushAt: EARLIEST },
      ]),
    ).toEqual(LATEST);
  });

  it("answers the accepted push of the only installation that had one", () => {
    expect(
      lastSuccessfulSyncOfRegister([{ lastAcceptedPushAt: null }, { lastAcceptedPushAt: EARLIER }]),
    ).toEqual(EARLIER);
  });

  it("answers no sync for a register none of whose installations had a push accepted", () => {
    expect(lastSuccessfulSyncOfRegister([{ lastAcceptedPushAt: null }])).toBeNull();
  });

  it("answers no sync for a register that has had no installation", () => {
    expect(lastSuccessfulSyncOfRegister([])).toBeNull();
  });
});

describe("installationSyncedLastOf", () => {
  it("answers the installation whose accepted push is the latest", () => {
    const earlier = { lastAcceptedPushAt: EARLIER, name: "earlier" };
    const latest = { lastAcceptedPushAt: LATEST, name: "latest" };
    const earliest = { lastAcceptedPushAt: EARLIEST, name: "earliest" };

    expect(installationSyncedLastOf([earlier, latest, earliest])).toBe(latest);
  });

  it("skips an installation none of whose pushes was accepted", () => {
    const pushed = { lastAcceptedPushAt: EARLIER, name: "pushed" };

    expect(installationSyncedLastOf([{ lastAcceptedPushAt: null, name: "silent" }, pushed])).toBe(
      pushed,
    );
  });

  it("answers the first of the installations that synced at the same moment", () => {
    const first = { lastAcceptedPushAt: LATEST, name: "first" };
    const second = { lastAcceptedPushAt: LATEST, name: "second" };

    expect(installationSyncedLastOf([first, second])).toBe(first);
  });

  it("answers none when no installation had a push accepted, or there is none", () => {
    expect(installationSyncedLastOf([{ lastAcceptedPushAt: null }])).toBeNull();
    expect(installationSyncedLastOf([])).toBeNull();
  });
});
