import { describe, expect, it } from "vitest";
import type { FiscalDocumentState } from "../../fiscal/index.js";
import type { SalePayment } from "../../payments/index.js";
import type { SaleWithLines } from "../model/sale.js";
import { SALE_VOID_REFUSALS, type SaleVoidRefusal } from "../model/sale-void.js";
import { FakeOperationAuthority } from "./test-support/fake-operation-authority.js";
import { FixedClock, SequentialIds } from "./test-support/fake-sale-ledger.js";
import {
  FakeSaleVoidLedger,
  type FakeSaleVoidLedgerState,
  type FakeSaleVoidLedgerWrite,
} from "./test-support/fake-sale-void-ledger.js";
import { TEN_PERCENT_SALE_DISCOUNT } from "./test-support/sale-discounts.js";
import type { SaleToVoid } from "./void-sale-ports.js";
import {
  type VoidSaleGrant,
  type VoidSaleInput,
  type VoidSaleOutcome,
  voidSale,
} from "./void-sale.js";

const NOW = new Date("2026-10-07T15:30:00.000Z");
const PAID_AT = new Date("2026-10-07T15:10:00.000Z");
const YERBA_LINE = {
  id: "line-1",
  productId: "yerba",
  productName: "Yerba 1 kg",
  saleUnit: "UNIT" as const,
  weightSource: null,
  quantity: 3,
  listUnitPrice: 2500,
  priceListId: "list-1",
  promotions: [
    { id: "ten", name: "Diez por ciento", benefit: { kind: "PERCENT_OFF" as const, percent: 10 } },
  ],
  manualAdjustment: null,
  promotionId: "ten",
  discountAmount: 750,
  lineTotal: 6750,
};
const QUESO_LINE = {
  ...YERBA_LINE,
  id: "line-2",
  productId: "queso",
  productName: "Queso por kilo",
  saleUnit: "KG" as const,
  quantity: 1250,
  promotions: [],
  promotionId: null,
  discountAmount: 0,
  listUnitPrice: 8000,
  lineTotal: 10000,
};
const COMPLETED_SALE: SaleWithLines = {
  id: "sale-1",
  registerId: "register-1",
  deviceId: "device-1",
  sessionId: "session-1",
  actorId: "cashier",
  state: "COMPLETED",
  saleDiscount: null,
  lines: [YERBA_LINE],
};
const CASH_PAYMENT: SalePayment = {
  id: "payment-1",
  saleId: "sale-1",
  kind: "SALE",
  method: "CASH",
  provider: "NONE",
  amount: 1200,
  tendered: 1200,
  state: "APPROVED",
  occurredAt: PAID_AT,
};
const TRANSFER_PAYMENT: SalePayment = {
  id: "payment-2",
  saleId: "sale-1",
  kind: "SALE",
  method: "TRANSFER",
  provider: "NONE",
  amount: 2000,
  state: "APPROVED",
  occurredAt: PAID_AT,
  authorizedBy: "cashier",
  confirmedAt: PAID_AT,
};
const STANDALONE_TERMINAL_PAYMENT: SalePayment = {
  id: "payment-3",
  saleId: "sale-1",
  kind: "SALE",
  method: "STANDALONE_TERMINAL",
  provider: "EXTERNAL_TERMINAL",
  amount: 3550,
  state: "APPROVED",
  occurredAt: PAID_AT,
  authorizedBy: "cashier",
  confirmedAt: PAID_AT,
};
const QR_PAYMENT: SalePayment = {
  id: "payment-4",
  saleId: "sale-1",
  kind: "SALE",
  method: "QR",
  provider: "MERCADOPAGO_QR",
  amount: 900,
  state: "APPROVED",
  occurredAt: PAID_AT,
};
const POINT_PAYMENT: SalePayment = {
  ...QR_PAYMENT,
  id: "payment-5",
  method: "POINT",
  provider: "MERCADOPAGO_POINT",
};
const SALE_MOVEMENT = {
  id: "movement-1",
  sessionId: "session-1",
  type: "SALE" as const,
  amount: 1200,
  actorId: "cashier",
  occurredAt: PAID_AT,
  ref: { type: "sale", id: "sale-1" },
};
const ANOTHER_SALE_MOVEMENT = {
  ...SALE_MOVEMENT,
  id: "movement-0",
  ref: { type: "sale", id: "sale-0" },
};
const YERBA_SALE_STOCK = {
  id: "stock-1",
  saleId: "sale-1",
  kind: "sale" as const,
  saleLineId: "line-1",
  productId: "yerba",
  delta: -3000,
  occurredAt: PAID_AT,
};
const QUESO_SALE_STOCK = {
  id: "stock-2",
  saleId: "sale-1",
  kind: "sale" as const,
  saleLineId: "line-2",
  productId: "queso",
  delta: -1250,
  occurredAt: PAID_AT,
};

