import { describe, expect, it } from "vitest";
import {
  isHeldBackOnlyByRevokedInstallations,
  revokedInstallationsAwaitingConfirmation,
  streamReachesPastOnceConfirmed,
} from "./confirmed-stream-reach.js";
import type { InstallationStreamReach } from "./event-stream-reach.js";

const PERIOD = {
  from: new Date("2026-09-16T03:00:00.000Z"),
  until: new Date("2026-10-01T03:00:00.000Z"),
};

function installation(overrides: Partial<InstallationStreamReach> = {}): InstallationStreamReach {
  return {
    installationId: "installation-1",
    enrolledAt: new Date("2026-08-01T12:00:00.000Z"),
    revokedAt: null,
    latestOccurredAt: new Date("2026-10-02T12:00:00.000Z"),
    caughtUpAt: null,
    holdsUnappliedEvents: false,
    ...overrides,
  };
}

function revokedMidFortnight(
  overrides: Partial<InstallationStreamReach> = {},
): InstallationStreamReach {
  return installation({
    installationId: "revoked-1",
    revokedAt: new Date("2026-09-20T12:00:00.000Z"),
    latestOccurredAt: new Date("2026-09-19T12:00:00.000Z"),
    ...overrides,
  });
}

describe("revokedInstallationsAwaitingConfirmation", () => {
  it("lists a revoked installation active in the fortnight that never reached past the close", () => {
    const revoked = revokedMidFortnight();

    expect(revokedInstallationsAwaitingConfirmation([installation(), revoked], PERIOD, [])).toEqual(
      [revoked],
    );
  });

  it("lists an installation revoked after the close that never reached past it", () => {
    const revoked = revokedMidFortnight({
      revokedAt: new Date("2026-10-05T12:00:00.000Z"),
      latestOccurredAt: new Date("2026-09-28T12:00:00.000Z"),
    });

    expect(revokedInstallationsAwaitingConfirmation([revoked], PERIOD, [])).toEqual([revoked]);
  });

  it("leaves out an installation that is not revoked", () => {
    expect(
      revokedInstallationsAwaitingConfirmation(
        [installation({ latestOccurredAt: null })],
        PERIOD,
        [],
      ),
    ).toEqual([]);
  });

  it("leaves out a revoked installation that reached past the close", () => {
    expect(
      revokedInstallationsAwaitingConfirmation(
        [revokedMidFortnight({ latestOccurredAt: new Date("2026-10-02T12:00:00.000Z") })],
        PERIOD,
        [],
      ),
    ).toEqual([]);
  });

  it("leaves out a revoked installation that was revoked before the fortnight began", () => {
    expect(
      revokedInstallationsAwaitingConfirmation(
        [revokedMidFortnight({ revokedAt: PERIOD.from })],
        PERIOD,
        [],
      ),
    ).toEqual([]);
  });

  it("leaves out a revoked installation enrolled after the close", () => {
    expect(
      revokedInstallationsAwaitingConfirmation(
        [revokedMidFortnight({ enrolledAt: PERIOD.until })],
        PERIOD,
        [],
      ),
    ).toEqual([]);
  });

  it("leaves out a revoked installation that still holds events not yet applied", () => {
    expect(
      revokedInstallationsAwaitingConfirmation(
        [revokedMidFortnight({ holdsUnappliedEvents: true })],
        PERIOD,
        [],
      ),
    ).toEqual([]);
  });

  it("leaves out a revoked installation whose confirmation exists", () => {
    expect(
      revokedInstallationsAwaitingConfirmation([revokedMidFortnight()], PERIOD, ["revoked-1"]),
    ).toEqual([]);
  });

  it("keeps listing the revoked installations that are not the confirmed one", () => {
    const other = revokedMidFortnight({ installationId: "revoked-2" });

    expect(
      revokedInstallationsAwaitingConfirmation([revokedMidFortnight(), other], PERIOD, [
        "revoked-1",
      ]),
    ).toEqual([other]);
  });
});

describe("isHeldBackOnlyByRevokedInstallations", () => {
  it("holds when the only installation not reaching past the close is a revoked one", () => {
    expect(
      isHeldBackOnlyByRevokedInstallations([installation(), revokedMidFortnight()], PERIOD, []),
    ).toBe(true);
  });

  it("holds when every installation not reaching past the close is a revoked one", () => {
    expect(
      isHeldBackOnlyByRevokedInstallations(
        [revokedMidFortnight(), revokedMidFortnight({ installationId: "revoked-2" })],
        PERIOD,
        [],
      ),
    ).toBe(true);
  });

  it("fails when an installation still enrolled has not reached past the close either", () => {
    expect(
      isHeldBackOnlyByRevokedInstallations(
        [installation({ latestOccurredAt: null }), revokedMidFortnight()],
        PERIOD,
        [],
      ),
    ).toBe(false);
  });

  it("fails when a revoked installation still holds events not yet applied", () => {
    expect(
      isHeldBackOnlyByRevokedInstallations(
        [installation(), revokedMidFortnight({ holdsUnappliedEvents: true })],
        PERIOD,
        [],
      ),
    ).toBe(false);
  });

  it("fails when a confirmed revoked installation still holds events not yet applied", () => {
    expect(
      isHeldBackOnlyByRevokedInstallations(
        [revokedMidFortnight({ holdsUnappliedEvents: true })],
        PERIOD,
        ["revoked-1"],
      ),
    ).toBe(false);
  });

  it("fails when no installation is held back", () => {
    expect(isHeldBackOnlyByRevokedInstallations([installation()], PERIOD, [])).toBe(false);
  });

  it("fails when the only revoked installation is confirmed", () => {
    expect(
      isHeldBackOnlyByRevokedInstallations([revokedMidFortnight()], PERIOD, ["revoked-1"]),
    ).toBe(false);
  });

  it("fails when the only revoked installation is confirmed and a live one has not reached past", () => {
    expect(
      isHeldBackOnlyByRevokedInstallations(
        [installation({ latestOccurredAt: null }), revokedMidFortnight()],
        PERIOD,
        ["revoked-1"],
      ),
    ).toBe(false);
  });

  it("fails when there is no installation", () => {
    expect(isHeldBackOnlyByRevokedInstallations([], PERIOD, [])).toBe(false);
  });
});

describe("streamReachesPastOnceConfirmed", () => {
  it("fails while a revoked installation is not confirmed", () => {
    expect(streamReachesPastOnceConfirmed([revokedMidFortnight()], PERIOD, [])).toBe(false);
  });

  it("holds once the only installation not reaching past the close is confirmed", () => {
    expect(
      streamReachesPastOnceConfirmed([installation(), revokedMidFortnight()], PERIOD, [
        "revoked-1",
      ]),
    ).toBe(true);
  });

  it("fails when a confirmed installation is not the one that has not reached past the close", () => {
    expect(
      streamReachesPastOnceConfirmed(
        [installation({ latestOccurredAt: null }), revokedMidFortnight()],
        PERIOD,
        ["revoked-1"],
      ),
    ).toBe(false);
  });

  it("fails while a confirmed revoked installation still holds events not yet applied", () => {
    expect(
      streamReachesPastOnceConfirmed(
        [installation(), revokedMidFortnight({ holdsUnappliedEvents: true })],
        PERIOD,
        ["revoked-1"],
      ),
    ).toBe(false);
  });

  it("holds with no installation at all", () => {
    expect(streamReachesPastOnceConfirmed([], PERIOD, [])).toBe(true);
  });
});
