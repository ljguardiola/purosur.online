import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { FiscalDocumentState } from "./real-time-authorization.js";
import {
  DEFERRED_BACKLOG_RETRY_INTERVAL_MS,
  DEFERRED_RETRY_DELAYING_STATES,
  type DeferredBacklogEntry,
  hasDeferredBacklog,
  isDateOrderBroken,
  isInDeferredBacklog,
  latestIssuedOn,
  nextDeferredBacklogStep,
} from "./deferred-backlog.js";

const now = new Date("2026-10-12T12:00:00-03:00");

function entry(overrides: Partial<DeferredBacklogEntry> = {}): DeferredBacklogEntry {
  return {
    deferredSaleId: "deferred-1",
    saleId: "sale-1",
    occurredAt: new Date("2026-10-10T12:00:00-03:00"),
    routedAt: new Date("2026-10-10T12:00:05-03:00"),
    total: 1000,
    lastAttemptEndedAt: null,
    ...overrides,
  };
}

describe("DEFERRED_BACKLOG_RETRY_INTERVAL_MS", () => {
  it("is ten minutes", () => {
    expect(DEFERRED_BACKLOG_RETRY_INTERVAL_MS).toBe(600_000);
  });
});

describe("DEFERRED_RETRY_DELAYING_STATES", () => {
  it.each<[FiscalDocumentState, boolean]>([
    ["REJECTED", true],
    ["CONFLICTING", true],
    ["RELEASED", false],
    ["AUTHORIZED", false],
    ["REQUESTING", false],
    ["UNKNOWN", false],
  ])("counts an attempt ended %s as delaying the next try: %s", (state, delays) => {
    expect(DEFERRED_RETRY_DELAYING_STATES.includes(state)).toBe(delays);
  });
});

describe("isDateOrderBroken", () => {
  it("is false without an authorized document", () => {
    expect(isDateOrderBroken(new Date("2026-10-10T12:00:00-03:00"), null)).toBe(false);
  });

  it("is true when the sale's Argentine day is earlier than the last authorized one", () => {
    expect(isDateOrderBroken(new Date("2026-10-10T12:00:00-03:00"), "2026-10-11")).toBe(true);
  });

  it("is false on the same day", () => {
    expect(isDateOrderBroken(new Date("2026-10-10T23:59:00-03:00"), "2026-10-10")).toBe(false);
  });

  it("is false for a later day", () => {
    expect(isDateOrderBroken(new Date("2026-10-11T00:00:00-03:00"), "2026-10-10")).toBe(false);
  });

  it("reads the sale's day in Argentina, not in UTC", () => {
    expect(isDateOrderBroken(new Date("2026-10-11T01:00:00Z"), "2026-10-10")).toBe(false);
    expect(isDateOrderBroken(new Date("2026-10-11T01:00:00Z"), "2026-10-11")).toBe(true);
  });
});

describe("latestIssuedOn", () => {
  it("is null when both are unknown", () => {
    expect(latestIssuedOn(null, null)).toBeNull();
  });

  it("is the one known when the other is not", () => {
    expect(latestIssuedOn("2026-10-10", null)).toBe("2026-10-10");
    expect(latestIssuedOn(null, "2026-10-10")).toBe("2026-10-10");
  });

  it("is the later of two days, in either order", () => {
    expect(latestIssuedOn("2026-10-10", "2026-10-12")).toBe("2026-10-12");
    expect(latestIssuedOn("2026-10-12", "2026-10-10")).toBe("2026-10-12");
  });

  it("is always one of the two days it is given, the later as written", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        fc.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        (a, b) => {
          const later = latestIssuedOn(a, b);
          expect([a, b]).toContain(later);
          expect([a, b, later].sort()[2]).toBe(later);
        },
      ),
    );
    expect(latestIssuedOn("2026-02-30", "2026-02-27")).toBe("2026-02-30");
  });
});

describe("isInDeferredBacklog", () => {
  it("holds a pending sale inside its window", () => {
    expect(isInDeferredBacklog(entry(), now, null)).toBe(true);
  });

  it("drops an expired sale", () => {
    expect(isInDeferredBacklog(entry(), new Date("2026-10-16T00:00:00-03:00"), null)).toBe(false);
  });

  it("drops a sale whose date is behind the last authorized document", () => {
    expect(isInDeferredBacklog(entry(), now, "2026-10-11")).toBe(false);
  });
});

describe("hasDeferredBacklog", () => {
  it("is false without entries", () => {
    expect(hasDeferredBacklog([], now, null)).toBe(false);
  });

  it("is true with a pending sale", () => {
    expect(hasDeferredBacklog([entry()], now, null)).toBe(true);
  });

  it("is false when every entry is expired or out of date order", () => {
    const entries = [
      entry({ deferredSaleId: "a", occurredAt: new Date("2026-10-01T12:00:00-03:00") }),
      entry({ deferredSaleId: "b" }),
    ];
    expect(hasDeferredBacklog(entries, now, "2026-10-11")).toBe(false);
  });

  it("is true when one entry remains among dropped ones", () => {
    const entries = [
      entry({ deferredSaleId: "a", occurredAt: new Date("2026-10-01T12:00:00-03:00") }),
      entry({ deferredSaleId: "b" }),
    ];
    expect(hasDeferredBacklog(entries, now, null)).toBe(true);
  });
});

