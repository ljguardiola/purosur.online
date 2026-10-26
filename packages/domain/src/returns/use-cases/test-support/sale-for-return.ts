import type { SaleLine } from "../../../sales/index.js";
import { argentinaInstant } from "../../../shared/index.js";
import type { ReturnablePayment } from "../../model/refund-allocation.js";
import type { FakeStoredSale } from "./fake-return-ledger.js";

export const SOLD_AT = new Date(argentinaInstant("2026-09-12", "15:30"));
export const RETURNED_AT = new Date(argentinaInstant("2026-09-20", "10:00"));

export const YERBA_LINE: SaleLine = {
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
};

export const PROMOTED_LINE: SaleLine = {
  ...YERBA_LINE,
  id: "line-2",
  productId: "galletitas",
  productName: "Galletitas",
  quantity: 4,
  listUnitPrice: 1500,
  promotions: [
    {
      id: "two-for-one",
      name: "Dos por uno",
      benefit: { kind: "BUY_N_PAY_M", buyQty: 2, payQty: 1 },
    },
  ],
  promotionId: "two-for-one",
  discountAmount: 2000,
  lineTotal: 4000,
};

export const CHEESE_LINE: SaleLine = {
  ...YERBA_LINE,
  id: "line-3",
  productId: "queso",
  productName: "Queso por kilo",
  saleUnit: "KG",
  quantity: 1250,
  listUnitPrice: 8000,
  lineTotal: 10_000,
};

export const CASH_PAYMENT: ReturnablePayment = {
  id: "pay-cash",
  method: "CASH",
  provider: "NONE",
  amount: 15_000,
  state: "APPROVED",
  refundedAmount: 0,
};

export const TRANSFER_PAYMENT: ReturnablePayment = {
  id: "pay-transfer",
  method: "TRANSFER",
  provider: "NONE",
  amount: 6500,
  state: "APPROVED",
  refundedAmount: 0,
};

export function aSaleForReturn(overrides: Partial<FakeStoredSale> = {}): FakeStoredSale {
  return {
    sale: {
      id: "sale-1",
      registerId: "register-1",
      deviceId: "device-1",
      sessionId: "session-1",
      actorId: "cashier",
      state: "COMPLETED",
      saleDiscount: null,
      lines: [YERBA_LINE, PROMOTED_LINE, CHEESE_LINE],
    },
    occurredAt: SOLD_AT,
    invoice: { pointOfSale: 3, number: 1204 },
    payments: [CASH_PAYMENT, TRANSFER_PAYMENT],
    returned: [],
    deferred: { id: "deferred-1", shortCode: "7KQ4M2P9" },
    ...overrides,
  };
}
