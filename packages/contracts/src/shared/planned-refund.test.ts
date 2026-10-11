import { describe, expect, it } from "vitest";
import { plannedRefundSchema } from "./planned-refund.js";

const refund = { payment_id: "payment-1", method: "TRANSFER", amount: 2000, state: "PENDING" };

describe("plannedRefundSchema", () => {
  it.each(["PENDING", "APPROVED"])("accepts a register refund that is %s", (state) => {
    expect(plannedRefundSchema.parse({ ...refund, state })).toEqual({ ...refund, state });
  });

  it("refuses a register refund that is discarded, which only the cloud can discard", () => {
    expect(plannedRefundSchema.safeParse({ ...refund, state: "DISCARDED" }).success).toBe(false);
  });
});
