import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type CashMovement, expectedCash, MAX_CASH_AMOUNT_CENTS } from "../../register/index.js";
import type { SaleWithLines } from "../model/sale.js";
import { chargeSaleInCash } from "./charge-sale-in-cash.js";
import {
  FakeSaleLedger,
  type FakeSaleLedgerState,
  type FakeSaleLedgerWrite,
  FixedClock,
  SequentialIds,
} from "./test-support/fake-sale-ledger.js";

const NOW = new Date("2026-09-30T12:34:56.789Z");
const STARTED = new Date("2026-09-30T12:00:00.000Z");
const IDENTITY = { registerId: "register-1", deviceId: "device-1" };
const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const SESSION = { id: "session-1", openedBy: "cashier" };
const TOTAL = 5900;
const OPENING: CashMovement = {
  id: "movement-0",
  sessionId: "session-1",
  type: "OPENING",
  amount: 10000,
  actorId: "cashier",
  occurredAt: new Date("2026-09-30T08:00:00.000Z"),
};
const OPEN_SALE: SaleWithLines = {
  id: "sale-1",
  registerId: "register-1",
  deviceId: "device-1",
  sessionId: "session-1",
  actorId: "cashier",
  state: "OPEN",
  occurredAt: STARTED,
  lines: [
    {
      id: "line-1",
      productId: "yerba",
      productName: "Yerba 1 kg",
      quantity: 2,
      listUnitPrice: 2500,
      priceListId: "list-1",
      promotions: [],
      promotionId: null,
      discountAmount: 0,
      lineTotal: 5000,
    },
    {
      id: "line-2",
      productId: "fideos",
      productName: "Fideos",
      quantity: 1,
      listUnitPrice: 900,
      priceListId: "list-1",
      promotions: [],
      promotionId: null,
      discountAmount: 0,
      lineTotal: 900,
    },
  ],
};

const DISCOUNTED_SALE: SaleWithLines = {
  ...OPEN_SALE,
  lines: [
    {
      id: "line-3",
      productId: "fideos",
      productName: "Fideos",
      quantity: 3,
      listUnitPrice: 1000,
      priceListId: "list-1",
      promotions: [
        { id: "d-percent", benefit: { kind: "PERCENT_OFF", percent: 10 } },
        { id: "d-3x2", benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 } },
      ],
      promotionId: "d-3x2",
      discountAmount: 1000,
      lineTotal: 2000,
    },
  ],
};

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    accesses: { cashier: CASHIER },
    identity: IDENTITY,
    session: SESSION,
    sales: [OPEN_SALE],
    movements: [OPENING],
    ...state,
  });
}

function charge(store: FakeSaleLedger, tendered: number, saleId = "sale-1", actorId = "cashier") {
  return chargeSaleInCash(
    { ledger: store, clock: new FixedClock(NOW), ids: new SequentialIds() },
    { actorId, saleId, tendered },
  );
}

