import { describe, expect, it } from "vitest";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../../fiscal/test-support/fictional-tax-identities.js";
import { type CashMovement, expectedCash } from "../../register/index.js";
import type { SaleWithLines } from "../model/sale.js";
import { chargeSaleByTransfer } from "./charge-sale-by-transfer.js";
import { chargeSaleInCash } from "./charge-sale-in-cash.js";
import {
  FakeSaleLedger,
  type FakeSaleLedgerState,
  type FakeSaleLedgerWrite,
  FixedClock,
  SequentialIds,
} from "./test-support/fake-sale-ledger.js";

const NOW = new Date("2026-09-30T12:34:56.789Z");
const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const SESSION = { id: "session-1", openedBy: "cashier" };
const TOTAL = 5900;
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
const OPENING: CashMovement = {
  id: "movement-0",
  sessionId: "session-1",
  type: "OPENING",
  amount: 10000,
  actorId: "cashier",
  occurredAt: new Date("2026-09-30T08:00:00.000Z"),
};
const THRESHOLD = { id: "threshold-1", amount: 10_000_000, validFrom: "2026-01-01" };
const BUYER_TAX_STATUSES = [{ code: 5, description: "Consumidor Final", invoiceClass: "A/M/C" }];

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    accesses: { cashier: CASHIER },
    identity: { registerId: "register-1", deviceId: "device-1" },
    session: SESSION,
    sales: [OPEN_SALE],
    issuerIdentifications: [ISSUER],
    thresholds: [THRESHOLD],
    buyerTaxStatusSets: [{ paramsVersion: 1, options: BUYER_TAX_STATUSES }],
    ...state,
  });
}

function charge(
  store: FakeSaleLedger,
  amount = TOTAL,
  saleId = "sale-1",
  actorId = "cashier",
  ids = new SequentialIds(),
) {
  return chargeSaleByTransfer(
    { ledger: store, clock: new FixedClock(NOW), ids },
    { actorId, saleId, amount },
  );
}

