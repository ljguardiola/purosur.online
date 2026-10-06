import { describe, expect, expectTypeOf, it } from "vitest";
import type { PaymentTransaction } from "../model/payment.js";
import type { SaleWithLines } from "../model/sale.js";
import { cancelSale } from "./cancel-sale.js";
import { FakeSaleLedger, type FakeSaleLedgerState } from "./test-support/fake-sale-ledger.js";

const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const SESSION = { id: "session-1", openedBy: "cashier" };
const YERBA_LINE = {
  id: "line-1",
  productId: "yerba",
  productName: "Yerba 1 kg",
  quantity: 3,
  listUnitPrice: 2500,
  priceListId: "list-1",
  promotions: [{ id: "ten", benefit: { kind: "PERCENT_OFF" as const, percent: 10 } }],
  promotionId: "ten",
  discountAmount: 750,
  lineTotal: 6750,
};
const OPEN_SALE: SaleWithLines = {
  id: "sale-1",
  registerId: "register-1",
  deviceId: "device-1",
  sessionId: "session-1",
  actorId: "cashier",
  state: "OPEN",
  lines: [YERBA_LINE],
};
const APPROVED_PAYMENT: PaymentTransaction = {
  id: "payment-1",
  saleId: "sale-1",
  kind: "SALE",
  method: "CASH",
  provider: "NONE",
  amount: 6750,
  state: "APPROVED",
  occurredAt: new Date("2026-09-30T12:20:00.000Z"),
};
const COMPLETED_SALE: SaleWithLines = {
  ...OPEN_SALE,
  id: "sale-0",
  state: "COMPLETED",
  lines: [{ ...YERBA_LINE, id: "line-0" }],
};

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    accesses: { cashier: CASHIER },
    session: SESSION,
    sales: [OPEN_SALE],
    ...state,
  });
}

function cancel(store: FakeSaleLedger, actorId = "cashier") {
  return cancelSale({ ledger: store }, { actorId, from: "sale" });
}

function cancelFromLockedRegister(store: FakeSaleLedger, actorId = "closer") {
  return cancelSale({ ledger: store }, { actorId, from: "locked_register" });
}

describe("cancelSale", () => {
  it("discards the open sale with its lines and records nothing about it", () => {
    const store = ledger();
    const before = structuredClone(store.state);

    const outcome = cancel(store);

    expect(outcome).toEqual({ kind: "cancelled" });
    expect(store.state).toEqual({ ...before, sales: [] });
    expect(store.transactions).toBe(1);
  });

  it("keeps the sales already completed", () => {
    const store = ledger({ sales: [COMPLETED_SALE, OPEN_SALE] });

    cancel(store);

    expect(store.state.sales).toEqual([COMPLETED_SALE]);
  });

  it("discards a sale that has no lines", () => {
    const store = ledger({ sales: [{ ...OPEN_SALE, lines: [] }] });

    expect(cancel(store)).toEqual({ kind: "cancelled" });
    expect(store.state.sales).toEqual([]);
  });

  it("discards the open sale even when another actor opened it", () => {
    const store = ledger({ sales: [{ ...OPEN_SALE, actorId: "former" }] });

    expect(cancel(store)).toEqual({ kind: "cancelled" });
    expect(store.state.sales).toEqual([]);
  });

  it("refuses when there is no open sale, changing nothing", () => {
    const store = ledger({ sales: [{ ...OPEN_SALE, state: "COMPLETED" }] });
    const before = structuredClone(store.state);

    expect(cancel(store)).toEqual({ kind: "no_open_sale" });
    expect(store.state).toEqual(before);
  });

  it("does not cancel a sale of another session", () => {
    const store = ledger({ sales: [{ ...OPEN_SALE, sessionId: "session-0" }] });
    const before = structuredClone(store.state);

    expect(cancel(store)).toEqual({ kind: "no_open_sale" });
    expect(store.state).toEqual(before);
  });

  it("refuses an actor without the permission", () => {
    const store = ledger({ accesses: { cashier: { isAdministrator: false, permissionKeys: [] } } });
    const before = structuredClone(store.state);

    expect(cancel(store)).toEqual({ kind: "not_permitted" });
    expect(store.state).toEqual(before);
  });

  it("refuses without an open cash session", () => {
    expect(cancel(ledger({ session: undefined }))).toEqual({ kind: "no_open_session" });
  });

  it("refuses an actor who did not open the current session", () => {
    const store = ledger({ accesses: { cashier: CASHIER, other: CASHIER } });
    const before = structuredClone(store.state);

    expect(cancel(store, "other")).toEqual({ kind: "not_permitted" });
    expect(store.state).toEqual(before);
  });

  it("refuses a sale with an approved payment, changing nothing", () => {
    const store = ledger({ payments: [APPROVED_PAYMENT] });
    const before = structuredClone(store.state);

    expect(cancel(store)).toEqual({ kind: "has_approved_payment" });
    expect(store.state).toEqual(before);
  });

  it("ignores the payments of another sale", () => {
    const store = ledger({ payments: [{ ...APPROVED_PAYMENT, saleId: "sale-0" }] });

    expect(cancel(store).kind).toBe("cancelled");
  });

  it("leaves the sale open when discarding it fails", () => {
    const store = ledger();
    const before = structuredClone(store.state);
    store.failOn = "discardOpenSale";

    expect(() => cancel(store)).toThrow("discardOpenSale failed");
    expect(store.state).toEqual(before);
  });
});

describe("cancelSale from the locked register", () => {
  it("never answers that the person is not permitted, as nobody's permission is checked here", () => {
    const outcome = cancelFromLockedRegister(ledger());

    expectTypeOf<Extract<typeof outcome, { kind: "not_permitted" }>>().toBeNever();
  });

  it("discards the open sale for a person who did not open the session and cannot sell", () => {
    const store = ledger({ accesses: {} });
    const before = structuredClone(store.state);

    const outcome = cancelFromLockedRegister(store);

    expect(outcome).toEqual({ kind: "cancelled" });
    expect(store.state).toEqual({ ...before, sales: [] });
  });

  it("refuses without an open cash session", () => {
    const store = ledger({ session: undefined });
    const before = structuredClone(store.state);

    expect(cancelFromLockedRegister(store)).toEqual({ kind: "no_open_session" });
    expect(store.state).toEqual(before);
  });

  it("refuses when the session has no open sale", () => {
    const store = ledger({ sales: [{ ...OPEN_SALE, state: "COMPLETED" }] });
    const before = structuredClone(store.state);

    expect(cancelFromLockedRegister(store)).toEqual({ kind: "no_open_sale" });
    expect(store.state).toEqual(before);
  });

  it("refuses a sale with an approved payment, changing nothing", () => {
    const store = ledger({ payments: [APPROVED_PAYMENT] });
    const before = structuredClone(store.state);

    expect(cancelFromLockedRegister(store)).toEqual({ kind: "has_approved_payment" });
    expect(store.state).toEqual(before);
  });

  it("leaves the sale open when discarding it fails", () => {
    const store = ledger();
    const before = structuredClone(store.state);
    store.failOn = "discardOpenSale";

    expect(() => cancelFromLockedRegister(store)).toThrow("discardOpenSale failed");
    expect(store.state).toEqual(before);
  });
});
