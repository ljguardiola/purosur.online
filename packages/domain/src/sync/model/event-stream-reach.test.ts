import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type InstallationStreamReach, streamReachesPast } from "./event-stream-reach.js";

const PERIOD = {
  from: new Date("2026-09-01T03:00:00.000Z"),
  until: new Date("2026-09-16T03:00:00.000Z"),
};

function installation(overrides: Partial<InstallationStreamReach> = {}): InstallationStreamReach {
  return {
    enrolledAt: new Date("2026-08-01T12:00:00.000Z"),
    revokedAt: null,
    latestOccurredAt: new Date("2026-09-16T03:00:00.001Z"),
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

  it("holds exactly when every installation active in the period reaches past its end", () => {
    const moment = fc
      .integer({ min: 0, max: 40 })
      .map((hours) => new Date(PERIOD.from.getTime() + (hours - 10) * 12 * 60 * 60 * 1000));
    const anInstallation = fc.record({
      enrolledAt: moment,
      revokedAt: fc.option(moment, { nil: null }),
      latestOccurredAt: fc.option(moment, { nil: null }),
    });
    fc.assert(
      fc.property(fc.array(anInstallation, { maxLength: 6 }), (installations) => {
        const expected = installations
          .filter(
            ({ enrolledAt, revokedAt }) =>
              enrolledAt < PERIOD.until && (revokedAt === null || revokedAt > PERIOD.from),
          )
          .every(
            ({ latestOccurredAt }) => latestOccurredAt !== null && latestOccurredAt > PERIOD.until,
          );
        expect(streamReachesPast(installations, PERIOD)).toBe(expected);
      }),
    );
  });
});
