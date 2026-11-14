import { describe, expect, it } from "vitest";
import { refundLabel } from "./refund-label";

const BASE = { payment_id: "p1", amount: 500_000, sent_by_cloud: false } as const;

describe("refundLabel", () => {
  it("says a refund given back at once is given on the spot", () => {
    expect(refundLabel({ ...BASE, method: "CASH", state: "APPROVED" })).toBe(
      "Efectivo · en el acto",
    );
  });

  it("says a refund still to be made is pending", () => {
    expect(refundLabel({ ...BASE, method: "QR", state: "PENDING" })).toBe(
      "QR · reembolso pendiente",
    );
  });
});
