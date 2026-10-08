import { describe, expect, it } from "vitest";
import type { PaymentTransaction } from "../model/payment.js";
import type { SaleWithLines } from "../model/sale.js";
import {
  type CancelPaidSaleGrant,
  type CancelPaidSaleInput,
  type CancelPaidSaleOutcome,
  cancelPaidSale,
} from "./cancel-paid-sale.js";
import type { SaleCashMovement } from "./sale-ledger.js";
import { FakeOperationAuthority } from "./test-support/fake-operation-authority.js";
import {
  FakeSaleLedger,
  type FakeSaleLedgerState,
  type FakeSaleLedgerWrite,
  FixedClock,
  SequentialIds,
} from "./test-support/fake-sale-ledger.js";

const NOW = new Date("2026-10-07T15:30:00.000Z");
const PAID_AT = new Date("2026-10-07T15:10:00.000Z");
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
const CASH_PAYMENT: PaymentTransaction = {
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
const TRANSFER_PAYMENT: PaymentTransaction = {
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
const PAYMENT_MOVEMENT: SaleCashMovement = {
  id: "movement-1",
  sessionId: "session-1",
  type: "SALE",
  amount: 1200,
  actorId: "cashier",
  occurredAt: PAID_AT,
  ref: { type: "sale", id: "sale-1" },
};
const ANOTHER_SALE_MOVEMENT: SaleCashMovement = {
  ...PAYMENT_MOVEMENT,
  id: "movement-0",
  ref: { type: "sale", id: "sale-0" },
};

const OWN_GRANT: CancelPaidSaleGrant = { actorId: "cashier", authorizedBy: undefined };
const AUTHORIZED_GRANT: CancelPaidSaleGrant = { actorId: "cashier", authorizedBy: "supervisor" };
const CLOSER_GRANT: CancelPaidSaleGrant = { actorId: "closer", authorizedBy: "closer" };
const VOIDER = { isAdministrator: false, permissionKeys: ["void_sale"] };
const NOT_SIGNED_IN = { kind: "not_signed_in" } as const;

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    accesses: { cashier: CASHIER, colleague: CASHIER },
    session: SESSION,
    sales: [OPEN_SALE],
    payments: [CASH_PAYMENT],
    movements: [PAYMENT_MOVEMENT, ANOTHER_SALE_MOVEMENT],
    ...state,
  });
}

function granting(grant: CancelPaidSaleGrant) {
  return new FakeOperationAuthority<CancelPaidSaleGrant, never>({ kind: "granted", grant });
}

