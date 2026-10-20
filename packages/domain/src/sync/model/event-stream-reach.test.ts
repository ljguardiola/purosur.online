import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type InstallationStreamReach,
  isInstallationActiveDuring,
  streamReachesPast,
} from "./event-stream-reach.js";

const PERIOD = {
  from: new Date("2026-09-01T03:00:00.000Z"),
  until: new Date("2026-09-16T03:00:00.000Z"),
};

function installation(overrides: Partial<InstallationStreamReach> = {}): InstallationStreamReach {
  return {
    enrolledAt: new Date("2026-08-01T12:00:00.000Z"),
    revokedAt: null,
    latestOccurredAt: new Date("2026-09-16T03:00:00.001Z"),
    caughtUpAt: null,
    holdsUnappliedEvents: false,
    ...overrides,
  };
}

describe("streamReachesPast", () => {
  it("holds when there is no installation at all, as nothing could have issued", () => {
    expect(streamReachesPast([], PERIOD)).toBe(true);
  });

  it("holds when the only installation's stream reaches past the end of the period", () => {
    expect(streamReachesPast([installation()], PERIOD)).toBe(true);
  });

  it("fails when the stream ends exactly at the end of the period", () => {
    expect(streamReachesPast([installation({ latestOccurredAt: PERIOD.until })], PERIOD)).toBe(
      false,
    );
  });

  it("fails when the stream ends before the end of the period", () => {
    expect(
      streamReachesPast(
        [installation({ latestOccurredAt: new Date("2026-09-10T12:00:00.000Z") })],
        PERIOD,
      ),
    ).toBe(false);
  });

  it("holds when the stream ends before the period does but the installation was caught up past it", () => {
    expect(
      streamReachesPast(
        [
          installation({
            latestOccurredAt: new Date("2026-09-10T12:00:00.000Z"),
            caughtUpAt: new Date("2026-09-16T03:00:00.001Z"),
          }),
        ],
        PERIOD,
      ),
    ).toBe(true);
  });

  it("holds when the installation never synced an event but was caught up past the end of the period", () => {
    expect(
      streamReachesPast(
        [
          installation({
            latestOccurredAt: null,
            caughtUpAt: new Date("2026-09-20T12:00:00.000Z"),
          }),
        ],
        PERIOD,
      ),
    ).toBe(true);
  });

  it("fails when the installation was caught up exactly at the end of the period", () => {
    expect(
      streamReachesPast(
        [installation({ latestOccurredAt: null, caughtUpAt: PERIOD.until })],
        PERIOD,
      ),
    ).toBe(false);
  });

  it("fails when the installation was caught up before the end of the period", () => {
    expect(
      streamReachesPast(
        [
          installation({
            latestOccurredAt: null,
            caughtUpAt: new Date("2026-09-15T12:00:00.000Z"),
          }),
        ],
        PERIOD,
      ),
    ).toBe(false);
  });

  it("fails when an installation whose applied events reach past the period still holds events not applied", () => {
    expect(streamReachesPast([installation({ holdsUnappliedEvents: true })], PERIOD)).toBe(false);
  });

  it("fails when an installation caught up past the period still holds events not applied", () => {
    expect(
      streamReachesPast(
        [
          installation({
            latestOccurredAt: null,
            caughtUpAt: new Date("2026-09-20T12:00:00.000Z"),
            holdsUnappliedEvents: true,
          }),
        ],
        PERIOD,
      ),
    ).toBe(false);
  });

  it("ignores the events not applied of an installation that was not active in the period", () => {
    expect(
      streamReachesPast(
        [
          installation(),
          installation({
            enrolledAt: PERIOD.until,
            latestOccurredAt: null,
            holdsUnappliedEvents: true,
          }),
        ],
        PERIOD,
      ),
    ).toBe(true);
  });

  it("fails when an active installation never synced an event", () => {
    expect(streamReachesPast([installation({ latestOccurredAt: null })], PERIOD)).toBe(false);
  });

  it("fails when any one of several active installations falls short", () => {
    expect(
      streamReachesPast(
        [installation(), installation({ latestOccurredAt: new Date("2026-09-05T12:00:00.000Z") })],
        PERIOD,
      ),
    ).toBe(false);
  });

  it("fails for a revoked installation active during the period whose stream does not reach past it", () => {
    expect(
      streamReachesPast(
        [
          installation(),
          installation({
            revokedAt: new Date("2026-09-12T12:00:00.000Z"),
            latestOccurredAt: new Date("2026-09-11T12:00:00.000Z"),
          }),
        ],
        PERIOD,
      ),
    ).toBe(false);
  });

  it("ignores an installation enrolled at or after the end of the period", () => {
    expect(
      streamReachesPast(
        [installation({ enrolledAt: PERIOD.until, latestOccurredAt: null })],
        PERIOD,
      ),
    ).toBe(true);
  });

  it("ignores an installation revoked at or before the start of the period", () => {
    expect(
      streamReachesPast([installation({ revokedAt: PERIOD.from, latestOccurredAt: null })], PERIOD),
    ).toBe(true);
  });

  it("counts an installation enrolled just before the end of the period", () => {
    expect(
      streamReachesPast(
        [
          installation({
            enrolledAt: new Date("2026-09-16T02:59:59.999Z"),
            latestOccurredAt: null,
          }),
        ],
        PERIOD,
      ),
    ).toBe(false);
  });

  it("counts an installation revoked just after the start of the period", () => {
    expect(
      streamReachesPast(
        [
          installation({
            revokedAt: new Date("2026-09-01T03:00:00.001Z"),
            latestOccurredAt: null,
          }),
        ],
        PERIOD,
      ),
    ).toBe(false);
  });

  it("holds exactly when every installation active in the period reaches past its end with every event it pushed applied", () => {
    const moment = fc
      .integer({ min: 0, max: 40 })
      .map((hours) => new Date(PERIOD.from.getTime() + (hours - 10) * 12 * 60 * 60 * 1000));
    const anInstallation = fc.record({
      enrolledAt: moment,
      revokedAt: fc.option(moment, { nil: null }),
      latestOccurredAt: fc.option(moment, { nil: null }),
      caughtUpAt: fc.option(moment, { nil: null }),
      holdsUnappliedEvents: fc.boolean(),
    });
    fc.assert(
      fc.property(fc.array(anInstallation, { maxLength: 6 }), (installations) => {
        const expected = installations
          .filter(
            ({ enrolledAt, revokedAt }) =>
              enrolledAt < PERIOD.until && (revokedAt === null || revokedAt > PERIOD.from),
          )
          .every(
            ({ latestOccurredAt, caughtUpAt, holdsUnappliedEvents }) =>
              !holdsUnappliedEvents &&
              ((latestOccurredAt !== null && latestOccurredAt > PERIOD.until) ||
                (caughtUpAt !== null && caughtUpAt > PERIOD.until)),
          );
        expect(streamReachesPast(installations, PERIOD)).toBe(expected);
      }),
    );
  });
});

describe("isInstallationActiveDuring", () => {
  it("holds for an installation enrolled before the end of the period and never revoked", () => {
    expect(isInstallationActiveDuring(installation(), PERIOD)).toBe(true);
  });

  it("holds for an installation enrolled just before the end of the period", () => {
    expect(
      isInstallationActiveDuring(
        installation({ enrolledAt: new Date("2026-09-16T02:59:59.999Z") }),
        PERIOD,
      ),
    ).toBe(true);
  });

  it("fails for an installation enrolled at or after the end of the period", () => {
    expect(isInstallationActiveDuring(installation({ enrolledAt: PERIOD.until }), PERIOD)).toBe(
      false,
    );
  });

  it("holds for an installation revoked just after the start of the period", () => {
    expect(
      isInstallationActiveDuring(
        installation({ revokedAt: new Date("2026-09-01T03:00:00.001Z") }),
        PERIOD,
      ),
    ).toBe(true);
  });

  it("fails for an installation revoked at or before the start of the period", () => {
    expect(isInstallationActiveDuring(installation({ revokedAt: PERIOD.from }), PERIOD)).toBe(
      false,
    );
  });
});