const OWN_GRANT: VoidSaleGrant = { actorId: "cashier", authorizedBy: undefined };
const AUTHORIZED_GRANT: VoidSaleGrant = { actorId: "cashier", authorizedBy: "supervisor" };
const NOT_SIGNED_IN = { kind: "not_signed_in" } as const;

function ledger(state: Partial<FakeSaleVoidLedgerState> = {}): FakeSaleVoidLedger {
  return new FakeSaleVoidLedger({
    openSessionId: "session-1",
    sales: [COMPLETED_SALE],
    payments: [CASH_PAYMENT],
    movements: [SALE_MOVEMENT, ANOTHER_SALE_MOVEMENT],
    stockMovements: [YERBA_SALE_STOCK],
    stockBalances: { yerba: 7000 },
    deferredRecords: [{ saleId: "sale-1", satisfied: false }],
    ...state,
  });
}

function void_(
  store: FakeSaleVoidLedger,
  input: Partial<VoidSaleInput> = {},
  grant: VoidSaleGrant = OWN_GRANT,
): Promise<VoidSaleOutcome<VoidSaleGrant> | typeof NOT_SIGNED_IN> {
  return voidSale(
    {
      ledger: store,
      clock: new FixedClock(NOW),
      ids: new SequentialIds(),
      authority: new FakeOperationAuthority<VoidSaleGrant, typeof NOT_SIGNED_IN>({
        kind: "granted",
        grant,
      }),
    },
    { saleId: "sale-1", pendingRefundsConfirmed: false, ...input },
  );
}

const CASH_REFUND = {
  id: "id-1",
  saleId: "sale-1",
  paymentId: "payment-1",
  method: "CASH",
  provider: "NONE",
  amount: 1200,
  state: "APPROVED",
  occurredAt: NOW,
};
const REFUND_MOVEMENT = {
  id: "id-2",
  sessionId: "session-1",
  type: "REFUND",
  amount: 1200,
  actorId: "cashier",
  occurredAt: NOW,
  ref: { type: "sale", id: "sale-1" },
};
const YERBA_RETURN = {
  id: "id-3",
  saleId: "sale-1",
  kind: "sale_void",
  saleLineId: "line-1",
  productId: "yerba",
  delta: 3000,
  occurredAt: NOW,
};

