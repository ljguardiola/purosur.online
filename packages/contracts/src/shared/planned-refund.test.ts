import { describe, expect, it } from "vitest";
import { plannedRefundSchema } from "./planned-refund.js";

const refund = {
  payment_id: "payment-1",
  method: "TRANSFER",
  amount: 2000,
  state: "PENDING",
  sent_by_cloud: false,
};

describe("plannedRefundSchema", () => {
  it.each(["PENDING", "APPROVED"])("accepts a register refund that is %s", (state) => {
    expect(plannedRefundSchema.parse({ ...refund, state })).toEqual({ ...refund, state });
  });

  it.each([true, false])("carries whether the cloud sends the refund: %s", (sent_by_cloud) => {
    expect(plannedRefundSchema.parse({ ...refund, sent_by_cloud }).sent_by_cloud).toBe(
      sent_by_cloud,
    );
  });

  it("refuses a register refund that does not say whether the cloud sends it", () => {
    const { sent_by_cloud: _sentByCloud, ...withoutIt } = refund;

    expect(plannedRefundSchema.safeParse(withoutIt).success).toBe(false);
  });

  it("refuses a register refund that is discarded, which only the cloud can discard", () => {
    expect(plannedRefundSchema.safeParse({ ...refund, state: "DISCARDED" }).success).toBe(false);
  });
});
