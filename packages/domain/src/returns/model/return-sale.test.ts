import { describe, expect, it } from "vitest";
import type { SaleLine, SaleWithLines } from "../../sales/index.js";
import { returnSaleLines } from "./return-sale.js";

function line(overrides: Partial<SaleLine> = {}): SaleLine {
  return {
    id: "line-1",
    productId: "yerba",
    productName: "Yerba 1 kg",
    saleUnit: "UNIT",
    weightSource: null,
    quantity: 3,
    listUnitPrice: 2500,
    priceListId: "list-1",
    promotions: [],
    manualAdjustment: null,
    promotionId: null,
    discountAmount: 0,
    lineTotal: 7500,
    ...overrides,
  };
}

function sale(
  lines: SaleLine[],
  saleDiscount: SaleWithLines["saleDiscount"] = null,
): SaleWithLines {
  return {
    id: "sale-1",
    registerId: "register-1",
    deviceId: "device-1",
    sessionId: "session-1",
    actorId: "cashier",
    state: "COMPLETED",
    saleDiscount,
    lines,
  };
}

describe("returnSaleLines", () => {
  it("stands each line at its product, what it sold, charged and promotion, with nothing returned yet", () => {
    expect(
      returnSaleLines({
        sale: sale([
          line(),
          line({ id: "line-2", quantity: 1250, lineTotal: 10_000, promotionId: "ten" }),
        ]),
        returned: [],
      }),
    ).toEqual([
      {
        id: "line-1",
        productId: "yerba",
        productName: "Yerba 1 kg",
        saleUnit: "UNIT",
        soldQuantity: 3,
        promotionId: null,
        chargedAmount: 7500,
        returnedQuantity: 0,
        refundedAmount: 0,
      },
      {
        id: "line-2",
        productId: "yerba",
        productName: "Yerba 1 kg",
        saleUnit: "UNIT",
        soldQuantity: 1250,
        promotionId: "ten",
        chargedAmount: 10_000,
        returnedQuantity: 0,
        refundedAmount: 0,
      },
    ]);
  });

  it("charges each line the total it settled at, its share of the sale's discount already taken", () => {
    const discounted = sale(
      [line({ lineTotal: 7500 - 751 }), line({ id: "line-2", quantity: 1, lineTotal: 2500 - 249 })],
      { kind: "AMOUNT", amount: 1000, reason: "cliente frecuente", authorizedBy: null },
    );

    expect(returnSaleLines({ sale: discounted, returned: [] }).map((l) => l.chargedAmount)).toEqual(
      [7500 - 751, 2500 - 249],
    );
  });

  it("carries what earlier returns took back from each line, in quantity and in money", () => {
    expect(
      returnSaleLines({
        sale: sale([line(), line({ id: "line-2" })]),
        returned: [{ saleLineId: "line-2", quantity: 1, refundedAmount: 2500 }],
      }).map(({ returnedQuantity, refundedAmount }) => [returnedQuantity, refundedAmount]),
    ).toEqual([
      [0, 0],
      [1, 2500],
    ]);
  });

  it("stands the lines of a sale known only by the facts returns read", () => {
    expect(
      returnSaleLines({
        sale: {
          id: "sale-1",
          registerId: "register-1",
          deviceId: "device-1",
          sessionId: "session-1",
          actorId: "cashier",
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
          ],
        },
        returned: [],
      }),
    ).toMatchObject([{ id: "line-1", soldQuantity: 3, chargedAmount: 7500 }]);
  });
});
