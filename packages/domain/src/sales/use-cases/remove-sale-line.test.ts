import { PENDING_QR_TRANSACTION } from "@purosur/domain/payments/test-support";
import { describe, expect, it } from "vitest";
import type { SalePayment } from "../../payments/index.js";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import type { SaleWithLines } from "../model/sale.js";
import { removeSaleLine } from "./remove-sale-line.js";
import {
  FakeSaleLedger,
  type FakeSaleLedgerState,
  FixedClock,
  SequentialIds,
} from "./test-support/fake-sale-ledger.js";
import { TEN_PERCENT_SALE_DISCOUNT } from "./test-support/sale-discounts.js";

const NOW = new Date("2026-09-30T12:34:56.789Z");

function pendingQrEndingAt(waitEndsAt: Date) {
  return {
    ...PENDING_QR_TRANSACTION,
    id: "qr-1",
    saleId: "sale-1",
    amount: 1000,
    occurredAt: new Date(waitEndsAt.getTime() - 180_000),
    waitEndsAt,
  };
}
const IN_ITS_WAIT = pendingQrEndingAt(new Date(NOW.getTime() + 60_000));
const WAIT_ENDED = pendingQrEndingAt(new Date(NOW.getTime() - 1));
const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const SESSION = { id: "session-1", openedBy: "cashier" };
const YERBA_LINE = {
  id: "line-1",
  productId: "yerba",
  productName: "Yerba 1 kg",
  saleUnit: "UNIT" as const,
  weightSource: null,
  quantity: 3,
  listUnitPrice: 2500,
  priceListId: "list-1",
  promotions: [],
  manualAdjustment: null,
  promotionId: "ten",
  discountAmount: 750,
  lineTotal: 6750,
};
const AZUCAR_LINE = {
  ...YERBA_LINE,
  id: "line-2",
  productId: "azucar",
  productName: "Azucar",
  saleUnit: "UNIT" as const,
  weightSource: null,
  quantity: 1,
  listUnitPrice: 1200,
  manualAdjustment: null,
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
  saleDiscount: null,
  lines: [YERBA_LINE, AZUCAR_LINE],
};

const PAYMENT: SalePayment = {
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

const THRESHOLD = { id: "threshold-1", amount: 10_000_000, validFrom: "2026-01-01", revision: 0 };

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
  return removeSaleLine(
    {
      zoneRules: new FakeZoneRulesSource(),
      ledger: store,
      restoration: store.restoration,
      clock: new FixedClock(NOW),
      ids: new SequentialIds(),
    },
    { actorId, lineId },
  );
}

const YERBA_LINE_RECORD = {
  id: "line-1",
  product_id: "yerba",
  product_name: "Yerba 1 kg",
  weight_source: null,
  manual_adjustment: null,
  quantity: 3,
  list_unit_price: 2500,
  price_list_id: "list-1",
  promotion_id: "ten",
  discount_amount: 750,
  promotions: [],
  sale_discount_share: 0,
  line_total: 6750,
};

function removedEvent(line: Record<string, unknown>, id = "line-1") {
  return {
    event_id: "id-1",
    aggregate_type: "SaleLine",
    aggregate_id: id,
    event_type: "sale_line_removed",
    schema_version: 1,
    payload: {
      sale_id: "sale-1",
      register_id: "register-1",
      device_id: "device-1",
      session_id: "session-1",
      actor_id: "cashier",
      occurred_at: NOW.toISOString(),
      line: { ...line, id },
    },
    occurred_at: NOW.toISOString(),
    actor_id: "cashier",
  };
}

