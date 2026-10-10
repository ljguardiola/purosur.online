import { PENDING_QR_TRANSACTION } from "@purosur/domain/payments/test-support";
import { describe, expect, it } from "vitest";
import type { PendingQrSalePayment } from "../../payments/index.js";
import type { SaleWithLines } from "../model/sale.js";
import { replacePendingQrPayment } from "./replace-pending-qr-payment.js";
import {
  FakeSaleLedger,
  type FakeSaleLedgerState,
  type FakeSaleLedgerWrite,
  SequentialIds,
} from "./test-support/fake-sale-ledger.js";

const STARTED_AT = new Date("2026-10-09T12:00:00.000Z");
const REPLACED_AT = new Date("2026-10-09T12:01:30.000Z");
const WAIT_ENDS_AT = new Date("2026-10-09T12:03:00.000Z");
const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const SESSION = { id: "session-1", openedBy: "cashier" };
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
      saleUnit: "UNIT" as const,
      weightSource: null,
      quantity: 2,
      listUnitPrice: 2500,
      priceListId: "list-1",
      promotions: [],
      promotionId: null,
      discountAmount: 0,
      lineTotal: 5000,
    },
  ],
};

function pendingQr(waitEndsAt = WAIT_ENDS_AT): PendingQrSalePayment {
  return {
    ...PENDING_QR_TRANSACTION,
    id: "qr-1",
    saleId: "sale-1",
    amount: 5000,
    occurredAt: STARTED_AT,
    waitEndsAt,
  };
}

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    accesses: { cashier: CASHIER },
    identity: { registerId: "register-1", deviceId: "device-1" },
    session: SESSION,
    sales: [OPEN_SALE],
    pendingQrPayments: [pendingQr()],
    ...state,
  });
}

function replace(store: FakeSaleLedger, paymentTransactionId = "qr-1", actorId = "cashier") {
  return replacePendingQrPayment(
    { ledger: store, ids: new SequentialIds() },
    { actorId, paymentTransactionId, replacedAt: REPLACED_AT },
  );
}

describe("replacePendingQrPayment", () => {
  it("marks the pending QR payment as replaced and ends its wait now, leaving it pending", () => {
    const store = ledger();

    expect(replace(store)).toEqual({ kind: "replaced" });
    expect(store.state.replacedQrPaymentIds).toEqual(["qr-1"]);
    expect(store.state.pendingQrPayments).toEqual([pendingQr(REPLACED_AT)]);
    expect(store.state.payments).toEqual([]);
    expect(store.transactions).toBe(1);
  });

  it("keeps the end of a wait that is already over", () => {
    const overAt = new Date("2026-10-09T12:01:00.000Z");
    const store = ledger({ pendingQrPayments: [pendingQr(overAt)] });

    replace(store);

    expect(store.state.pendingQrPayments).toEqual([pendingQr(overAt)]);
  });

  it("records, in the same transaction, a qr_payment_replaced event of the payment and its sale", () => {
    const store = ledger();

    replace(store);

    expect(store.state.outbox).toEqual([
      {
        event_id: "id-1",
        aggregate_type: "Sale",
        aggregate_id: "sale-1",
        event_type: "qr_payment_replaced",
        schema_version: 1,
        payload: { payment_transaction_id: "qr-1", sale_id: "sale-1" },
        occurred_at: REPLACED_AT.toISOString(),
        actor_id: "cashier",
      },
    ]);
  });

  it.each<FakeSaleLedgerWrite>([
    "markQrPaymentReplaced",
    "appendOutboxEvent",
  ])("leaves the payment unmarked and sends no event when %s fails", (write) => {
    const store = ledger();
    store.failOn = write;
    const before = structuredClone(store.state);

    expect(() => replace(store)).toThrow();
    expect(store.state).toEqual(before);
  });

  it("answers that no QR payment is pending for an unknown one, changing nothing", () => {
    const store = ledger({ pendingQrPayments: [] });
    const before = structuredClone(store.state);

    expect(replace(store)).toEqual({ kind: "not_pending" });
    expect(store.state).toEqual(before);
  });

  it("answers that no QR payment is pending for one already replaced, sending no second event", () => {
    const store = ledger();
    replace(store);

    expect(replace(store)).toEqual({ kind: "not_pending" });
    expect(store.state.outbox).toHaveLength(1);
  });

  it.each([
    ["a person who may not sell", { actorId: "stranger" }, { kind: "not_permitted" }],
    ["a register without an open session", { session: undefined }, { kind: "no_open_session" }],
    ["a payment whose sale is not the open one", { sales: [] }, { kind: "no_open_sale" }],
    ["an outbox that is not ready", { outboxReady: false }, { kind: "unavailable" }],
  ])("refuses for %s, changing nothing", (_name, change, refusal) => {
    const { actorId, ...state } = change as { actorId?: string } & Partial<FakeSaleLedgerState>;
    const store = ledger(state);
    const before = structuredClone(store.state);

    expect(replace(store, "qr-1", actorId)).toEqual(refusal);
    expect(store.state).toEqual(before);
  });
});
