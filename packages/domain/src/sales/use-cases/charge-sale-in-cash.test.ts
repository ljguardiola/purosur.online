import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../../fiscal/test-support/fictional-tax-identities.js";
import { type CashMovement, expectedCash } from "../../register/index.js";
import { MAX_CASH_AMOUNT_CENTS } from "../../shared/index.js";
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

const OPEN_LINE = OPEN_SALE.lines[0] as SaleWithLines["lines"][number];

const ISSUER = {
  legalName: FICTIONAL_LEGAL_NAME,
  grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
  activityStartDate: "2020-01-15",
  authorizedCuit: FICTIONAL_CUIT,
  taxStatus: "Condicion de prueba",
  version: 2,
};
const BUYER_TAX_STATUSES = [{ code: 5, description: "Consumidor Final", invoiceClass: "A/M/C" }];

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

const THRESHOLD = { id: "threshold-1", amount: 10_000_000, validFrom: "2026-01-01", revision: 0 };

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    thresholds: [THRESHOLD],
    accesses: { cashier: CASHIER },
    identity: IDENTITY,
    session: SESSION,
    sales: [OPEN_SALE],
    movements: [OPENING],
    issuerIdentifications: [ISSUER],
    buyerTaxStatusSets: [{ paramsVersion: 1, options: BUYER_TAX_STATUSES }],
    ...state,
  });
}