describe("nextDeferredBacklogStep", () => {
  it("is empty without entries", () => {
    expect(nextDeferredBacklogStep([], now, null)).toEqual({ kind: "empty" });
  });

  it("is empty when every entry is expired", () => {
    expect(nextDeferredBacklogStep([entry()], new Date("2026-10-16T00:00:00-03:00"), null)).toEqual(
      { kind: "empty" },
    );
  });

  it("invoices the oldest sale first", () => {
    const older = entry({
      deferredSaleId: "older",
      occurredAt: new Date("2026-10-09T12:00:00-03:00"),
    });
    const newer = entry({ deferredSaleId: "newer" });
    expect(nextDeferredBacklogStep([newer, older], now, null)).toEqual({
      kind: "invoice",
      entry: older,
    });
  });

  it("breaks a tie of sale instants by when the sale was deferred", () => {
    const first = entry({ deferredSaleId: "z", routedAt: new Date("2026-10-10T12:00:01-03:00") });
    const second = entry({ deferredSaleId: "a", routedAt: new Date("2026-10-10T12:00:09-03:00") });
    expect(nextDeferredBacklogStep([second, first], now, null)).toEqual({
      kind: "invoice",
      entry: first,
    });
  });

  it("breaks a full tie by deferred sale id, in either order given", () => {
    const first = entry({ deferredSaleId: "a" });
    const second = entry({ deferredSaleId: "b" });
    expect(nextDeferredBacklogStep([second, first], now, null)).toEqual({
      kind: "invoice",
      entry: first,
    });
    expect(nextDeferredBacklogStep([first, second], now, null)).toEqual({
      kind: "invoice",
      entry: first,
    });
  });

  it("orders deferred sale ids of a full tie by their code units, as storage does", () => {
    const upper = entry({ deferredSaleId: "B" });
    const lower = entry({ deferredSaleId: "a" });
    expect(nextDeferredBacklogStep([lower, upper], now, null)).toEqual({
      kind: "invoice",
      entry: upper,
    });
  });

  it("skips an expired sale and invoices the next", () => {
    const expired = entry({
      deferredSaleId: "expired",
      occurredAt: new Date("2026-10-01T12:00:00-03:00"),
    });
    const live = entry({ deferredSaleId: "live" });
    expect(nextDeferredBacklogStep([expired, live], now, null)).toEqual({
      kind: "invoice",
      entry: live,
    });
  });

  it("skips a sale behind the last authorized date and invoices the next", () => {
    const behind = entry({
      deferredSaleId: "behind",
      occurredAt: new Date("2026-10-09T12:00:00-03:00"),
    });
    const live = entry({ deferredSaleId: "live" });
    expect(nextDeferredBacklogStep([behind, live], now, "2026-10-10")).toEqual({
      kind: "invoice",
      entry: live,
    });
  });

  it("waits for the retry interval after an attempt, without reaching the next sale", () => {
    const attemptEndedAt = new Date("2026-10-12T11:55:00-03:00");
    const blocked = entry({ deferredSaleId: "blocked", lastAttemptEndedAt: attemptEndedAt });
    const next = entry({
      deferredSaleId: "next",
      occurredAt: new Date("2026-10-11T12:00:00-03:00"),
    });
    expect(nextDeferredBacklogStep([next, blocked], now, null)).toEqual({
      kind: "wait",
      until: new Date(attemptEndedAt.getTime() + DEFERRED_BACKLOG_RETRY_INTERVAL_MS),
      entry: blocked,
    });
  });

  it("retries once the interval has passed", () => {
    const blocked = entry({
      lastAttemptEndedAt: new Date(now.getTime() - DEFERRED_BACKLOG_RETRY_INTERVAL_MS),
    });
    expect(nextDeferredBacklogStep([blocked], now, null)).toEqual({
      kind: "invoice",
      entry: blocked,
    });
  });

  it("still waits one millisecond before the interval ends", () => {
    const blocked = entry({
      lastAttemptEndedAt: new Date(now.getTime() - DEFERRED_BACKLOG_RETRY_INTERVAL_MS + 1),
    });
    expect(nextDeferredBacklogStep([blocked], now, null).kind).toBe("wait");
  });

  it("never invoices a sale that is out of the backlog, whatever the entries", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 20 }), { maxLength: 6 }), (offsets) => {
        const entries = offsets.map((offset, index) =>
          entry({
            deferredSaleId: `d${index}`,
            occurredAt: new Date(Date.parse("2026-09-25T12:00:00-03:00") + offset * 86_400_000),
          }),
        );
        const step = nextDeferredBacklogStep(entries, now, "2026-10-05");
        if (step.kind === "invoice") {
          expect(isInDeferredBacklog(step.entry, now, "2026-10-05")).toBe(true);
        }
        expect(step.kind === "empty").toBe(!hasDeferredBacklog(entries, now, "2026-10-05"));
      }),
    );
  });
});