describe("chargeSaleByTransfer", () => {
  it("completes the sale and reports its total", () => {
    const store = ledger();

    expect(charge(store)).toEqual({ kind: "completed", saleId: "sale-1", total: TOTAL });
    expect(store.state.sales[0]?.state).toBe("COMPLETED");
    expect(store.transactions).toBe(1);
  });

  it("dates the sale with the moment it is charged, not with the moment its first product was added", () => {
    const store = ledger();

    charge(store);

    expect(store.state.sales[0]?.occurredAt).toEqual(NOW);
  });

  it("records one approved transfer of the whole total, authorized by whoever charged and confirmed now", () => {
    const store = ledger();

    charge(store);

    expect(store.state.payments).toEqual([
      {
        id: "id-1",
        saleId: "sale-1",
        kind: "SALE",
        method: "TRANSFER",
        provider: "NONE",
        amount: TOTAL,
        state: "APPROVED",
        occurredAt: NOW,
        authorizedBy: "cashier",
        confirmedAt: NOW,
      },
    ]);
  });

  it("charges the total with the line promotions applied, not the list prices", () => {
    const discounted = { ...OPEN_LINE, discountAmount: 1000, lineTotal: 4000 };
    const store = ledger({ sales: [{ ...OPEN_SALE, lines: [discounted] }] });

    expect(charge(store, 4000)).toMatchObject({ total: 4000 });
    expect(store.state.payments[0]).toMatchObject({ amount: 4000 });
  });

  it("records no cash movement", () => {
    const store = ledger();

    charge(store);

    expect(store.state.movements).toEqual([]);
  });

  it("appends the sale_completed event with the transfer and no cash movements", () => {
    const store = ledger();

    charge(store);

    expect(store.state.outbox).toEqual([
      {
        event_id: "id-2",
        aggregate_type: "Sale",
        aggregate_id: "sale-1",
        event_type: "sale_completed",
        schema_version: 2,
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
              method: "TRANSFER",
              provider: "NONE",
              amount: TOTAL,
              tendered: null,
              state: "APPROVED",
              occurred_at: NOW.toISOString(),
              authorized_by: "cashier",
              confirmed_at: NOW.toISOString(),
            },
          ],
          cash_movements: [],
        },
      },
    ]);
  });

  it("records the pre-emission gate outcome of the sale in the same transaction", () => {
    const store = ledger();

    charge(store);

    expect(store.state.preEmissionGates).toMatchObject([
      { saleId: "sale-1", evaluatedAt: NOW, outcome: { kind: "passed" } },
    ]);
    expect(store.state.outbox.map((event) => event.event_type)).toEqual(["sale_completed"]);
  });

  it("completes the sale when the gate fails and appends fiscal_gate_failed after sale_completed", () => {
    const store = ledger({ issuerIdentifications: [] });

    expect(charge(store)).toMatchObject({ kind: "completed", saleId: "sale-1" });
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
        event_id: "id-3",
        event_type: "fiscal_gate_failed",
        payload: { sale_id: "sale-1", reason: "issuer_identification_missing" },
      },
    ]);
  });

  it("is no longer the open sale once completed", () => {
    const store = ledger();

    charge(store);

    expect(charge(store)).toEqual({ kind: "no_open_sale" });
  });

  it("refuses a sale without lines", () => {
    const store = ledger({ sales: [{ ...OPEN_SALE, lines: [] }] });
    const before = structuredClone(store.state);

    expect(charge(store)).toEqual({ kind: "empty_sale" });
    expect(store.state).toEqual(before);
  });

  it("refuses a sale whose total is zero", () => {
    const store = ledger({
      sales: [{ ...OPEN_SALE, lines: [{ ...OPEN_LINE, discountAmount: 5000, lineTotal: 0 }] }],
    });
    const before = structuredClone(store.state);

    expect(charge(store)).toEqual({ kind: "zero_total" });
    expect(store.state).toEqual(before);
  });

  it("refuses a sale whose total reaches the threshold in effect, writing nothing and evaluating no gate", () => {
    const store = ledger({ thresholds: [{ ...THRESHOLD, amount: TOTAL }] });
    const before = structuredClone(store.state);

    expect(charge(store)).toEqual({
      kind: "reaches_buyer_identification_threshold",
      threshold: TOTAL,
    });
    expect(store.state).toEqual(before);
  });

  it("charges a sale whose total is one cent under the threshold in effect", () => {
    const store = ledger({ thresholds: [{ ...THRESHOLD, amount: TOTAL + 1 }] });

    expect(charge(store)).toMatchObject({ kind: "completed" });
  });

  it("refuses when no threshold is in effect, writing nothing", () => {
    const store = ledger({ thresholds: [] });
    const before = structuredClone(store.state);

    expect(charge(store)).toEqual({ kind: "no_buyer_identification_threshold" });
    expect(store.state).toEqual(before);
  });

  it("reads the threshold at the clock's Argentine day", () => {
    const store = ledger({
      thresholds: [
        { ...THRESHOLD, id: "old", amount: TOTAL, validFrom: "2026-01-01" },
        { ...THRESHOLD, id: "new", amount: TOTAL + 1, validFrom: "2026-09-30" },
      ],
    });

    expect(charge(store)).toMatchObject({ kind: "completed" });
  });

  it("reports a zero total before looking for a threshold", () => {
    const store = ledger({
      thresholds: [],
      sales: [{ ...OPEN_SALE, lines: [{ ...OPEN_LINE, discountAmount: 5000, lineTotal: 0 }] }],
    });

    expect(charge(store)).toEqual({ kind: "zero_total" });
  });

  it("refuses when the session has no open sale", () => {
    expect(charge(ledger({ sales: [] }))).toEqual({ kind: "no_open_sale" });
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

    expect(charge(store)).toEqual({ kind: "not_permitted" });
    expect(store.state).toEqual(before);
  });

  it("refuses when no cash session is open", () => {
    expect(charge(ledger({ session: undefined }))).toEqual({ kind: "no_open_session" });
  });

  it("evaluates no gate when the charge is refused", () => {
    const store = ledger({ issuerIdentifications: [], sales: [{ ...OPEN_SALE, lines: [] }] });

    charge(store);

    expect(store.state.preEmissionGates).toEqual([]);
    expect(store.state.outbox).toEqual([]);
  });

  it.each<FakeSaleLedgerWrite>([
    "recordPayment",
    "recordCompletedSale",
    "appendOutboxEvent",
    "recordPreEmissionGate",
  ])("leaves nothing behind when %s fails", (write) => {
    const store = ledger();
    const before = structuredClone(store.state);
    store.failOn = write;

    expect(() => charge(store)).toThrow("failed");
    expect(store.state).toEqual(before);
  });

  describe("when the amount is below the pending balance", () => {
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

    it("records the transfer of that amount, authorized by whoever charged and confirmed now", () => {
      const store = ledger();

      charge(store, PARTIAL);

      expect(store.state.payments).toEqual([
        {
          id: "id-1",
          saleId: "sale-1",
          kind: "SALE",
          method: "TRANSFER",
          provider: "NONE",
          amount: PARTIAL,
          state: "APPROVED",
          occurredAt: NOW,
          authorizedBy: "cashier",
          confirmedAt: NOW,
        },
      ]);
      expect(store.state.movements).toEqual([]);
    });

    it("appends no event and evaluates no gate", () => {
      const store = ledger({ issuerIdentifications: [] });

      charge(store, PARTIAL);

      expect(store.state.outbox).toEqual([]);
      expect(store.state.preEmissionGates).toEqual([]);
    });

    it("accepts the payment that covers the rest when a threshold at the total takes effect after the first payment", () => {
      const store = ledger();
      const ids = new SequentialIds();
      charge(store, PARTIAL, "sale-1", "cashier", ids);
      store.state.thresholds = [{ ...THRESHOLD, amount: TOTAL }];

      expect(charge(store, TOTAL - PARTIAL, "sale-1", "cashier", ids)).toEqual({
        kind: "completed",
        saleId: "sale-1",
        total: TOTAL,
      });
    });

    it("accepts a further partial payment when no threshold is in effect any more", () => {
      const store = ledger();
      const ids = new SequentialIds();
      charge(store, PARTIAL, "sale-1", "cashier", ids);
      store.state.thresholds = [];

      expect(charge(store, 1000, "sale-1", "cashier", ids)).toMatchObject({
        kind: "partially_paid",
        paid: PARTIAL + 1000,
      });
    });

    it("completes with both payments when a second transfer covers exactly what is pending", () => {
      const store = ledger();
      const ids = new SequentialIds();

      charge(store, PARTIAL, "sale-1", "cashier", ids);

      expect(charge(store, TOTAL - PARTIAL, "sale-1", "cashier", ids)).toEqual({
        kind: "completed",
        saleId: "sale-1",
        total: TOTAL,
      });
      expect(store.state.sales[0]?.state).toBe("COMPLETED");
      expect(store.state.outbox[0]?.payload).toMatchObject({
        payments: [
          { id: "id-1", method: "TRANSFER", amount: PARTIAL },
          { id: "id-2", method: "TRANSFER", amount: TOTAL - PARTIAL },
        ],
        cash_movements: [],
      });
    });

    it("completes with the cash payment, the transfer and the cash movements when a transfer covers what a partial cash payment left pending", () => {
      const store = ledger({ movements: [OPENING] });
      const ids = new SequentialIds();
      chargeSaleInCash(
        { ledger: store, clock: new FixedClock(NOW), ids },
        { actorId: "cashier", saleId: "sale-1", tendered: 2000 },
      );

      expect(charge(store, TOTAL - 2000, "sale-1", "cashier", ids)).toEqual({
        kind: "completed",
        saleId: "sale-1",
        total: TOTAL,
      });
      expect(store.state.outbox).toHaveLength(1);
      expect(store.state.outbox[0]?.payload).toMatchObject({
        payments: [
          { id: "id-1", method: "CASH", amount: 2000, tendered: 2000 },
          { id: "id-3", method: "TRANSFER", amount: 3900, tendered: null },
        ],
        cash_movements: [{ id: "id-2", type: "SALE", amount: 2000 }],
      });
    });

    it("leaves a cash session's expected cash alone", () => {
      const store = ledger({ movements: [OPENING] });
      const before = expectedCash(store.state.movements);

      charge(store, PARTIAL);

      expect(expectedCash(store.state.movements)).toBe(before);
    });

    it.each<FakeSaleLedgerWrite>(["recordPayment"])(
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
      "recordCompletedSale",
      "appendOutboxEvent",
      "recordPreEmissionGate",
    ])("leaves the earlier payment alone when %s fails on the covering one", (write) => {
      const store = ledger();
      const ids = new SequentialIds();
      charge(store, PARTIAL, "sale-1", "cashier", ids);
      const before = structuredClone(store.state);
      store.failOn = write;

      expect(() => charge(store, TOTAL - PARTIAL, "sale-1", "cashier", ids)).toThrow("failed");
      expect(store.state).toEqual(before);
    });
  });

  describe("when the amount is not payable", () => {
    it("refuses an amount above the pending balance with the pending balance and writes nothing", () => {
      const store = ledger();
      const before = structuredClone(store.state);

      expect(charge(store, TOTAL + 1)).toEqual({ kind: "exceeds_pending", pending: TOTAL });
      expect(store.state).toEqual(before);
    });

    it("measures the amount against what is still pending after an earlier payment", () => {
      const store = ledger();
      const ids = new SequentialIds();
      charge(store, 2000, "sale-1", "cashier", ids);
      const before = structuredClone(store.state);

      expect(charge(store, 3901, "sale-1", "cashier", ids)).toEqual({
        kind: "exceeds_pending",
        pending: 3900,
      });
      expect(store.state).toEqual(before);
    });

    it.each([0, -100, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
      "refuses the amount %s as invalid and writes nothing",
      (amount) => {
        const store = ledger();
        const before = structuredClone(store.state);

        expect(charge(store, amount)).toEqual({ kind: "invalid_amount" });
        expect(store.state).toEqual(before);
      },
    );

    it("evaluates no gate when the amount is refused", () => {
      const store = ledger({ issuerIdentifications: [] });

      charge(store, TOTAL + 1);

      expect(store.state.preEmissionGates).toEqual([]);
      expect(store.state.outbox).toEqual([]);
    });
  });
});
