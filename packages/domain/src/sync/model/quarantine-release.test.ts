import { describe, expect, it } from "vitest";
import { afterFailedAttempt } from "./event-application-retry.js";
import { isQuarantined, releasedForNewSeries } from "./quarantine-release.js";

const AT = new Date("2026-10-07T12:00:00.000Z");

describe("whether an event is in quarantine", () => {
  it("is when it was quarantined and never applied", () => {
    expect(isQuarantined({ appliedAt: null, quarantinedAt: AT })).toBe(true);
  });

  it("is not when it is waiting to be applied without a quarantine", () => {
    expect(isQuarantined({ appliedAt: null, quarantinedAt: null })).toBe(false);
  });

  it("is not once it was applied, even if it was quarantined before", () => {
    expect(isQuarantined({ appliedAt: AT, quarantinedAt: AT })).toBe(false);
  });
});

describe("the state of a released event", () => {
  it("starts a new series of attempts with no quarantine and no wait", () => {
    expect(releasedForNewSeries()).toEqual({
      attempts: 0,
      nextAttemptAt: null,
      quarantinedAt: null,
    });
  });

  it("gives the released event a full series before it is quarantined again", () => {
    let { attempts } = releasedForNewSeries();
    const outcomes = [];
    for (let failure = 1; failure <= 8; failure += 1) {
      attempts += 1;
      outcomes.push(afterFailedAttempt(attempts, AT).kind);
    }

    expect(outcomes).toEqual([...Array(7).fill("retry"), "quarantine"]);
  });
});
