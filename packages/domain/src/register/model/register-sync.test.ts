import { describe, expect, it } from "vitest";
import { lastSuccessfulSyncOfRegister } from "./register-sync.js";

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