function charge(
  store: FakeSaleLedger,
  tendered: number,
  saleId = "sale-1",
  actorId = "cashier",
  ids = new SequentialIds(),
) {
  return chargeSaleInCash(
    { ledger: store, clock: new FixedClock(NOW), ids },
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

  it("dates the sale with the moment it is charged, not with the moment its first product was added", () => {
    const store = ledger();

    charge(store, 10000);

    expect(store.state.sales[0]?.occurredAt).toEqual(NOW);
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

    expect(charge(ledger({ sales: [DISCOUNTED_SALE] }), 1999)).toEqual({
      kind: "partially_paid",
      saleId: "sale-1",
      total: 2000,
      paid: 1999,
      pending: 1,
    });
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

  it("appends the sale_completed event with the sale, its total, its lines, its payment and its cash movements", () => {
    const store = ledger();

    charge(store, 10000);

    expect(store.state.outbox).toEqual([
      {
        event_id: "id-4",
        aggregate_type: "Sale",
        aggregate_id: "sale-1",
        event_type: "sale_completed",
        schema_version: 3,
        occurred_at: NOW.toISOString(),
        actor_id: "cashier",
        payload: {
          id: "sale-1",
          register_id: "register-1",
          device_id: "device-1",
          session_id: "session-1",
          actor_id: "cashier",
          occurred_at: NOW.toISOString(),
          total: TOTAL,
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
              occurred_at: NOW.toISOString(),
              authorized_by: null,
              confirmed_at: null,
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
          stock_movements: [
            { id: "id-5", sale_line_id: "line-1", product_id: "yerba", delta: -2000 },
            { id: "id-6", sale_line_id: "line-2", product_id: "fideos", delta: -1000 },
          ],
        },
      },
    ]);
  });

  it("records a stock movement of the sold quantity for each line, dated when the sale is charged", () => {
    const store = ledger();

    charge(store, 10000);

    expect(store.state.stockMovements).toEqual([
      { id: "id-5", saleLineId: "line-1", productId: "yerba", delta: -2000, occurredAt: NOW },
      { id: "id-6", saleLineId: "line-2", productId: "fideos", delta: -1000, occurredAt: NOW },
    ]);
  });

  it("subtracts the sold quantity from each product's balance in the same transaction, even below zero", () => {
    const store = ledger({ stockBalances: { yerba: 5000 } });

    charge(store, 10000);

    expect(store.transactions).toBe(1);
    expect(store.state.stockBalances).toEqual({ yerba: 3000, fideos: -1000 });
  });

  it("adds the quantities of two lines of the same product to one balance", () => {
    const [first, second] = OPEN_SALE.lines;
    if (first === undefined || second === undefined) {
      throw new Error("test setup: the sale has no lines");
    }
    const store = ledger({
      sales: [{ ...OPEN_SALE, lines: [first, { ...second, id: "line-9", productId: "yerba" }] }],
      stockBalances: { yerba: 5000 },
    });

    charge(store, 10000);

    expect(store.state.stockBalances).toEqual({ yerba: 2000 });
  });

  it("lists only the sale movement in the event when the tendered amount is exact", () => {
    const store = ledger();

    charge(store, TOTAL);

    expect(store.state.outbox[0]).toMatchObject({
      event_id: "id-3",
      payload: { cash_movements: [{ id: "id-2", type: "SALE", amount: TOTAL }] },
    });
  });

  it("records the pre-emission gate outcome of the sale it completed, in the same transaction", () => {
    const store = ledger();

    charge(store, 10000);

    expect(store.transactions).toBe(1);
    expect(store.state.preEmissionGates).toEqual([
      {
        saleId: "sale-1",
        evaluatedAt: NOW,
        outcome: {
          kind: "passed",
          document: {
            invoiceClass: "C",
            total: TOTAL,
            netAmount: TOTAL,
            vatAmount: 0,
            issuer: {
              legalName: FICTIONAL_LEGAL_NAME,
              cuit: FICTIONAL_CUIT,
              taxStatus: "Condicion de prueba",
              grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
              activityStartDate: "2020-01-15",
              version: 2,
            },
            buyerTaxStatusCode: 5,
          },
        },
      },
    ]);
    expect(store.state.outbox.map((event) => event.event_type)).toEqual(["sale_completed"]);
  });

  it("completes the sale when the gate fails and appends fiscal_gate_failed after sale_completed", () => {
    const store = ledger({ issuerIdentifications: [] });

    const outcome = charge(store, 10000);

    expect(outcome).toMatchObject({ kind: "completed", saleId: "sale-1" });
    expect(store.state.sales[0]?.state).toBe("COMPLETED");
    expect(store.state.preEmissionGates).toEqual([
      {
        saleId: "sale-1",
        evaluatedAt: NOW,
        outcome: { kind: "failed", reason: "issuer_identification_missing" },
      },
    ]);
    expect(store.state.outbox).toMatchObject([
      { event_type: "sale_completed" },
      {
        event_id: "id-7",
        aggregate_type: "Sale",
        aggregate_id: "sale-1",
        event_type: "fiscal_gate_failed",
        schema_version: 1,
        occurred_at: NOW.toISOString(),
        actor_id: "cashier",
        payload: {
          sale_id: "sale-1",
          register_id: "register-1",
          reason: "issuer_identification_missing",
          evaluated_at: NOW.toISOString(),
        },
      },
    ]);
  });

  it("decides how the sale is authorized exactly once, with the gate outcome, when it completes", () => {
    const store = ledger();

    charge(store, 10000);

    expect(store.state.authorizationDecisions).toEqual([
      {
        saleId: "sale-1",
        gate: store.state.preEmissionGates[0]?.outcome,
        decidedAt: NOW,
      },
    ]);
  });

  it("decides how the sale is authorized when the gate fails too", () => {
    const store = ledger({ issuerIdentifications: [] });

    charge(store, 10000);

    expect(store.state.authorizationDecisions).toEqual([
      {
        saleId: "sale-1",
        gate: { kind: "failed", reason: "issuer_identification_missing" },
        decidedAt: NOW,
      },
    ]);
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

  it("refuses a sale whose total is zero before looking at the amount, and records nothing", () => {
    const [yerba] = OPEN_SALE.lines;
    if (yerba === undefined) {
      throw new Error("test setup: the sale has no lines");
    }
    const store = ledger({
      sales: [{ ...OPEN_SALE, lines: [{ ...yerba, discountAmount: 5000, lineTotal: 0 }] }],
    });
    const before = structuredClone(store.state);

    expect(charge(store, 0)).toEqual({ kind: "zero_total" });
    expect(store.state).toEqual(before);
  });

  it("refuses a sale whose total reaches the threshold in effect, writing nothing", () => {
    const store = ledger({ thresholds: [{ ...THRESHOLD, amount: TOTAL }] });
    const before = structuredClone(store.state);

    expect(charge(store, TOTAL)).toEqual({
      kind: "reaches_buyer_identification_threshold",
      threshold: TOTAL,
    });
    expect(store.state).toEqual(before);
  });

  it("charges a sale whose total is one cent under the threshold in effect", () => {
    const store = ledger({ thresholds: [{ ...THRESHOLD, amount: TOTAL + 1 }] });

    expect(charge(store, TOTAL)).toEqual(expect.objectContaining({ kind: "completed" }));
  });

  it("refuses when no threshold is in effect, writing nothing", () => {
    const store = ledger({ thresholds: [] });
    const before = structuredClone(store.state);

    expect(charge(store, TOTAL)).toEqual({ kind: "no_buyer_identification_threshold" });
    expect(store.state).toEqual(before);
  });

  it("reads the threshold at the clock's Argentine day", () => {
    const store = ledger({
      thresholds: [
        { id: "old", amount: 1, validFrom: "2026-01-01", revision: 0 },
        { id: "new", amount: 10_000_000, validFrom: "2026-09-30", revision: 0 },
      ],
    });

    expect(charge(store, TOTAL)).toEqual(expect.objectContaining({ kind: "completed" }));
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

  it.each<{ name: string; state: Partial<FakeSaleLedgerState>; tendered: number; saleId?: string }>(
    [
      { name: "not permitted", state: { accesses: {} }, tendered: TOTAL },
      { name: "no open session", state: { session: undefined }, tendered: TOTAL },
      { name: "no open sale", state: { sales: [] }, tendered: TOTAL },
      { name: "another sale", state: {}, tendered: TOTAL, saleId: "sale-2" },
      { name: "empty sale", state: { sales: [{ ...OPEN_SALE, lines: [] }] }, tendered: TOTAL },
      {
        name: "zero total",
        state: {
          sales: [{ ...OPEN_SALE, lines: [{ ...OPEN_LINE, discountAmount: 5000, lineTotal: 0 }] }],
        },
        tendered: TOTAL,
      },
      { name: "invalid amount", state: {}, tendered: 0 },
      { name: "partial payment", state: {}, tendered: TOTAL - 1 },
    ],
  )("evaluates no gate when the charge is refused: $name", ({ state, tendered, saleId }) => {
    const store = ledger({ issuerIdentifications: [], ...state });

    const outcome = charge(store, tendered, saleId);

    expect(outcome.kind).not.toBe("completed");
    expect(store.state.preEmissionGates).toEqual([]);
    expect(store.state.authorizationDecisions).toEqual([]);
    expect(store.state.outbox).toEqual([]);
  });

  it.each<FakeSaleLedgerWrite>([
    "recordPayment",
    "recordCashMovement",
    "recordSaleStockMovement",
    "addToStockBalance",
    "recordCompletedSale",
    "appendOutboxEvent",
    "recordPreEmissionGate",
    "decideSaleAuthorization",
  ])("leaves nothing behind when %s fails", (write) => {
    const store = ledger();
    const before = structuredClone(store.state);
    store.failOn = write;

    expect(() => charge(store, 10000)).toThrow(` failed`);
    expect(store.state).toEqual(before);
  });

  describe("when the tendered amount is below the total", () => {
    const PARTIAL = 2000;

    it("leaves the sale open and reports what is paid and what is pending", () => {
      const store = ledger();

      expect(charge(store, PARTIAL)).toEqual({
        kind: "partially_paid",
        saleId: "sale-1",
        total: TOTAL,
        paid: PARTIAL,
        pending: TOTAL - PARTIAL,
      });
      expect(store.state.sales[0]?.state).toBe("OPEN");
      expect(store.transactions).toBe(1);
    });

    it("records an approved cash payment of the tendered amount and the cash collected against the sale", () => {
      const store = ledger();

      charge(store, PARTIAL);

      expect(store.state.payments).toEqual([
        {
          id: "id-1",
          saleId: "sale-1",
          kind: "SALE",
          method: "CASH",
          provider: "NONE",
          amount: PARTIAL,
          tendered: PARTIAL,
          state: "APPROVED",
          occurredAt: NOW,
        },
      ]);
      expect(store.state.movements.slice(1)).toEqual([
        {
          id: "id-2",
          sessionId: "session-1",
          type: "SALE",
          amount: PARTIAL,
          actorId: "cashier",
          occurredAt: NOW,
          ref: { type: "sale", id: "sale-1" },
        },
      ]);
    });

    it("appends no event and evaluates no gate", () => {
      const store = ledger({ issuerIdentifications: [] });

      charge(store, PARTIAL);

      expect(store.state.outbox).toEqual([]);
      expect(store.state.preEmissionGates).toEqual([]);
      expect(store.state.authorizationDecisions).toEqual([]);
      expect(store.state.sales[0]?.occurredAt).toBeUndefined();
    });

    it("keeps the sale chargeable for what is pending", () => {
      const store = ledger();
      const ids = new SequentialIds();

      charge(store, PARTIAL, "sale-1", "cashier", ids);

      expect(charge(store, TOTAL, "sale-1", "cashier", ids)).toEqual({
        kind: "completed",
        saleId: "sale-1",
        total: TOTAL,
        tendered: TOTAL,
        change: 2000,
      });
    });

    it("accepts the payment that covers the rest when a threshold at the total takes effect after the first payment", () => {
      const store = ledger();
      const ids = new SequentialIds();
      charge(store, PARTIAL, "sale-1", "cashier", ids);
      store.state.thresholds = [{ ...THRESHOLD, amount: TOTAL }];

      expect(charge(store, TOTAL, "sale-1", "cashier", ids)).toMatchObject({
        kind: "completed",
        saleId: "sale-1",
      });
    });

    it("reports the running balance after a second partial payment", () => {
      const store = ledger();
      const ids = new SequentialIds();

      charge(store, 2000, "sale-1", "cashier", ids);

      expect(charge(store, 1000, "sale-1", "cashier", ids)).toEqual({
        kind: "partially_paid",
        saleId: "sale-1",
        total: TOTAL,
        paid: 3000,
        pending: 2900,
      });
    });

    it("completes with both payments and every cash movement in the event when a second payment covers the rest", () => {
      const store = ledger();
      const ids = new SequentialIds();

      charge(store, 2000, "sale-1", "cashier", ids);
      const outcome = charge(store, 5000, "sale-1", "cashier", ids);

      expect(outcome).toEqual({
        kind: "completed",
        saleId: "sale-1",
        total: TOTAL,
        tendered: 5000,
        change: 1100,
      });
      expect(store.state.payments.map((payment) => [payment.amount, payment.tendered])).toEqual([
        [2000, 2000],
        [3900, 5000],
      ]);
      expect(store.state.outbox).toHaveLength(1);
      expect(store.state.outbox[0]?.payload).toMatchObject({
        total: TOTAL,
        payments: [
          { id: "id-1", amount: 2000, tendered: 2000 },
          { id: "id-3", amount: 3900, tendered: 5000 },
        ],
        cash_movements: [
          { id: "id-2", type: "SALE", amount: 2000 },
          { id: "id-4", type: "SALE", amount: 5000 },
          { id: "id-5", type: "CHANGE", amount: 1100 },
        ],
      });
      expect(store.state.preEmissionGates).toHaveLength(1);
      expect(store.state.authorizationDecisions).toHaveLength(1);
    });

    it("raises the session's expected cash by exactly what the cash payments applied", () => {
      const store = ledger();
      const ids = new SequentialIds();
      const before = expectedCash(store.state.movements);

      charge(store, 2000, "sale-1", "cashier", ids);
      expect(expectedCash(store.state.movements) - before).toBe(2000);
      charge(store, 9000, "sale-1", "cashier", ids);

      expect(expectedCash(store.state.movements) - before).toBe(TOTAL);
    });

    it("applies the tendered amount and leaves the rest pending for every amount below the total", () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: TOTAL - 1 }), (tendered) => {
          const store = ledger();
          const before = expectedCash(store.state.movements);

          expect(charge(store, tendered)).toEqual({
            kind: "partially_paid",
            saleId: "sale-1",
            total: TOTAL,
            paid: tendered,
            pending: TOTAL - tendered,
          });
          expect(expectedCash(store.state.movements) - before).toBe(tendered);
        }),
      );
    });

    it("records no stock movement and leaves the balances alone", () => {
      const store = ledger({ stockBalances: { yerba: 5000 } });

      charge(store, PARTIAL);

      expect(store.state.stockMovements).toEqual([]);
      expect(store.state.stockBalances).toEqual({ yerba: 5000 });
    });

    it.each<FakeSaleLedgerWrite>(["recordPayment", "recordCashMovement"])(
      "leaves nothing behind when %s fails",
      (write) => {
        const store = ledger();
        const before = structuredClone(store.state);
        store.failOn = write;

        expect(() => charge(store, PARTIAL)).toThrow("failed");
        expect(store.state).toEqual(before);
      },
    );

    it.each<FakeSaleLedgerWrite>([
      "recordPayment",
      "recordCashMovement",
      "recordCompletedSale",
      "appendOutboxEvent",
      "recordPreEmissionGate",
    ])("leaves the earlier payment alone when %s fails on the covering one", (write) => {
      const store = ledger();
      const ids = new SequentialIds();
      charge(store, 2000, "sale-1", "cashier", ids);
      const before = structuredClone(store.state);
      store.failOn = write;

      expect(() => charge(store, 4000, "sale-1", "cashier", ids)).toThrow("failed");
      expect(store.state).toEqual(before);
    });
  });
});
