import { describe, expect, it } from "vitest";
import type { RegisterVersion } from "../../register/index.js";
import {
  heldReplenishmentFailure,
  type ReplenishmentFailure,
  replenishmentFailedReportOf,
} from "./replenishment-failure.js";

function version(major: number, minor: number, patch: number): RegisterVersion {
  return { major, minor, patch };
}

const REFUSED: ReplenishmentFailure = { kind: "refused", refusal: "predecessor_not_of_register" };

function unreadableBy(appVersion: RegisterVersion | null): ReplenishmentFailure {
  return { kind: "unreadable_event", eventId: "event-1", reason: "unknown fact", appVersion };
}

describe("heldReplenishmentFailure", () => {
  it("holds nothing for a replenishment that has not failed", () => {
    expect(heldReplenishmentFailure(undefined, version(1, 0, 0))).toBeUndefined();
  });

  it.each([version(1, 0, 0), version(1, 0, 1), version(2, 0, 0), null])(
    "holds a refusal on any version, even %o",
    (currentVersion) => {
      expect(heldReplenishmentFailure(REFUSED, currentVersion)).toBe(REFUSED);
    },
  );

  it.each([
    [version(1, 4, 1), version(1, 4, 0)],
    [version(1, 5, 0), version(1, 4, 9)],
    [version(2, 0, 0), version(1, 99, 99)],
    [version(1, 10, 0), version(1, 9, 0)],
  ])(
    "lets go of an unreadable event on %o, newer than the %o that could not read it",
    (current, failed) => {
      expect(heldReplenishmentFailure(unreadableBy(failed), current)).toBeUndefined();
    },
  );

  it.each([
    [version(1, 4, 0), version(1, 4, 0)],
    [version(1, 3, 9), version(1, 4, 0)],
    [version(1, 9, 0), version(1, 10, 0)],
  ])(
    "holds an unreadable event on %o, not newer than the %o that could not read it",
    (current, failed) => {
      const failure = unreadableBy(failed);

      expect(heldReplenishmentFailure(failure, current)).toBe(failure);
    },
  );

  it("holds an unreadable event when either version is unknown", () => {
    const unknownFailedVersion = unreadableBy(null);
    const knownFailedVersion = unreadableBy(version(1, 0, 0));

    expect(heldReplenishmentFailure(unknownFailedVersion, version(2, 0, 0))).toBe(
      unknownFailedVersion,
    );
    expect(heldReplenishmentFailure(knownFailedVersion, null)).toBe(knownFailedVersion);
  });
});

describe("replenishmentFailedReportOf", () => {
  it("reports no failure for a register with no replenishment pending", () => {
    expect(replenishmentFailedReportOf(undefined, version(1, 0, 0))).toEqual({
      replenishment_failed: false,
    });
  });

  it("reports nothing for a replenishment still pending that has not failed", () => {
    expect(replenishmentFailedReportOf({ failure: undefined }, version(1, 0, 0))).toStrictEqual({});
  });

  it("reports the kind of a failure the running version holds", () => {
    expect(replenishmentFailedReportOf({ failure: REFUSED }, version(1, 0, 0))).toEqual({
      replenishment_failed: "refused",
    });
    expect(
      replenishmentFailedReportOf({ failure: unreadableBy(version(1, 0, 0)) }, version(1, 0, 0)),
    ).toEqual({ replenishment_failed: "unreadable_event" });
  });

  it("reports nothing for an unreadable event a newer running version tries again", () => {
    expect(
      replenishmentFailedReportOf({ failure: unreadableBy(version(1, 0, 0)) }, version(1, 0, 1)),
    ).toStrictEqual({});
  });
});
