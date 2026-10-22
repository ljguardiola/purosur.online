import { describe, expect, it } from "vitest";
import { unbilledDeferredSalesSchema } from "./unbilled-deferred-sales.js";

describe("unbilledDeferredSalesSchema", () => {
  it("reads how many are waiting and how old the oldest one is", () => {
    const body = { count: 3, oldest: { occurred_at: "2026-10-10T15:00:00.000Z", age_days: 6 } };

    expect(unbilledDeferredSalesSchema.parse(body)).toEqual(body);
  });

  it("reads none waiting", () => {
    expect(unbilledDeferredSalesSchema.parse({ count: 0, oldest: null })).toEqual({
      count: 0,
      oldest: null,
    });
  });

  it("reads an oldest sale of today", () => {
    const body = { count: 1, oldest: { occurred_at: "2026-10-16T15:00:00.000Z", age_days: 0 } };

    expect(unbilledDeferredSalesSchema.parse(body)).toEqual(body);
  });

  it.each([
    ["a negative count", { count: -1, oldest: null }],
    ["a fractional count", { count: 1.5, oldest: null }],
    ["no oldest", { count: 1 }],
    ["an oldest without its age", { count: 1, oldest: { occurred_at: "2026-10-10T15:00:00.000Z" } }],
    [
      "a negative age",
      { count: 1, oldest: { occurred_at: "2026-10-10T15:00:00.000Z", age_days: -1 } },
    ],
    ["an oldest that is not an instant", { count: 1, oldest: { occurred_at: "today", age_days: 1 } }],
  ])("refuses %s", (_case, body) => {
    expect(unbilledDeferredSalesSchema.safeParse(body).success).toBe(false);
  });
});
