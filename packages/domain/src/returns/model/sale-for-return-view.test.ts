import { describe, expect, it } from "vitest";
import { argentinaInstant } from "../../shared/index.js";
import type { SaleForReturn } from "./return-sale.js";
import { saleForReturnOutcome } from "./sale-for-return-view.js";

const SOLD_AT = new Date(argentinaInstant("2026-09-12", "15:30"));
const NOW = new Date(argentinaInstant("2026-09-20", "10:00"));

function facts(overrides: Partial<SaleForReturn> = {}): SaleForReturn {
  return {
    sale: {
      id: "sale-1",
      registerId: "register-1",
      deviceId: "device-1",
      state: "COMPLETED",
      saleDiscount: null,
      lines: [
        {
          id: "line-1",
          productId: "yerba",
          productName: "Yerba 1 kg",
          saleUnit: "UNIT",
          quantity: 3,
          promotionId: null,
          lineTotal: 7500,
        },
        {
          id: "line-2",
          productId: "galletitas",
          productName: "Galletitas",
          saleUnit: "UNIT",
          quantity: 4,
          promotionId: "two-for-one",
          lineTotal: 4000,
        },
      ],
    },
    occurredAt: SOLD_AT,
    invoice: { pointOfSale: 3, number: 1204 },
    payments: [
      {
        id: "pay-cash",
        method: "CASH",
        provider: "NONE",
        amount: 11_500,
        state: "APPROVED",
        refundedAmount: 0,
      },
    ],
    returned: [],
    ...overrides,
  };
}

describe("saleForReturnOutcome", () => {
  it("answers not found when there are no facts", () => {
    expect(saleForReturnOutcome(undefined, 15, NOW)).toEqual({ kind: "not_found" });
  });

  it("answers not found for a sale that was never completed", () => {
    const open = facts();
    open.sale.state = "OPEN";

    expect(saleForReturnOutcome(open, 15, NOW)).toEqual({ kind: "not_found" });
  });

  it.each(["VOIDED", "CANCELLED"] as const)("answers voided for a %s sale", (state) => {
    const gone = facts();
    gone.sale.state = state;

    expect(saleForReturnOutcome(gone, 15, NOW)).toEqual({ kind: "voided" });
  });

  it("shows the sale's identity, total, invoice, lines, payments and windows", () => {
    const outcome = saleForReturnOutcome(
      facts({ returned: [{ saleLineId: "line-1", quantity: 1, refundedAmount: 2500 }] }),
      15,
      NOW,
    );

    expect(outcome).toMatchObject({
      kind: "found",
      sale: {
        saleId: "sale-1",
        occurredAt: SOLD_AT,
        total: 11_500,
        invoice: { pointOfSale: 3, number: 1204 },
        windows: {
          change_of_mind: { lastAllowedDay: "2026-09-27", open: true },
          defective: { lastAllowedDay: "2027-03-12", open: true },
        },
        lines: [
          { id: "line-1", returnedQuantity: 1, returnableQuantity: 2, mustBeReturnedWhole: false },
          { id: "line-2", returnedQuantity: 0, returnableQuantity: 4, mustBeReturnedWhole: true },
        ],
        payments: [{ paymentId: "pay-cash", remaining: 11_500, eligible: true }],
      },
    });
  });

  it("follows the good condition days it is given", () => {
    const outcome = saleForReturnOutcome(facts(), 30, NOW);

    expect(outcome.kind === "found" && outcome.sale.windows.change_of_mind).toEqual({
      lastAllowedDay: "2026-10-12",
      open: true,
    });
  });
});