describe("voidSale", () => {
  describe("a completed sale paid in cash and deferred to a non-fiscal document", () => {
    it("voids the sale, gives the cash back and returns the merchandise to stock", async () => {
      const store = ledger();

      const outcome = await void_(store);

      expect(outcome).toEqual({ kind: "voided", refunds: [CASH_REFUND], grant: OWN_GRANT });
      expect(store.state.sales).toEqual([{ ...COMPLETED_SALE, state: "VOIDED", voidedAt: NOW }]);
      expect(store.state.refunds).toEqual([CASH_REFUND]);
      expect(store.state.movements).toEqual([
        SALE_MOVEMENT,
        ANOTHER_SALE_MOVEMENT,
        REFUND_MOVEMENT,
      ]);
      expect(store.state.stockMovements).toEqual([YERBA_SALE_STOCK, YERBA_RETURN]);
      expect(store.state.stockBalances).toEqual({ yerba: 10000 });
      expect(store.state.payments).toEqual([CASH_PAYMENT]);
    });

    it("does everything in one transaction", async () => {
      const store = ledger();

      await void_(store);

      expect(store.transactions).toBe(1);
    });

    it("cancels the pending record of the deferred sale", async () => {
      const store = ledger();

      await void_(store);

      expect(store.state.deferredRecords).toEqual([
        { saleId: "sale-1", satisfied: false, cancelledAt: NOW },
      ]);
    });

    it("records who authorized the void on the sale and on the refund movement", async () => {
      const store = ledger();

      const outcome = await void_(store, {}, AUTHORIZED_GRANT);

      expect(outcome).toMatchObject({ kind: "voided", grant: AUTHORIZED_GRANT });
      expect(store.state.sales[0]).toMatchObject({ authorizedBy: "supervisor" });
      expect(store.state.movements.at(-1)).toEqual({
        ...REFUND_MOVEMENT,
        authorizedBy: "supervisor",
      });
    });

    it("leaves no authorizer on the sale when the cashier voids with their own permission", async () => {
      const store = ledger();

      await void_(store);

      expect(store.state.sales[0]).not.toHaveProperty("authorizedBy");
      expect(store.state.movements.at(-1)).not.toHaveProperty("authorizedBy");
    });

    it("appends one sale_voided event with the sale, its payments, the refunds, every cash movement of the sale and the stock returned", async () => {
      const store = ledger();

      await void_(store);

      expect(store.state.outbox).toEqual([
        {
          event_id: "id-4",
          aggregate_type: "Sale",
          aggregate_id: "sale-1",
          event_type: "sale_voided",
          schema_version: 1,
          payload: {
            id: "sale-1",
            register_id: "register-1",
            device_id: "device-1",
            session_id: "session-1",
            actor_id: "cashier",
            authorized_by: null,
            occurred_at: NOW.toISOString(),
            total: 6750,
            sale_discount: null,
            lines: [
              {
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
                promotions: [
                  {
                    discount_id: "ten",
                    kind: "PERCENT_OFF",
                    percent: 10,
                    buy_qty: null,
                    pay_qty: null,
                  },
                ],
                sale_discount_share: 0,
                line_total: 6750,
              },
            ],
            payments: [
              {
                id: "payment-1",
                kind: "SALE",
                method: "CASH",
                provider: "NONE",
                amount: 1200,
                tendered: 1200,
                state: "APPROVED",
                occurred_at: PAID_AT.toISOString(),
                authorized_by: null,
                confirmed_at: null,
              },
            ],
            refunds: [
              {
                id: "id-1",
                kind: "REFUND",
                parent_id: "payment-1",
                method: "CASH",
                provider: "NONE",
                amount: 1200,
                state: "APPROVED",
                occurred_at: NOW.toISOString(),
              },
            ],
            cash_movements: [
              {
                id: "movement-1",
                type: "SALE",
                amount: 1200,
                ref_type: "sale",
                ref_id: "sale-1",
                actor_id: "cashier",
                occurred_at: PAID_AT.toISOString(),
              },
              {
                id: "id-2",
                type: "REFUND",
                amount: 1200,
                ref_type: "sale",
                ref_id: "sale-1",
                actor_id: "cashier",
                occurred_at: NOW.toISOString(),
              },
            ],
            stock_movements: [
              { id: "id-3", sale_line_id: "line-1", product_id: "yerba", delta: 3000 },
            ],
            deferred_record_cancelled: true,
          },
          occurred_at: NOW.toISOString(),
          actor_id: "cashier",
        },
      ]);
    });

    it("names the authorizer in the event and acts under the actor", async () => {
      const store = ledger();

      await void_(store, {}, { actorId: "cashier", authorizedBy: "supervisor" });

      expect(store.state.outbox[0]).toMatchObject({
        actor_id: "cashier",
        payload: { actor_id: "cashier", authorized_by: "supervisor" },
      });
    });

    it("records the discounted total of a sale with a discount on its total", async () => {
      const store = ledger({
        sales: [{ ...COMPLETED_SALE, saleDiscount: TEN_PERCENT_SALE_DISCOUNT }],
      });

      await void_(store);

      expect(store.state.outbox[0]?.payload).toMatchObject({
        total: 6075,
        lines: [{ sale_discount_share: 675, line_total: 6075 }],
        sale_discount: { kind: "PERCENT", value: 10, amount: 675 },
      });
    });
  });

  describe("the merchandise", () => {
    it("returns to each product exactly what the sale took out, line by line", async () => {
      const store = ledger({
        sales: [{ ...COMPLETED_SALE, lines: [YERBA_LINE, QUESO_LINE] }],
        stockMovements: [YERBA_SALE_STOCK, QUESO_SALE_STOCK],
        stockBalances: { yerba: 7000, queso: 500 },
      });

      await void_(store);

      expect(store.state.stockMovements.slice(2)).toEqual([
        YERBA_RETURN,
        { ...YERBA_RETURN, id: "id-4", saleLineId: "line-2", productId: "queso", delta: 1250 },
      ]);
      expect(store.state.stockBalances).toEqual({ yerba: 10000, queso: 1750 });
    });

    it("returns only the merchandise of the voided sale", async () => {
      const store = ledger({
        stockMovements: [YERBA_SALE_STOCK, { ...QUESO_SALE_STOCK, saleId: "sale-0" }],
      });

      await void_(store);

      expect(store.state.stockBalances).toEqual({ yerba: 10000 });
    });
  });

  describe("a sale that was never deferred", () => {
    it("is voided without any deferred record to cancel", async () => {
      const store = ledger({ deferredRecords: [] });

      const outcome = await void_(store);

      expect(outcome).toMatchObject({ kind: "voided" });
      expect(store.state.outbox[0]?.payload).toMatchObject({ deferred_record_cancelled: false });
    });

    it("leaves a deferred record that was already satisfied by an invoice as it is", async () => {
      const store = ledger({ deferredRecords: [{ saleId: "sale-1", satisfied: true }] });

      await void_(store);

      expect(store.state.deferredRecords).toEqual([{ saleId: "sale-1", satisfied: true }]);
      expect(store.state.outbox[0]?.payload).toMatchObject({ deferred_record_cancelled: false });
    });

    it("leaves the deferred record of another sale alone", async () => {
      const store = ledger({
        deferredRecords: [
          { saleId: "sale-1", satisfied: false },
          { saleId: "sale-0", satisfied: false },
        ],
      });

      await void_(store);

      expect(store.state.deferredRecords).toEqual([
        { saleId: "sale-1", satisfied: false, cancelledAt: NOW },
        { saleId: "sale-0", satisfied: false },
      ]);
    });
  });

  describe("a sale paid in more than one way", () => {
    const MIXED = [CASH_PAYMENT, TRANSFER_PAYMENT, STANDALONE_TERMINAL_PAYMENT];

    it("refuses to void until the cashier confirms the pending refunds", async () => {
      const store = ledger({ payments: MIXED });
      const before = structuredClone(store.state);

      const outcome = await void_(store, { pendingRefundsConfirmed: false });

      expect(outcome).toEqual({ kind: "pending_refunds_unconfirmed" });
      expect(store.state).toEqual(before);
    });

    it("gives cash back on the spot and leaves the others pending once confirmed", async () => {
      const store = ledger({ payments: MIXED });

      const outcome = await void_(store, { pendingRefundsConfirmed: true });

      expect(outcome).toMatchObject({ kind: "voided" });
      expect(store.state.refunds).toEqual([
        CASH_REFUND,
        {
          id: "id-3",
          saleId: "sale-1",
          paymentId: "payment-2",
          method: "TRANSFER",
          provider: "NONE",
          amount: 2000,
          state: "PENDING",
          occurredAt: NOW,
        },
        {
          id: "id-4",
          saleId: "sale-1",
          paymentId: "payment-3",
          method: "STANDALONE_TERMINAL",
          provider: "EXTERNAL_TERMINAL",
          amount: 3550,
          state: "PENDING",
          occurredAt: NOW,
        },
      ]);
    });

    it("moves cash out of the session only for the cash payment", async () => {
      const store = ledger({ payments: MIXED });

      await void_(store, { pendingRefundsConfirmed: true });

      expect(store.state.movements).toEqual([
        SALE_MOVEMENT,
        ANOTHER_SALE_MOVEMENT,
        REFUND_MOVEMENT,
      ]);
    });

    it("lists the pending refunds in the event", async () => {
      const store = ledger({ payments: MIXED });

      await void_(store, { pendingRefundsConfirmed: true });

      const payload = store.state.outbox[0]?.payload as { refunds: { state: string }[] };
      expect(payload.refunds.map(({ state }) => state)).toEqual(["APPROVED", "PENDING", "PENDING"]);
    });

    it("voids a sale paid only by transfer with the refund pending and no cash movement", async () => {
      const store = ledger({ payments: [TRANSFER_PAYMENT] });

      const outcome = await void_(store, { pendingRefundsConfirmed: true });

      expect(outcome).toMatchObject({ kind: "voided" });
      expect(store.state.movements).toEqual([SALE_MOVEMENT, ANOTHER_SALE_MOVEMENT]);
      expect(store.state.refunds).toEqual([
        {
          id: "id-1",
          saleId: "sale-1",
          paymentId: "payment-2",
          method: "TRANSFER",
          provider: "NONE",
          amount: 2000,
          state: "PENDING",
          occurredAt: NOW,
        },
      ]);
    });

    it("does not need a confirmation when everything is refunded in cash", async () => {
      const store = ledger();

      const outcome = await void_(store, { pendingRefundsConfirmed: false });

      expect(outcome).toMatchObject({ kind: "voided" });
    });

  });

  describe("a payment that was never approved", () => {
    const UNAPPROVED_QR: SaleToVoid["payments"][number] = { ...QR_PAYMENT, state: "EXPIRED" };

    it("does not keep the sale from being voided, whatever its method", async () => {
      const store = ledger({ payments: [CASH_PAYMENT, UNAPPROVED_QR] });

      const outcome = await void_(store);

      expect(outcome).toMatchObject({ kind: "voided", refunds: [CASH_REFUND] });
    });

    it("is left out of the event", async () => {
      const store = ledger({ payments: [CASH_PAYMENT, UNAPPROVED_QR] });

      await void_(store);

      const payload = store.state.outbox[0]?.payload as { payments: { id: string }[] };
      expect(payload.payments.map(({ id }) => id)).toEqual(["payment-1"]);
    });
  });

  describe("what keeps a sale from being voided", () => {
    const REFUSED_CASES: [SaleVoidRefusal, Partial<FakeSaleVoidLedgerState>][] = [
      ["not_completed", { sales: [{ ...COMPLETED_SALE, state: "VOIDED" }] }],
      ["not_completed", { sales: [{ ...COMPLETED_SALE, state: "CANCELLED" }] }],
      ["not_completed", { sales: [{ ...COMPLETED_SALE, state: "OPEN" }] }],
      ["session_closed", { openSessionId: undefined }],
      ["session_closed", { openSessionId: "session-2" }],
      ["invoice_in_flight", { fiscalDocuments: fiscalDocument("REQUESTING") }],
      ["invoice_in_flight", { fiscalDocuments: fiscalDocument("UNKNOWN") }],
      ["carries_invoice", { fiscalDocuments: fiscalDocument("AUTHORIZED") }],
      ["mercado_pago_payment", { payments: [CASH_PAYMENT, QR_PAYMENT] }],
      ["mercado_pago_payment", { payments: [CASH_PAYMENT, POINT_PAYMENT] }],
    ];

    it.each(REFUSED_CASES)("refuses with %s and changes nothing", async (refusal, changes) => {
      const store = ledger(changes);
      const before = structuredClone(store.state);

      const outcome = await void_(store, { pendingRefundsConfirmed: true });

      expect(outcome).toEqual({ kind: refusal });
      expect(store.state).toEqual(before);
    });

    it("covers every refusal the rule can give", () => {
      expect([...new Set(REFUSED_CASES.map(([refusal]) => refusal))].sort()).toEqual(
        [...SALE_VOID_REFUSALS].sort(),
      );
    });

    it("voids a sale whose invoice request was rejected and fell back to a non-fiscal document", async () => {
      const store = ledger({ fiscalDocuments: fiscalDocument("REJECTED") });

      const outcome = await void_(store);

      expect(outcome).toMatchObject({ kind: "voided" });
      expect(store.state.deferredRecords).toEqual([
        { saleId: "sale-1", satisfied: false, cancelledAt: NOW },
      ]);
    });

    it("answers that the sale was not found when the register has no such sale", async () => {
      const store = ledger();
      const before = structuredClone(store.state);

      const outcome = await void_(store, { saleId: "sale-9" });

      expect(outcome).toEqual({ kind: "not_found" });
      expect(store.state).toEqual(before);
    });

    it("explains the refusal before asking to confirm pending refunds", async () => {
      const store = ledger({
        payments: [TRANSFER_PAYMENT],
        openSessionId: undefined,
      });

      const outcome = await void_(store, { pendingRefundsConfirmed: false });

      expect(outcome).toEqual({ kind: "session_closed" });
    });

    it("asks to confirm pending refunds before looking at the outbox", async () => {
      const store = ledger({ payments: [TRANSFER_PAYMENT], outboxReady: false });

      const outcome = await void_(store, { pendingRefundsConfirmed: false });

      expect(outcome).toEqual({ kind: "pending_refunds_unconfirmed" });
    });

    it("is unavailable, changing nothing, while the outbox cannot take the event", async () => {
      const store = ledger({ outboxReady: false });
      const before = structuredClone(store.state);

      const outcome = await void_(store);

      expect(outcome).toEqual({ kind: "unavailable" });
      expect(store.state).toEqual(before);
    });
  });

  describe("authorization", () => {
    it("returns the authority's refusal without reading the register", async () => {
      const store = ledger();
      const before = structuredClone(store.state);
      const authority = new FakeOperationAuthority<VoidSaleGrant, typeof NOT_SIGNED_IN>({
        kind: "refused",
        refusal: NOT_SIGNED_IN,
      });

      const outcome = await voidSale(
        { ledger: store, clock: new FixedClock(NOW), ids: new SequentialIds(), authority },
        { saleId: "sale-1", pendingRefundsConfirmed: true },
      );

      expect(outcome).toEqual(NOT_SIGNED_IN);
      expect(authority.asked).toBe(1);
      expect(store.transactions).toBe(0);
      expect(store.state).toEqual(before);
    });

    it("asks the authority once, before the transaction", async () => {
      const store = ledger();
      let transactionsWhenAsked = -1;
      const authority = new FakeOperationAuthority<VoidSaleGrant, typeof NOT_SIGNED_IN>(
        { kind: "granted", grant: OWN_GRANT },
        () => {
          transactionsWhenAsked = store.transactions;
        },
      );

      await voidSale(
        { ledger: store, clock: new FixedClock(NOW), ids: new SequentialIds(), authority },
        { saleId: "sale-1", pendingRefundsConfirmed: false },
      );

      expect(authority.asked).toBe(1);
      expect(transactionsWhenAsked).toBe(0);
    });
  });

  describe("a write that fails halfway", () => {
    const WRITES: FakeSaleVoidLedgerWrite[] = [
      "recordVoidedSale",
      "recordRefund",
      "recordCashMovement",
      "recordSaleVoidStockMovement",
      "addToStockBalance",
      "cancelDeferredSale",
      "appendOutboxEvent",
    ];

    it.each(WRITES)("leaves nothing behind when %s fails", async (write) => {
      const store = ledger();
      const before = structuredClone(store.state);
      store.failOn = write;

      await expect(void_(store)).rejects.toThrow(`${write} failed`);

      expect(store.state).toEqual(before);
    });
  });
});

function fiscalDocument(state: FiscalDocumentState) {
  return [{ saleId: "sale-1", state }];
}
