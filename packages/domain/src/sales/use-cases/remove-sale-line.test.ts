import { describe, expect, it } from "vitest";
import type { PaymentTransaction } from "../model/payment.js";
import type { SaleWithLines } from "../model/sale.js";
import { removeSaleLine } from "./remove-sale-line.js";
import {
  FakeSaleLedger,
  type FakeSaleLedgerState,
  FixedClock,
} from "./test-support/fake-sale-ledger.js";

const NOW = new Date("2026-09-30T12:34:56.789Z");
const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const SESSION = { id: "session-1", openedBy: "cashier" };
const YERBA_LINE = {
  id: "line-1",
  productId: "yerba",
  productName: "Yerba 1 kg",
  quantity: 3,
  listUnitPrice: 2500,
  priceListId: "list-1",
  promotions: [],
  promotionId: "ten",
  discountAmount: 750,
  lineTotal: 6750,
};
const AZUCAR_LINE = {
  ...YERBA_LINE,
  id: "line-2",
  productId: "azucar",
  productName: "Azucar",
  quantity: 1,
  listUnitPrice: 1200,
  promotionId: null,
  discountAmount: 0,
  lineTotal: 1200,
};
const OPEN_SALE: SaleWithLines = {
  id: "sale-1",
  registerId: "register-1",
  deviceId: "device-1",
  sessionId: "session-1",
  actorId: "cashier",
  state: "OPEN",
  lines: [YERBA_LINE, AZUCAR_LINE],
};

const PAYMENT: PaymentTransaction = {
  id: "payment-1",
  saleId: "sale-1",
  kind: "SALE",
  method: "CASH",
  provider: "NONE",
  amount: 1000,
  tendered: 1000,
  state: "APPROVED",
  occurredAt: NOW,
};

const THRESHOLD = { id: "threshold-1", amount: 10_000_000, validFrom: "2026-01-01" };

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    thresholds: [THRESHOLD],
    accesses: { cashier: CASHIER },
    session: SESSION,
    sales: [OPEN_SALE],
    ...state,
  });
}

function remove(store: FakeSaleLedger, lineId: string, actorId = "cashier") {
  return removeSaleLine({ ledger: store, clock: new FixedClock(NOW) }, { actorId, lineId });
}

describe("removeSaleLine", () => {
  it("takes the line out of the sale and leaves no trace of it", () => {
    const store = ledger();
    const before = structuredClone(store.state);

    const outcome = remove(store, "line-1");

    expect(outcome).toEqual({
      kind: "removed",
      sale: { ...OPEN_SALE, lines: [AZUCAR_LINE] },
      balance: { paid: 0, pending: 1200 },
      linesEditable: true,
      cancellable: true,
    });
    expect(store.state).toEqual({ ...before, sales: [{ ...OPEN_SALE, lines: [AZUCAR_LINE] }] });
    expect(store.transactions).toBe(1);
  });

  it("keeps the sale open when its last line goes", () => {
    const store = ledger({ sales: [{ ...OPEN_SALE, lines: [AZUCAR_LINE] }] });

    const outcome = remove(store, "line-2");

    expect(outcome).toEqual({
      kind: "removed",
      sale: { ...OPEN_SALE, lines: [] },
      balance: { paid: 0, pending: 0 },
      linesEditable: true,
      cancellable: true,
    });
    expect(store.state.sales[0]?.state).toBe("OPEN");
  });

  it("refuses a line that is not in the open sale, changing nothing", () => {
    const store = ledger();
    const before = structuredClone(store.state);

    expect(remove(store, "line-9")).toEqual({ kind: "unknown_line" });
    expect(store.state).toEqual(before);
  });

  it("refuses when there is no open sale, changing nothing", () => {
    const store = ledger({ sales: [{ ...OPEN_SALE, state: "COMPLETED" }] });
    const before = structuredClone(store.state);

    expect(remove(store, "line-1")).toEqual({ kind: "no_open_sale" });
    expect(store.state).toEqual(before);
  });

  it("refuses an actor without the permission", () => {
    const store = ledger({ accesses: { cashier: { isAdministrator: false, permissionKeys: [] } } });
    const before = structuredClone(store.state);

    expect(remove(store, "line-1")).toEqual({ kind: "not_permitted" });
    expect(store.state).toEqual(before);
  });

  it("refuses without an open cash session", () => {
    expect(remove(ledger({ session: undefined }), "line-1")).toEqual({ kind: "no_open_session" });
  });

  it("refuses an actor who did not open the current session", () => {
    const store = ledger({ accesses: { cashier: CASHIER, other: CASHIER } });
    const before = structuredClone(store.state);

    expect(remove(store, "line-1", "other")).toEqual({ kind: "not_permitted" });
    expect(store.state).toEqual(before);
  });

  it("leaves the sale untouched when deleting the line fails", () => {
    const store = ledger();
    const before = structuredClone(store.state);
    store.failOn = "deleteSaleLine";

    expect(() => remove(store, "line-1")).toThrow("deleteSaleLine failed");
    expect(store.state).toEqual(before);
  });
});

describe("remove-sale-line charge refusal", () => {
  it("tells that the sale reaches the threshold when removing a line brings it to the threshold", () => {
    const store = ledger({ thresholds: [{ ...THRESHOLD, amount: 1200 }] });

    expect(remove(store, "line-1")).toEqual(
      expect.objectContaining({
        chargeRefusal: { kind: "reaches_buyer_identification_threshold", threshold: 1200 },
      }),
    );
  });

  it("tells nothing is refused when removing a line leaves the sale under the threshold", () => {
    const store = ledger({ thresholds: [{ ...THRESHOLD, amount: 1201 }] });

    expect(remove(store, "line-1")).toHaveProperty("chargeRefusal", undefined);
  });

  it("tells that no threshold is in effect when there is none", () => {
    const store = ledger({ thresholds: [] });

    expect(remove(store, "line-1")).toEqual(
      expect.objectContaining({ chargeRefusal: { kind: "no_buyer_identification_threshold" } }),
    );
  });
});

describe("removeSaleLine on a sale with an approved payment", () => {
  it("refuses to remove a line, writing nothing", () => {
    const store = ledger({ payments: [PAYMENT] });
    const before = structuredClone(store.state);

    expect(remove(store, "line-1")).toEqual({ kind: "sale_has_payments" });
    expect(store.state).toEqual(before);
  });

  it("refuses before looking the line up", () => {
    const store = ledger({ payments: [PAYMENT] });

    expect(remove(store, "line-9")).toEqual({ kind: "sale_has_payments" });
  });

  it("still removes from a sale whose payments belong to another sale", () => {
    const store = ledger({ payments: [{ ...PAYMENT, saleId: "sale-9" }] });

    expect(remove(store, "line-1")).toMatchObject({ kind: "removed" });
  });
});