function cancel(
  store: FakeSaleLedger,
  grant: CancelPaidSaleGrant = OWN_GRANT,
  saleId = "sale-1",
  from: CancelPaidSaleInput["from"] = "sale",
): Promise<CancelPaidSaleOutcome<CancelPaidSaleGrant> | typeof NOT_SIGNED_IN> {
  return cancelPaidSale(
    {
      ledger: store,
      clock: new FixedClock(NOW),
      ids: new SequentialIds(),
      authority: granting(grant),
    },
    { saleId, from },
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

const FIRST_PAYMENT_RECORD = {
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
};

const PAYMENT_MOVEMENT_RECORD = {
  id: "movement-1",
  type: "SALE",
  amount: 1200,
  ref_type: "sale",
  ref_id: "sale-1",
  actor_id: "cashier",
  occurred_at: PAID_AT.toISOString(),
};

const LINE_RECORD = {
  id: "line-1",
  product_id: "yerba",
  product_name: "Yerba 1 kg",
  quantity: 3,
  list_unit_price: 2500,
  price_list_id: "list-1",
  promotion_id: "ten",
  discount_amount: 750,
  promotions: [
    { discount_id: "ten", kind: "PERCENT_OFF", percent: 10, buy_qty: null, pay_qty: null },
  ],
  line_total: 6750,
};

describe("cancelPaidSale", () => {
  describe("a sale partly paid in cash", () => {
    it("gives the cash back with a refund cash movement and records the cancelled sale with its refund", async () => {
      const store = ledger();

      const outcome = await cancel(store);

      expect(outcome).toEqual({ kind: "cancelled", refunds: [CASH_REFUND], grant: OWN_GRANT });
      expect(store.state.refunds).toEqual([CASH_REFUND]);
      expect(store.state.movements).toEqual([
        PAYMENT_MOVEMENT,
        ANOTHER_SALE_MOVEMENT,
        REFUND_MOVEMENT,
      ]);
      expect(store.state.sales).toEqual([{ ...OPEN_SALE, state: "CANCELLED", occurredAt: NOW }]);
      expect(store.state.payments).toEqual([CASH_PAYMENT]);
    });

    it("does everything in one transaction", async () => {
      const store = ledger();

      await cancel(store);

      expect(store.transactions).toBe(1);
    });

    it("records who authorized the cancellation on the sale and on the refund movement", async () => {
      const store = ledger();

      const outcome = await cancel(store, AUTHORIZED_GRANT);

      expect(outcome).toMatchObject({ kind: "cancelled", grant: AUTHORIZED_GRANT });
      expect(store.state.sales[0]).toMatchObject({ authorizedBy: "supervisor" });
      expect(store.state.movements.at(-1)).toEqual({
        ...REFUND_MOVEMENT,
        authorizedBy: "supervisor",
      });
    });

    it("appends one sale_cancelled event with the sale, its payments, the refunds and every cash movement of the sale", async () => {
      const store = ledger();

      await cancel(store);

      expect(store.state.outbox).toEqual([
        {
          event_id: "id-3",
          aggregate_type: "Sale",
          aggregate_id: "sale-1",
          event_type: "sale_cancelled",
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
            lines: [LINE_RECORD],
            payments: [FIRST_PAYMENT_RECORD],
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
              PAYMENT_MOVEMENT_RECORD,
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
          },
          occurred_at: NOW.toISOString(),
          actor_id: "cashier",
        },
      ]);
    });

    it("names the person who authorized it in the event", async () => {
      const store = ledger();

      await cancel(store, AUTHORIZED_GRANT);

      expect(store.state.outbox[0]?.payload).toMatchObject({ authorized_by: "supervisor" });
    });

    it("attributes the sale to who sold it and the cancellation to who cancelled it", async () => {
      const store = ledger({ sales: [{ ...OPEN_SALE, actorId: "colleague" }] });

      await cancel(store);

      expect(store.state.outbox[0]).toMatchObject({
        actor_id: "cashier",
        payload: { actor_id: "colleague" },
      });
    });

    it("refunds nothing from the drawer beyond what was paid, whatever the drawer holds", async () => {
      const store = ledger({ movements: [] });

      const outcome = await cancel(store);

      expect(outcome).toMatchObject({ kind: "cancelled" });
    });
  });

  describe("a sale partly paid by transfer", () => {
    it("records a pending refund and moves no cash", async () => {
      const store = ledger({ payments: [TRANSFER_PAYMENT], movements: [] });

      const outcome = await cancel(store);

      const refund = {
        id: "id-1",
        saleId: "sale-1",
        paymentId: "payment-2",
        method: "TRANSFER",
        provider: "NONE",
        amount: 2000,
        state: "PENDING",
        occurredAt: NOW,
      };
      expect(outcome).toEqual({ kind: "cancelled", refunds: [refund], grant: OWN_GRANT });
      expect(store.state.refunds).toEqual([refund]);
      expect(store.state.movements).toEqual([]);
      expect(store.state.sales[0]).toMatchObject({ state: "CANCELLED" });
    });

    it("sends the pending refund in the event, with no cash movement", async () => {
      const store = ledger({ payments: [TRANSFER_PAYMENT], movements: [] });

      await cancel(store);

      expect(store.state.outbox).toHaveLength(1);
      expect(store.state.outbox[0]).toMatchObject({
        event_id: "id-2",
        payload: {
          refunds: [
            {
              id: "id-1",
              kind: "REFUND",
              parent_id: "payment-2",
              method: "TRANSFER",
              provider: "NONE",
              amount: 2000,
              state: "PENDING",
              occurred_at: NOW.toISOString(),
            },
          ],
          cash_movements: [],
        },
      });
    });
  });

  describe("a sale partly paid in cash and by transfer", () => {
    it("refunds each payment by its own method, with a movement only for the cash one", async () => {
      const store = ledger({ payments: [TRANSFER_PAYMENT, CASH_PAYMENT] });

      const outcome = await cancel(store);

      expect(outcome).toMatchObject({
        kind: "cancelled",
        refunds: [
          { id: "id-1", paymentId: "payment-2", method: "TRANSFER", state: "PENDING" },
          { id: "id-2", paymentId: "payment-1", method: "CASH", state: "APPROVED" },
        ],
      });
      expect(store.state.movements.filter(({ type }) => type === "REFUND")).toEqual([
        { ...REFUND_MOVEMENT, id: "id-3" },
      ]);
      expect(store.state.outbox[0]?.event_id).toBe("id-4");
    });
  });

  describe("a sale without approved payments", () => {
    it("discards it, recording nothing and sending no event", async () => {
      const store = ledger({ payments: [], movements: [] });
      const before = structuredClone(store.state);

      const outcome = await cancel(store);

      expect(outcome).toEqual({ kind: "cancelled", refunds: [], grant: OWN_GRANT });
      expect(store.state).toEqual({ ...before, sales: [] });
    });
  });

  describe("what it refuses", () => {
    it("returns the refusal of the authority without reading any data", async () => {
      const store = ledger();
      const before = structuredClone(store.state);
      const authority = new FakeOperationAuthority<CancelPaidSaleGrant, typeof NOT_SIGNED_IN>({
        kind: "refused",
        refusal: NOT_SIGNED_IN,
      });

      const outcome = await cancelPaidSale(
        { ledger: store, clock: new FixedClock(NOW), ids: new SequentialIds(), authority },
        { saleId: "sale-1", from: "sale" },
      );

      expect(outcome).toEqual(NOT_SIGNED_IN);
      expect(authority.asked).toBe(1);
      expect(store.transactions).toBe(0);
      expect(store.state).toEqual(before);
    });

    it("asks for the authorization before opening any transaction", async () => {
      const store = ledger();
      let transactionsWhenAsked: number | undefined;
      const authority = new FakeOperationAuthority<CancelPaidSaleGrant, never>(
        { kind: "granted", grant: OWN_GRANT },
        () => {
          transactionsWhenAsked = store.transactions;
        },
      );

      await cancelPaidSale(
        { ledger: store, clock: new FixedClock(NOW), ids: new SequentialIds(), authority },
        { saleId: "sale-1", from: "sale" },
      );

      expect(transactionsWhenAsked).toBe(0);
    });

    it.each([
      ["an actor the register does not know", { actorId: "stranger", authorizedBy: undefined }],
      ["a person who may not sell and charge", { actorId: "viewer", authorizedBy: undefined }],
      ["a session locked to another person", { actorId: "colleague", authorizedBy: undefined }],
    ])("refuses %s, leaving everything as it was", async (_case, grant) => {
      const store = ledger({
        accesses: {
          cashier: CASHIER,
          colleague: CASHIER,
          viewer: { ...CASHIER, permissionKeys: [] },
        },
      });
      const before = structuredClone(store.state);

      const outcome = await cancel(store, grant);

      expect(outcome).toEqual({ kind: "not_permitted" });
      expect(store.state).toEqual(before);
    });

    it("refuses without an open cash session", async () => {
      const store = ledger({ session: undefined });
      const before = structuredClone(store.state);

      expect(await cancel(store)).toEqual({ kind: "no_open_session" });
      expect(store.state).toEqual(before);
    });

    it.each([
      ["there is no open sale", { sales: [] }],
      ["the open sale is another", { sales: [{ ...OPEN_SALE, id: "sale-2" }] }],
      ["the sale is already completed", { sales: [{ ...OPEN_SALE, state: "COMPLETED" as const }] }],
      [
        "the open sale is of another session",
        { sales: [{ ...OPEN_SALE, sessionId: "session-0" }] },
      ],
    ])("refuses when %s", async (_case, state) => {
      const store = ledger(state);
      const before = structuredClone(store.state);

      expect(await cancel(store)).toEqual({ kind: "no_open_sale" });
      expect(store.state).toEqual(before);
    });
  });

  describe("from a register locked to its cashier", () => {
    function lockedLedger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
      return ledger({
        accesses: { cashier: CASHIER, closer: VOIDER, plain: CASHIER },
        session: SESSION,
        ...state,
      });
    }

    function cancelLocked(store: FakeSaleLedger, grant = CLOSER_GRANT, saleId = "sale-1") {
      return cancel(store, grant, saleId, "locked_register");
    }

    it("refunds the cash paid, with a refund movement and an event naming the closer and the sale's cashier", async () => {
      const store = lockedLedger();

      const outcome = await cancelLocked(store);

      expect(outcome).toEqual({
        kind: "cancelled",
        refunds: [CASH_REFUND],
        grant: CLOSER_GRANT,
      });
      expect(store.state.refunds).toEqual([CASH_REFUND]);
      expect(store.state.movements.at(-1)).toEqual({
        ...REFUND_MOVEMENT,
        actorId: "closer",
        authorizedBy: "closer",
      });
      expect(store.state.sales).toEqual([
        { ...OPEN_SALE, state: "CANCELLED", occurredAt: NOW, authorizedBy: "closer" },
      ]);
      expect(store.state.outbox).toHaveLength(1);
      expect(store.state.outbox[0]).toMatchObject({
        event_type: "sale_cancelled",
        actor_id: "closer",
        payload: { actor_id: "cashier", authorized_by: "closer" },
      });
      expect(store.transactions).toBe(1);
    });

    it("refuses a closer who may not void a sale, leaving everything as it was", async () => {
      const store = lockedLedger();
      const before = structuredClone(store.state);

      const outcome = await cancelLocked(store, { actorId: "plain", authorizedBy: "plain" });

      expect(outcome).toEqual({ kind: "not_permitted" });
      expect(store.state).toEqual(before);
    });

    it("refuses a closer the register does not know", async () => {
      const store = lockedLedger();
      const before = structuredClone(store.state);

      const outcome = await cancelLocked(store, { actorId: "stranger", authorizedBy: "stranger" });

      expect(outcome).toEqual({ kind: "not_permitted" });
      expect(store.state).toEqual(before);
    });

    it("discards a sale without approved payments even for a closer who may not void a sale", async () => {
      const store = lockedLedger({ payments: [], movements: [] });

      const outcome = await cancelLocked(store, { actorId: "plain", authorizedBy: "plain" });

      expect(outcome).toEqual({
        kind: "cancelled",
        refunds: [],
        grant: { actorId: "plain", authorizedBy: "plain" },
      });
      expect(store.state.sales).toEqual([]);
      expect(store.state.outbox).toEqual([]);
    });

    it("refuses without an open cash session", async () => {
      const store = lockedLedger({ session: undefined });

      expect(await cancelLocked(store)).toEqual({ kind: "no_open_session" });
    });

    it("refuses a sale that is not the open one", async () => {
      const store = lockedLedger();
      const before = structuredClone(store.state);

      expect(await cancelLocked(store, CLOSER_GRANT, "sale-2")).toEqual({ kind: "no_open_sale" });
      expect(store.state).toEqual(before);
    });
  });

  describe("when a write fails", () => {
    it.each<FakeSaleLedgerWrite>([
      "recordCancelledSale",
      "recordRefund",
      "recordCashMovement",
      "appendOutboxEvent",
    ])("leaves nothing recorded if %s fails", async (write) => {
      const store = ledger();
      const before = structuredClone(store.state);
      store.failOn = write;

      await expect(cancel(store)).rejects.toThrow(`${write} failed`);

      expect(store.state).toEqual(before);
    });
  });
});
