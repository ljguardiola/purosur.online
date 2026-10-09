import { describe, expect, it } from "vitest";
import { argentinaInstant } from "../../shared/index.js";
import { ALERT_KINDS } from "./alert-catalog.js";
import { REGISTER_OWN_CONDITIONS, registerOwnConditions } from "./register-own-conditions.js";

const MINUTE_MS = 60 * 1000;
const HOURS = [{ dayOfWeek: 1, opensAt: "09:00", closesAt: "18:00" }];
const NOW = new Date(argentinaInstant("2026-10-05", "12:00"));

function minutesBefore(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() - minutes * MINUTE_MS);
}

function conditions(overrides: Partial<Parameters<typeof registerOwnConditions>[0]> = {}) {
  return registerOwnConditions({
    salesStop: { stopped: false },
    lastAcceptedPushAt: minutesBefore(NOW, 1),
    hours: HOURS,
    now: NOW,
    ...overrides,
  });
}

describe("REGISTER_OWN_CONDITIONS", () => {
  it("names the sales denial first and the silent register second", () => {
    expect(REGISTER_OWN_CONDITIONS).toEqual(["sales_denied", "register_silent"]);
  });

  it("names only alert kinds", () => {
    for (const condition of REGISTER_OWN_CONDITIONS) {
      expect(ALERT_KINDS).toContain(condition);
    }
  });
});

describe("registerOwnConditions", () => {
  it("is empty for a register that sells and was accepted a minute ago", () => {
    expect(conditions()).toEqual([]);
  });

  it("holds sales_denied while sales are stopped because the event history broke", () => {
    expect(conditions({ salesStop: { stopped: true, reason: "event_history_broken" } })).toEqual([
      "sales_denied",
    ]);
  });

  it("does not hold sales_denied for a register stopped for a reason it did not record", () => {
    expect(conditions({ salesStop: { stopped: true, reason: undefined } })).toEqual([]);
  });

  it("holds neither condition for a revoked installation, however long since its last accepted push", () => {
    expect(
      conditions({
        salesStop: { stopped: true, reason: "installation_revoked" },
        lastAcceptedPushAt: minutesBefore(NOW, 60),
      }),
    ).toEqual([]);
  });

  it("holds register_silent when the last accepted push is 15 minutes old within business hours", () => {
    expect(conditions({ lastAcceptedPushAt: minutesBefore(NOW, 15) })).toEqual(["register_silent"]);
  });

  it("does not hold register_silent when the last accepted push is under 15 minutes old", () => {
    expect(
      conditions({ lastAcceptedPushAt: new Date(NOW.getTime() - 15 * MINUTE_MS + 1) }),
    ).toEqual([]);
  });

  it("does not hold register_silent for a register that was never accepted", () => {
    expect(conditions({ lastAcceptedPushAt: null })).toEqual([]);
  });

  it("does not hold register_silent outside business hours", () => {
    expect(
      conditions({
        lastAcceptedPushAt: minutesBefore(NOW, 600),
        now: new Date(argentinaInstant("2026-10-05", "22:00")),
      }),
    ).toEqual([]);
  });

  it("does not hold register_silent for a branch with no hours", () => {
    expect(conditions({ lastAcceptedPushAt: minutesBefore(NOW, 600), hours: [] })).toEqual([]);
  });

  it("lists both conditions in catalog order", () => {
    expect(
      conditions({
        salesStop: { stopped: true, reason: "event_history_broken" },
        lastAcceptedPushAt: minutesBefore(NOW, 60),
      }),
    ).toEqual(["sales_denied", "register_silent"]);
  });
});