describe("removeSaleLine", () => {
  it("takes the line out of the sale, recording only its sale_line_removed event", () => {
    const store = ledger();
    const before = structuredClone(store.state);

    const outcome = remove(store, "line-1");

    expect(outcome).toEqual({
      kind: "removed",
      removedSaleDiscount: false,
      sale: { ...OPEN_SALE, lines: [AZUCAR_LINE] },
      balance: { paid: 0, pending: 1200 },
      linesLock: null,
      cancellable: true,
      cancelRefusal: null,
      refundsOnCancel: [],
      mercadoPagoChargeInProgress: null,
    });
    expect(store.state).toEqual({
      ...before,
      sales: [{ ...OPEN_SALE, lines: [AZUCAR_LINE] }],
      outbox: [removedEvent(YERBA_LINE_RECORD)],
    });
    expect(store.transactions).toBe(1);
  });

  it("records the line under the actor who removes it, not the one who opened the sale", () => {
    const store = ledger({
      accesses: { cashier: CASHIER },
      sales: [{ ...OPEN_SALE, actorId: "former" }],
    });

    remove(store, "line-1");

    expect(store.state.outbox).toEqual([removedEvent(YERBA_LINE_RECORD)]);
  });

  it("records the removal as a fact of the removed line, not of the sale it was removed from", () => {
    const store = ledger();

    remove(store, "line-1");

    expect(store.state.outbox).toEqual([
      expect.objectContaining({ aggregate_type: "SaleLine", aggregate_id: "line-1" }),
    ]);
  });

  it("records a line sold by weight with where its weight came from", () => {
    const weighed = {
      ...AZUCAR_LINE,
      saleUnit: "KG" as const,
      weightSource: "SCALE" as const,
      quantity: 1250,
    };
    const store = ledger({ sales: [{ ...OPEN_SALE, lines: [YERBA_LINE, weighed] }] });

    remove(store, "line-2");

    expect(store.state.outbox).toEqual([
      removedEvent(
        {
          ...YERBA_LINE_RECORD,
          product_id: "azucar",
          product_name: "Azucar",
          weight_source: "SCALE",
          quantity: 1250,
          list_unit_price: 1200,
          promotion_id: null,
          discount_amount: 0,
          line_total: 1200,
        },
        "line-2",
      ),
    ]);
  });

  it("records a line with its manual adjustment and promotions", () => {
    const adjusted = {
      ...YERBA_LINE,
      promotions: [
        {
          id: "ten",
          name: "Diez por ciento",
          benefit: { kind: "PERCENT_OFF" as const, percent: 10 },
        },
      ],
      manualAdjustment: {
        kind: "PERCENT" as const,
        percent: 5,
        reason: "Producto golpeado",
        authorizedBy: "supervisor",
      },
    };
    const store = ledger({ sales: [{ ...OPEN_SALE, lines: [adjusted, AZUCAR_LINE] }] });

    remove(store, "line-1");

    expect(store.state.outbox).toEqual([
      removedEvent({
        ...YERBA_LINE_RECORD,
        promotions: [
          { discount_id: "ten", kind: "PERCENT_OFF", percent: 10, buy_qty: null, pay_qty: null },
        ],
        manual_adjustment: {
          kind: "PERCENT",
          value: 5,
          reason: "Producto golpeado",
          authorized_by: "supervisor",
        },
      }),
    ]);
  });

  it("records one event per line removed", () => {
    const store = ledger();

    remove(store, "line-1");
    remove(store, "line-2");

    expect(store.state.outbox.map((event) => event.aggregate_id)).toEqual(["line-1", "line-2"]);
    expect(store.state.outbox.map((event) => event.event_type)).toEqual([
      "sale_line_removed",
      "sale_line_removed",
    ]);
  });

  it("answers that it is unavailable while the outbox is not ready, leaving everything as it was", () => {
    const store = ledger({ outboxReady: false });
    const before = structuredClone(store.state);

    expect(remove(store, "line-1")).toEqual({ kind: "unavailable" });
    expect(store.state).toEqual(before);
  });

  it("answers the refusals of the sale before the outbox is looked at", () => {
    const store = ledger({ outboxReady: false });

    expect(remove(store, "line-9")).toEqual({ kind: "unknown_line" });
  });

  it("records nothing and keeps the line when appending the event fails", () => {
    const store = ledger();
    const before = structuredClone(store.state);
    store.failOn = "appendOutboxEvent";

    expect(() => remove(store, "line-1")).toThrow("appendOutboxEvent failed");
    expect(store.state).toEqual(before);
  });

  it("keeps the sale open when its last line goes", () => {
    const store = ledger({ sales: [{ ...OPEN_SALE, lines: [AZUCAR_LINE] }] });

    const outcome = remove(store, "line-2");

    expect(outcome).toEqual({
      kind: "removed",
      removedSaleDiscount: false,
      sale: { ...OPEN_SALE, lines: [] },
      balance: { paid: 0, pending: 0 },
      linesLock: null,
      cancellable: true,
      cancelRefusal: null,
      refundsOnCancel: [],
      mercadoPagoChargeInProgress: null,
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

describe("removeSaleLine while a QR charge of the sale is in its wait", () => {
  it("refuses to remove a line, writing nothing", () => {
    const store = ledger({ pendingMercadoPagoPayments: [IN_ITS_WAIT] });
    const before = structuredClone(store.state);

    expect(remove(store, "line-1")).toEqual({ kind: "sale_has_payments" });
    expect(store.state).toEqual(before);
  });

  it("removes it again once the wait has ended", () => {
    const store = ledger({ pendingMercadoPagoPayments: [WAIT_ENDED] });

    expect(remove(store, "line-1")).toMatchObject({ kind: "removed" });
  });
});

describe("removeSaleLine on a sale with a discount on the total", () => {
  it("removes the discount and tells so", () => {
    const store = ledger({ sales: [{ ...OPEN_SALE, saleDiscount: TEN_PERCENT_SALE_DISCOUNT }] });

    const outcome = remove(store, "line-1");

    expect(store.state.sales[0]?.saleDiscount).toBeNull();
    expect(store.state.outbox).toEqual([removedEvent(YERBA_LINE_RECORD)]);
    expect(outcome).toEqual(
      expect.objectContaining({
        kind: "removed",
        removedSaleDiscount: true,
        sale: expect.objectContaining({ saleDiscount: null }),
        balance: { paid: 0, pending: 1200 },
      }),
    );
  });

  it("keeps the discount when the line is unknown", () => {
    const store = ledger({ sales: [{ ...OPEN_SALE, saleDiscount: TEN_PERCENT_SALE_DISCOUNT }] });

    const outcome = remove(store, "nowhere");

    expect(outcome).toEqual({ kind: "unknown_line" });
    expect(store.state.sales[0]?.saleDiscount).toEqual(TEN_PERCENT_SALE_DISCOUNT);
  });
});
