import { describe, expect, it } from "vitest";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../../fiscal/test-support/fictional-tax-identities.js";
import type { SaleWithLines } from "../model/sale.js";
import { chargeSaleByTransfer } from "./charge-sale-by-transfer.js";
import {
  FakeSaleLedger,
  type FakeSaleLedgerState,
  type FakeSaleLedgerWrite,
  FixedClock,
  SequentialIds,
} from "./test-support/fake-sale-ledger.js";

const NOW = new Date("2026-09-30T12:34:56.789Z");
const STARTED = new Date("2026-09-30T12:00:00.000Z");
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
const OPEN_LINE = OPEN_SALE.lines[0] as SaleWithLines["lines"][number];
const ISSUER = {
  legalName: FICTIONAL_LEGAL_NAME,
  grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
  activityStartDate: "2020-01-15",
  authorizedCuit: FICTIONAL_CUIT,
  taxStatus: "Condicion de prueba",
  version: 2,
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

function charge(store: FakeSaleLedger, saleId = "sale-1", actorId = "cashier") {
  return chargeSaleByTransfer(
    { ledger: store, clock: new FixedClock(NOW), ids: new SequentialIds() },
    { actorId, saleId },
  );
}

describe("chargeSaleByTransfer", () => {
  it("completes the sale and reports its total", () => {
    const store = ledger();

    expect(charge(store)).toEqual({ kind: "completed", saleId: "sale-1", total: TOTAL });
    expect(store.state.sales[0]?.state).toBe("COMPLETED");
    expect(store.transactions).toBe(1);
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

    expect(charge(store)).toMatchObject({ total: 4000 });
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

    expect(charge(store, "sale-2")).toEqual({ kind: "no_open_sale" });
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
});