describe("chargeSaleInCash", () => {
  it("completes the sale and reports the change when the tendered amount exceeds the total", () => {
    const store = ledger();

    const outcome = charge(store, 10000);

    expect(outcome).toEqual({
      kind: "completed",
      saleId: "sale-1",
      total: TOTAL,
      tendered: 10000,
      change: 4100,
    });
    expect(store.state.sales[0]?.state).toBe("COMPLETED");
  });

  it("records an approved cash payment of the total with the tendered amount", () => {
    const store = ledger();

    charge(store, 10000);

    expect(store.state.payments).toEqual([
      {
        id: "id-1",
        saleId: "sale-1",
        kind: "SALE",
        method: "CASH",
        provider: "NONE",
        amount: TOTAL,
        tendered: 10000,
        state: "APPROVED",
        occurredAt: NOW,
      },
    ]);
  });

  it("records the cash collected and the change given against the sale and the session", () => {
    const store = ledger();

    charge(store, 10000);

    expect(store.state.movements.slice(1)).toEqual([
      {
        id: "id-2",
        sessionId: "session-1",
        type: "SALE",
        amount: 10000,
        actorId: "cashier",
        occurredAt: NOW,
        ref: { type: "sale", id: "sale-1" },
      },
      {
        id: "id-3",
        sessionId: "session-1",
        type: "CHANGE",
        amount: 4100,
        actorId: "cashier",
        occurredAt: NOW,
        ref: { type: "sale", id: "sale-1" },
      },
    ]);
  });

  it("gives no change and records no change movement when the tendered amount is exact", () => {
    const store = ledger();

    const outcome = charge(store, TOTAL);

    expect(outcome).toEqual({
      kind: "completed",
      saleId: "sale-1",
      total: TOTAL,
      tendered: TOTAL,
      change: 0,
    });
    expect(store.state.movements.slice(1).map((movement) => movement.type)).toEqual(["SALE"]);
    expect(store.state.payments[0]).toMatchObject({ amount: TOTAL, tendered: TOTAL });
  });

  it("charges the total with the line promotions applied, not the list prices", () => {
    const store = ledger({ sales: [DISCOUNTED_SALE] });

    expect(charge(store, 1999)).toEqual({ kind: "insufficient_cash", amountDue: 2000 });
    expect(charge(store, 2500)).toEqual({
      kind: "completed",
      saleId: "sale-1",
      total: 2000,
      tendered: 2500,
      change: 500,
    });
    expect(store.state.payments[0]).toMatchObject({ amount: 2000, tendered: 2500 });
  });

  it("appends each line's frozen promotions and the discount it charged to the sale_completed event", () => {
    const store = ledger({ sales: [DISCOUNTED_SALE] });

    charge(store, 2000);

    expect(store.state.outbox[0]?.payload).toMatchObject({
      lines: [
        {
          id: "line-3",
          list_unit_price: 1000,
          promotion_id: "d-3x2",
          discount_amount: 1000,
          promotions: [
            {
              discount_id: "d-percent",
              kind: "PERCENT_OFF",
              percent: 10,
              buy_qty: null,
              pay_qty: null,
            },
            { discount_id: "d-3x2", kind: "BUY_N_PAY_M", percent: null, buy_qty: 3, pay_qty: 2 },
          ],
          line_total: 2000,
        },
      ],
    });
  });

  it("does everything in one transaction", () => {
    const store = ledger();

    charge(store, 10000);

    expect(store.transactions).toBe(1);
  });

  it("appends the sale_completed event with the sale, its lines, its payment and its cash movements", () => {
    const store = ledger();

    charge(store, 10000);

    expect(store.state.outbox).toEqual([
      {
        event_id: "id-4",
        aggregate_type: "Sale",
        aggregate_id: "sale-1",
        event_type: "sale_completed",
        schema_version: 1,
        occurred_at: NOW.toISOString(),
        actor_id: "cashier",
        payload: {
          id: "sale-1",
          register_id: "register-1",
          device_id: "device-1",
          session_id: "session-1",
          actor_id: "cashier",
          occurred_at: STARTED.toISOString(),
          completed_at: NOW.toISOString(),
          lines: [
            {
              id: "line-1",
              product_id: "yerba",
              product_name: "Yerba 1 kg",
              quantity: 2,
              list_unit_price: 2500,
              price_list_id: "list-1",
              promotion_id: null,
              discount_amount: 0,
              promotions: [],
              line_total: 5000,
            },
            {
              id: "line-2",
              product_id: "fideos",
              product_name: "Fideos",
              quantity: 1,
              list_unit_price: 900,
              price_list_id: "list-1",
              promotion_id: null,
              discount_amount: 0,
              promotions: [],
              line_total: 900,
            },
          ],
          payments: [
            {
              id: "id-1",
              kind: "SALE",
              method: "CASH",
              provider: "NONE",
              amount: TOTAL,
              tendered: 10000,
              state: "APPROVED",
            },
          ],
          cash_movements: [
            {
              id: "id-2",
              type: "SALE",
              amount: 10000,
              ref_type: "sale",
              ref_id: "sale-1",
              actor_id: "cashier",
              occurred_at: NOW.toISOString(),
            },
            {
              id: "id-3",
              type: "CHANGE",
              amount: 4100,
              ref_type: "sale",
              ref_id: "sale-1",
              actor_id: "cashier",
              occurred_at: NOW.toISOString(),
            },
          ],
        },
      },
    ]);
  });

  it("lists only the sale movement in the event when the tendered amount is exact", () => {
    const store = ledger();

    charge(store, TOTAL);

    expect(store.state.outbox[0]).toMatchObject({
      event_id: "id-3",
      payload: { cash_movements: [{ id: "id-2", type: "SALE", amount: TOTAL }] },
    });
  });

  it("is no longer the open sale once completed", () => {
    const store = ledger();

    charge(store, TOTAL);

    expect(charge(store, TOTAL)).toEqual({ kind: "no_open_sale" });
  });

  it("raises the session's expected cash by exactly the total", () => {
    const store = ledger();
    const before = expectedCash(store.state.movements);

    charge(store, 10000);

    expect(expectedCash(store.state.movements) - before).toBe(TOTAL);
  });

  it("raises the session's expected cash by the total for every covering tendered amount", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), (extra) => {
        const store = ledger();
        const before = expectedCash(store.state.movements);

        const outcome = charge(store, TOTAL + extra);

        expect(outcome).toMatchObject({ kind: "completed", change: extra });
        expect(expectedCash(store.state.movements) - before).toBe(TOTAL);
      }),
    );
  });

  it("refuses a tendered amount below the total and carries the amount due", () => {
    const store = ledger();
    const before = structuredClone(store.state);

    expect(charge(store, TOTAL - 1)).toEqual({ kind: "insufficient_cash", amountDue: TOTAL });
    expect(store.state).toEqual(before);
  });

  it.each([0, -100, 0.5, Number.NaN, MAX_CASH_AMOUNT_CENTS + 1])(
    "refuses the tendered amount %s as invalid and records nothing",
    (tendered) => {
      const store = ledger();
      const before = structuredClone(store.state);

      expect(charge(store, tendered)).toEqual({ kind: "invalid_amount" });
      expect(store.state).toEqual(before);
    },
  );

  it("refuses a sale without lines", () => {
    const store = ledger({ sales: [{ ...OPEN_SALE, lines: [] }] });
    const before = structuredClone(store.state);

    expect(charge(store, 1000)).toEqual({ kind: "empty_sale" });
    expect(store.state).toEqual(before);
  });

  it("refuses when the session has no open sale", () => {
    const store = ledger({ sales: [] });

    expect(charge(store, TOTAL)).toEqual({ kind: "no_open_sale" });
  });

  it("refuses when the open sale is a different one than the cashier is looking at", () => {
    const store = ledger();
    const before = structuredClone(store.state);

    expect(charge(store, TOTAL, "sale-2")).toEqual({ kind: "no_open_sale" });
    expect(store.state).toEqual(before);
  });

  it("refuses a user who cannot sell and charge", () => {
    const store = ledger({ accesses: { cashier: { isAdministrator: false, permissionKeys: [] } } });
    const before = structuredClone(store.state);

    expect(charge(store, TOTAL)).toEqual({ kind: "not_permitted" });
    expect(store.state).toEqual(before);
  });

  it("refuses when no cash session is open", () => {
    const store = ledger({ session: undefined });

    expect(charge(store, TOTAL)).toEqual({ kind: "no_open_session" });
  });

  it.each<FakeSaleLedgerWrite>([
    "recordPayment",
    "recordCashMovement",
    "recordCompletedSale",
    "appendOutboxEvent",
  ])("leaves nothing behind when %s fails", (write) => {
    const store = ledger();
    const before = structuredClone(store.state);
    store.failOn = write;

    expect(() => charge(store, 10000)).toThrow(` failed`);
    expect(store.state).toEqual(before);
  });
});
