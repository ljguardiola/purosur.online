import { describe, expect, it } from "vitest";
import { argentinaInstant, FIXED_ARGENTINA_ZONE_RULES } from "../../shared/index.js";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import {
  type CompleteReturnGrant,
  type CompleteReturnInput,
  type CompleteReturnOutcome,
  completeReturn,
} from "./complete-return.js";
import { FakeOperationAuthority } from "./test-support/fake-operation-authority.js";
import {
  FakeReturnLedger,
  type FakeReturnLedgerState,
  type FakeReturnLedgerWrite,
} from "./test-support/fake-return-ledger.js";
import { FixedClock } from "./test-support/fixed-clock.js";
import {
  aSaleForReturn,
  CASH_PAYMENT,
  RETURNED_AT,
  TRANSFER_PAYMENT,
  YERBA_LINE,
} from "./test-support/sale-for-return.js";
import { SequentialIds } from "./test-support/sequential-ids.js";

const NOT_SIGNED_IN = { kind: "not_signed_in" } as const;
const OWN_GRANT: CompleteReturnGrant = { actorId: "cashier", authorizedBy: undefined };
const AUTHORIZED_GRANT: CompleteReturnGrant = { actorId: "cashier", authorizedBy: "supervisor" };

const YERBA_BACK = {
  saleLineId: "line-1",
  quantity: 2,
  reason: "change_of_mind",
  disposition: "restock",
} as const;
const CHEESE_THROWN_AWAY = {
  saleLineId: "line-3",
  quantity: 250,
  reason: "defective",
  disposition: "discard",
} as const;

const INPUT: CompleteReturnInput = {
  saleId: "sale-1",
  ticketSource: "QR",
  lines: [YERBA_BACK, CHEESE_THROWN_AWAY],
  refunds: [{ paymentId: "pay-cash", amount: 7000 }],
};

function ledger(state: Partial<FakeReturnLedgerState> = {}): FakeReturnLedger {
  return new FakeReturnLedger({
    sales: [aSaleForReturn()],
    openSession: {
      id: "session-2",
      openedBy: "cashier",
      registerId: "register-1",
      deviceId: "device-1",
    },
    stockBalances: { yerba: 1000, queso: 5000 },
    ...state,
  });
}

function complete(
  store: FakeReturnLedger,
  input: Partial<CompleteReturnInput> = {},
  grant: CompleteReturnGrant = OWN_GRANT,
  now: Date = RETURNED_AT,
): Promise<CompleteReturnOutcome<CompleteReturnGrant> | typeof NOT_SIGNED_IN> {
  return completeReturn(
    {
      zoneRules: new FakeZoneRulesSource(),
      ledger: store,
      clock: new FixedClock(now),
      ids: new SequentialIds(),
      authority: new FakeOperationAuthority<CompleteReturnGrant, typeof NOT_SIGNED_IN>({
        kind: "granted",
        grant,
      }),
    },
    { ...INPUT, ...input },
  );
}

const RETURN_RECORD = {
  id: "id-1",
  saleId: "sale-1",
  sessionId: "session-2",
  actorId: "cashier",
  authorizedBy: null,
  ticketSource: "QR",
  occurredAt: RETURNED_AT,
  refundedTotal: 7000,
  lines: [
    {
      saleLineId: "line-1",
      productId: "yerba",
      quantity: 2,
      reason: "change_of_mind",
      disposition: "restock",
      refundedAmount: 5000,
    },
    {
      saleLineId: "line-3",
      productId: "queso",
      quantity: 250,
      reason: "defective",
      disposition: "discard",
      refundedAmount: 2000,
    },
  ],
};
const CASH_REFUND = {
  id: "id-2",
  returnId: "id-1",
  saleId: "sale-1",
  paymentId: "pay-cash",
  method: "CASH",
  provider: "NONE",
  amount: 7000,
  state: "APPROVED",
  occurredAt: RETURNED_AT,
};
const REFUND_MOVEMENT = {
  id: "id-3",
  sessionId: "session-2",
  type: "REFUND",
  amount: 7000,
  actorId: "cashier",
  occurredAt: RETURNED_AT,
  ref: { type: "return", id: "id-1" },
};
const YERBA_RETURNED = {
  id: "id-4",
  returnId: "id-1",
  saleLineId: "line-1",
  productId: "yerba",
  kind: "return",
  reason: null,
  delta: 2000,
  occurredAt: RETURNED_AT,
};
const CHEESE_RETURNED = {
  id: "id-5",
  returnId: "id-1",
  saleLineId: "line-3",
  productId: "queso",
  kind: "return",
  reason: null,
  delta: 250,
  occurredAt: RETURNED_AT,
};
const CHEESE_LOST = {
  id: "id-6",
  returnId: "id-1",
  saleLineId: "line-3",
  productId: "queso",
  kind: "loss",
  reason: "return_discard",
  delta: -250,
  occurredAt: RETURNED_AT,
};

describe("completeReturn", () => {
  describe("a return completed", () => {
    it("writes the return with the amount refunded to each line, in the open session", async () => {
      const store = ledger();

      const outcome = await complete(store);

      expect(outcome).toEqual({
        kind: "completed",
        returnId: "id-1",
        refundedTotal: 7000,
        refunds: [
          {
            id: "id-2",
            paymentId: "pay-cash",
            method: "CASH",
            provider: "NONE",
            amount: 7000,
            state: "APPROVED",
            occurredAt: RETURNED_AT,
          },
        ],
        creditNote: { kind: "none" },
        grant: OWN_GRANT,
      });
      expect(store.state.returns).toEqual([RETURN_RECORD]);
    });

    it("does everything in one transaction", async () => {
      const store = ledger();

      await complete(store);

      expect(store.transactions).toBe(1);
    });

    it("refunds in cash, on the spot, out of the open session and not the sale's own", async () => {
      const store = ledger();

      await complete(store);

      expect(store.state.cashMovements).toEqual([REFUND_MOVEMENT]);
      expect(store.state.sales[0]?.sale.sessionId).toBe("session-1");
    });

    it("gives the payment back what the refund took out of it", async () => {
      const store = ledger();

      await complete(store);

      expect(store.state.refunds).toEqual([CASH_REFUND]);
      expect(store.state.sales[0]?.payments[0]?.refundedAmount).toBe(7000);
    });

    it("puts the merchandise back in stock, and takes the discarded one out again as a loss", async () => {
      const store = ledger();

      await complete(store);

      expect(store.state.stockMovements).toEqual([YERBA_RETURNED, CHEESE_RETURNED, CHEESE_LOST]);
      expect(store.state.stockBalances).toEqual({ yerba: 3000, queso: 5000 });
    });

    it("appends one sale_returned event with the sale, the lines, the refunds, the cash and the stock", async () => {
      const store = ledger();

      await complete(store);

      expect(store.state.outbox).toEqual([
        {
          event_id: "id-7",
          aggregate_type: "Return",
          aggregate_id: "id-1",
          event_type: "sale_returned",
          schema_version: 3,
          occurred_at: RETURNED_AT.toISOString(),
          actor_id: "cashier",
          payload: {
            id: "id-1",
            sale_id: "sale-1",
            register_id: "register-1",
            device_id: "device-1",
            session_id: "session-2",
            actor_id: "cashier",
            authorized_by: null,
            ticket_source: "QR",
            occurred_at: RETURNED_AT.toISOString(),
            credit_note: null,
            lines: [
              {
                sale_line_id: "line-1",
                product_id: "yerba",
                quantity: 2,
                reason: "change_of_mind",
                disposition: "restock",
                refunded_amount: 5000,
              },
              {
                sale_line_id: "line-3",
                product_id: "queso",
                quantity: 250,
                reason: "defective",
                disposition: "discard",
                refunded_amount: 2000,
              },
            ],
            refunds: [
              {
                id: "id-2",
                kind: "REFUND",
                parent_id: "pay-cash",
                method: "CASH",
                provider: "NONE",
                amount: 7000,
                state: "APPROVED",
                occurred_at: RETURNED_AT.toISOString(),
              },
            ],
            cash_movements: [
              {
                id: "id-3",
                type: "REFUND",
                amount: 7000,
                ref_type: "return",
                ref_id: "id-1",
                actor_id: "cashier",
                occurred_at: RETURNED_AT.toISOString(),
              },
            ],
            stock_movements: [
              {
                id: "id-4",
                sale_line_id: "line-1",
                product_id: "yerba",
                kind: "return",
                reason: null,
                delta: 2000,
                occurred_at: RETURNED_AT.toISOString(),
              },
              {
                id: "id-5",
                sale_line_id: "line-3",
                product_id: "queso",
                kind: "return",
                reason: null,
                delta: 250,
                occurred_at: RETURNED_AT.toISOString(),
              },
              {
                id: "id-6",
                sale_line_id: "line-3",
                product_id: "queso",
                kind: "loss",
                reason: "return_discard",
                delta: -250,
                occurred_at: RETURNED_AT.toISOString(),
              },
            ],
          },
        },
      ]);
    });

    it("records who authorized it on the return, the cash movement and the event, acting under the cashier", async () => {
      const store = ledger();

      const outcome = await complete(store, {}, AUTHORIZED_GRANT);

      expect(outcome).toMatchObject({ kind: "completed", grant: AUTHORIZED_GRANT });
      expect(store.state.returns[0]?.authorizedBy).toBe("supervisor");
      expect(store.state.cashMovements[0]?.authorizedBy).toBe("supervisor");
      expect(store.state.outbox[0]).toMatchObject({
        actor_id: "cashier",
        payload: { authorized_by: "supervisor" },
      });
    });

    it("leaves no authorizer on the cash movement when the cashier returns with their own permission", async () => {
      const store = ledger();

      await complete(store);

      expect(store.state.cashMovements[0]).not.toHaveProperty("authorizedBy");
    });

    it("records how the ticket was read", async () => {
      const store = ledger();

      await complete(store, { ticketSource: "TYPED" });

      expect(store.state.returns[0]?.ticketSource).toBe("TYPED");
      expect(store.state.outbox[0]?.payload).toMatchObject({ ticket_source: "TYPED" });
    });

    it("puts a returned item on the shelf with a single movement and no loss", async () => {
      const store = ledger();

      await complete(store, {
        lines: [YERBA_BACK],
        refunds: [{ paymentId: "pay-cash", amount: 5000 }],
      });

      expect(store.state.stockMovements.map(({ kind }) => kind)).toEqual(["return"]);
    });

    it("returns a weighed line in the thousandths it was sold in", async () => {
      const store = ledger();

      await complete(store, {
        lines: [{ ...CHEESE_THROWN_AWAY, disposition: "restock" }],
        refunds: [{ paymentId: "pay-cash", amount: 2000 }],
      });

      expect(store.state.stockMovements).toEqual([
        expect.objectContaining({ productId: "queso", kind: "return", delta: 250 }),
      ]);
    });

    it("refunds a promotion line whole, as its share of what was charged", async () => {
      const store = ledger();

      const outcome = await complete(store, {
        lines: [
          { saleLineId: "line-2", quantity: 4, reason: "change_of_mind", disposition: "restock" },
        ],
        refunds: [{ paymentId: "pay-cash", amount: 4000 }],
      });

      expect(outcome).toMatchObject({ kind: "completed", refundedTotal: 4000 });
    });

    it("splits the refund among the cash payments the cashier chose, one refund each", async () => {
      const secondCash = { ...CASH_PAYMENT, id: "pay-cash-2", amount: 3000 };
      const store = ledger({
        sales: [aSaleForReturn({ payments: [CASH_PAYMENT, secondCash, TRANSFER_PAYMENT] })],
      });

      await complete(store, {
        refunds: [
          { paymentId: "pay-cash", amount: 4000 },
          { paymentId: "pay-cash-2", amount: 3000 },
        ],
      });

      expect(store.state.refunds.map(({ paymentId, amount }) => [paymentId, amount])).toEqual([
        ["pay-cash", 4000],
        ["pay-cash-2", 3000],
      ]);
      expect(store.state.cashMovements).toEqual([expect.objectContaining({ amount: 7000 })]);
    });

    it("takes out of the drawer only what was refunded in cash when the rest goes to another payment", async () => {
      const store = ledger();

      const outcome = await complete(store, {
        refunds: [
          { paymentId: "pay-cash", amount: 4000 },
          { paymentId: "pay-transfer", amount: 3000 },
        ],
      });

      expect(outcome).toMatchObject({ kind: "completed", refundedTotal: 7000 });
      expect(store.state.cashMovements).toEqual([{ ...REFUND_MOVEMENT, id: "id-4", amount: 4000 }]);
      expect(store.state.refunds).toEqual([
        { ...CASH_REFUND, amount: 4000 },
        {
          id: "id-3",
          returnId: "id-1",
          saleId: "sale-1",
          paymentId: "pay-transfer",
          method: "TRANSFER",
          provider: "NONE",
          amount: 3000,
          state: "PENDING",
          occurredAt: RETURNED_AT,
        },
      ]);
    });

    it("takes no cash out of the drawer when everything goes back through another payment", async () => {
      const store = ledger({
        sales: [
          aSaleForReturn({ payments: [CASH_PAYMENT, { ...TRANSFER_PAYMENT, amount: 15_000 }] }),
        ],
      });

      const outcome = await complete(store, {
        refunds: [{ paymentId: "pay-transfer", amount: 7000 }],
      });

      expect(outcome).toMatchObject({
        kind: "completed",
        refundedTotal: 7000,
        refunds: [expect.objectContaining({ paymentId: "pay-transfer", state: "PENDING" })],
      });
      expect(store.state.cashMovements).toEqual([]);
      expect(store.state.refunds).toEqual([
        expect.objectContaining({ paymentId: "pay-transfer", amount: 7000, state: "PENDING" }),
      ]);
      expect(store.state.outbox[0]?.payload).toMatchObject({ cash_movements: [] });
    });

    it.each([
      ["QR", "MERCADOPAGO_QR"],
      ["POINT", "MERCADOPAGO_POINT"],
      ["STANDALONE_TERMINAL", "EXTERNAL_TERMINAL"],
    ] as const)(
      "records a refund to a %s payment pending, with its method and provider, in the event",
      async (method, provider) => {
        const store = ledger({
          sales: [
            aSaleForReturn({
              payments: [
                { ...TRANSFER_PAYMENT, id: "pay-other", method, provider, amount: 15_000 },
              ],
            }),
          ],
        });

        await complete(store, { refunds: [{ paymentId: "pay-other", amount: 7000 }] });

        expect(store.state.outbox[0]?.payload).toMatchObject({
          refunds: [
            {
              kind: "REFUND",
              parent_id: "pay-other",
              method,
              provider,
              amount: 7000,
              state: "PENDING",
            },
          ],
        });
      },
    );

    it("makes one refund of a payment that was imputed twice", async () => {
      const store = ledger();

      await complete(store, {
        refunds: [
          { paymentId: "pay-cash", amount: 3000 },
          { paymentId: "pay-cash", amount: 4000 },
        ],
      });

      expect(store.state.refunds.map(({ paymentId, amount }) => [paymentId, amount])).toEqual([
        ["pay-cash", 7000],
      ]);
    });

    it("takes what an earlier return of the same line already refunded into account", async () => {
      const store = ledger();

      await complete(store, {
        lines: [YERBA_BACK],
        refunds: [{ paymentId: "pay-cash", amount: 5000 }],
      });
      const second = await complete(store, {
        lines: [{ ...YERBA_BACK, quantity: 1 }],
        refunds: [{ paymentId: "pay-cash", amount: 2500 }],
      });

      expect(second).toMatchObject({ kind: "completed", refundedTotal: 2500 });
      expect(store.state.sales[0]?.returned).toEqual([
        { saleLineId: "line-1", quantity: 3, refundedAmount: 7500 },
      ]);
    });

    it("refunds exactly what the line charged over every return, however the rounding falls", async () => {
      const oddLine = { ...YERBA_LINE, quantity: 3, lineTotal: 1000 };
      const sale = aSaleForReturn();
      sale.sale.lines = [oddLine];
      sale.payments = [CASH_PAYMENT];
      const store = ledger({ sales: [sale] });
      const one = { ...YERBA_BACK, quantity: 1 };

      const totals = [];
      for (const refunded of [333, 334, 333]) {
        const outcome = await complete(store, {
          lines: [one],
          refunds: [{ paymentId: "pay-cash", amount: refunded }],
        });
        totals.push(outcome.kind === "completed" ? outcome.refundedTotal : outcome.kind);
      }

      expect(totals).toEqual([333, 334, 333]);
      expect(store.state.cashMovements.map(({ amount }) => amount)).toEqual([333, 334, 333]);
    });

    it("completes a return that refunds nothing without any refund or cash movement", async () => {
      const free = aSaleForReturn();
      free.sale.lines = [{ ...YERBA_LINE, lineTotal: 0 }];
      free.payments = [CASH_PAYMENT];
      const store = ledger({ sales: [free] });

      const outcome = await complete(store, { lines: [YERBA_BACK], refunds: [] });

      expect(outcome).toMatchObject({ kind: "completed", refundedTotal: 0, refunds: [] });
      expect(store.state.refunds).toEqual([]);
      expect(store.state.cashMovements).toEqual([]);
      expect(store.state.stockMovements).toHaveLength(1);
    });

    it("lets a defect through after the change of mind window has closed", async () => {
      const store = ledger();

      const outcome = await complete(
        store,
        {
          lines: [{ ...YERBA_BACK, reason: "defective" }],
          refunds: [{ paymentId: "pay-cash", amount: 5000 }],
        },
        OWN_GRANT,
        new Date(argentinaInstant("2026-10-15", "10:00", FIXED_ARGENTINA_ZONE_RULES)),
      );

      expect(outcome).toMatchObject({ kind: "completed" });
    });
  });

  describe("what keeps a return from completing", () => {
    const REFUSED: [
      string,
      Partial<FakeReturnLedgerState>,
      Partial<CompleteReturnInput>,
      object,
    ][] = [
      ["a sale the register does not have", {}, { saleId: "sale-9" }, { kind: "not_found" }],
      [
        "a sale that was voided",
        { sales: [withState("VOIDED")] },
        {},
        { kind: "sale_not_returnable" },
      ],
      [
        "a sale that was cancelled",
        { sales: [withState("CANCELLED")] },
        {},
        { kind: "sale_not_returnable" },
      ],
      [
        "a sale that was never completed",
        { sales: [withState("OPEN")] },
        {},
        { kind: "sale_not_returnable" },
      ],
      ["no open cash session", { openSession: undefined }, {}, { kind: "no_open_session" }],
      ["a return with no lines", {}, { lines: [], refunds: [] }, { kind: "no_lines" }],
      [
        "a quantity above what the line has left",
        {},
        { lines: [{ ...YERBA_BACK, quantity: 4 }] },
        {
          kind: "line_refused",
          saleLineId: "line-1",
          refusal: { kind: "quantity_exceeds_returnable", returnable: 3 },
        },
      ],
      [
        "part of a promotion line",
        {},
        { lines: [{ ...YERBA_BACK, saleLineId: "line-2", quantity: 3 }] },
        {
          kind: "line_refused",
          saleLineId: "line-2",
          refusal: { kind: "promotion_whole_only", returnable: 4 },
        },
      ],
      [
        "a line without a reason",
        {},
        { lines: [{ ...YERBA_BACK, reason: null }] },
        { kind: "line_refused", saleLineId: "line-1", refusal: { kind: "missing_reason" } },
      ],
      [
        "a line without a disposition",
        {},
        { lines: [{ ...YERBA_BACK, disposition: null }] },
        { kind: "line_refused", saleLineId: "line-1", refusal: { kind: "missing_disposition" } },
      ],
      [
        "a line the sale does not have",
        {},
        { lines: [{ ...YERBA_BACK, saleLineId: "line-9" }] },
        { kind: "line_refused", saleLineId: "line-9", refusal: { kind: "unknown_line" } },
      ],
      [
        "a quantity that is not a positive whole number",
        {},
        { lines: [{ ...YERBA_BACK, quantity: 0 }] },
        { kind: "line_refused", saleLineId: "line-1", refusal: { kind: "invalid_quantity" } },
      ],
      [
        "a change of mind past the branch's days",
        { goodConditionReturnDays: 5 },
        {},
        {
          kind: "line_refused",
          saleLineId: "line-1",
          refusal: {
            kind: "outside_window",
            reason: "change_of_mind",
            lastAllowedDay: "2026-09-17",
          },
        },
      ],
      [
        "a refund above what a payment that is not cash has left",
        {
          sales: [
            aSaleForReturn({
              payments: [CASH_PAYMENT, { ...TRANSFER_PAYMENT, amount: 8000, refundedAmount: 2000 }],
            }),
          ],
        },
        { refunds: [{ paymentId: "pay-transfer", amount: 7000 }] },
        {
          kind: "refund_refused",
          refusal: { kind: "exceeds_payment", paymentId: "pay-transfer", remaining: 6000 },
        },
      ],
      [
        "a refund above what the payment has left",
        {
          sales: [
            aSaleForReturn({
              payments: [{ ...CASH_PAYMENT, refundedAmount: 9000 }, TRANSFER_PAYMENT],
            }),
          ],
        },
        {},
        {
          kind: "refund_refused",
          refusal: { kind: "exceeds_payment", paymentId: "pay-cash", remaining: 6000 },
        },
      ],
      [
        "a refund that does not add up to what the lines refund",
        {},
        { refunds: [{ paymentId: "pay-cash", amount: 6999 }] },
        {
          kind: "refund_refused",
          refusal: { kind: "total_mismatch", refundableTotal: 7000, imputed: 6999 },
        },
      ],
      [
        "a refund to a payment the sale does not have",
        {},
        { refunds: [{ paymentId: "pay-9", amount: 7000 }] },
        { kind: "refund_refused", refusal: { kind: "unknown_payment", paymentId: "pay-9" } },
      ],
      [
        "a refund of an amount that is not positive",
        {},
        { refunds: [{ paymentId: "pay-cash", amount: 0 }] },
        { kind: "refund_refused", refusal: { kind: "invalid_amount", paymentId: "pay-cash" } },
      ],
      ["an outbox that cannot take the event", { outboxReady: false }, {}, { kind: "unavailable" }],
    ];

    it.each(REFUSED)("refuses %s and writes nothing", async (_name, state, input, expected) => {
      const store = ledger(state);
      const before = structuredClone(store.state);

      const outcome = await complete(store, input);

      expect(outcome).toEqual(expected);
      expect(store.state).toEqual(before);
    });

    it("refuses a line outside its window saying the reason's last day", async () => {
      const store = ledger();

      const outcome = await complete(
        store,
        {},
        OWN_GRANT,
        new Date(argentinaInstant("2026-09-28", "09:00", FIXED_ARGENTINA_ZONE_RULES)),
      );

      expect(outcome).toEqual({
        kind: "line_refused",
        saleLineId: "line-1",
        refusal: { kind: "outside_window", reason: "change_of_mind", lastAllowedDay: "2026-09-27" },
      });
    });

    it("refuses a defect after six months", async () => {
      const store = ledger();

      const outcome = await complete(
        store,
        { lines: [{ ...YERBA_BACK, reason: "defective" }] },
        OWN_GRANT,
        new Date(argentinaInstant("2027-03-13", "09:00", FIXED_ARGENTINA_ZONE_RULES)),
      );

      expect(outcome).toMatchObject({
        refusal: { kind: "outside_window", reason: "defective", lastAllowedDay: "2027-03-12" },
      });
    });

    it("names the first refused line in the order the cashier entered them", async () => {
      const store = ledger();

      const outcome = await complete(store, {
        lines: [
          YERBA_BACK,
          { ...CHEESE_THROWN_AWAY, disposition: null },
          { ...YERBA_BACK, saleLineId: "line-9" },
        ],
      });

      expect(outcome).toEqual({
        kind: "line_refused",
        saleLineId: "line-3",
        refusal: { kind: "missing_disposition" },
      });
    });

    it("explains that the sale cannot be returned before asking for an open session", async () => {
      const store = ledger({ sales: [withState("VOIDED")], openSession: undefined });

      expect(await complete(store)).toEqual({ kind: "sale_not_returnable" });
    });

    it("asks for an open session before looking at the lines", async () => {
      const store = ledger({ openSession: undefined });

      expect(await complete(store, { lines: [] })).toEqual({ kind: "no_open_session" });
    });

    it("explains a line's refusal before a refund's", async () => {
      const store = ledger();

      const outcome = await complete(store, {
        lines: [{ ...YERBA_BACK, disposition: null }],
        refunds: [{ paymentId: "pay-transfer", amount: 1 }],
      });

      expect(outcome).toMatchObject({ kind: "line_refused" });
    });

    it("explains a refund's refusal before the outbox", async () => {
      const store = ledger({ outboxReady: false });

      const outcome = await complete(store, {
        refunds: [{ paymentId: "pay-transfer", amount: 7000 }],
      });

      expect(outcome).toMatchObject({ kind: "refund_refused" });
    });

    it("refuses to return again what an earlier return already took back", async () => {
      const store = ledger();

      await complete(store);
      const outcome = await complete(store);

      expect(outcome).toEqual({
        kind: "line_refused",
        saleLineId: "line-1",
        refusal: { kind: "quantity_exceeds_returnable", returnable: 1 },
      });
    });

    it("refuses a return that would refund more than a payment's remaining after an earlier return", async () => {
      const store = ledger({
        sales: [
          aSaleForReturn({ payments: [{ ...CASH_PAYMENT, amount: 6000 }, TRANSFER_PAYMENT] }),
        ],
      });

      await complete(store, {
        lines: [YERBA_BACK],
        refunds: [{ paymentId: "pay-cash", amount: 5000 }],
      });
      const outcome = await complete(store, {
        lines: [CHEESE_THROWN_AWAY],
        refunds: [{ paymentId: "pay-cash", amount: 2000 }],
      });

      expect(outcome).toMatchObject({
        kind: "refund_refused",
        refusal: { kind: "exceeds_payment", remaining: 1000 },
      });
    });
  });

  describe("authorization", () => {
    it("returns the authority's refusal without reading the register", async () => {
      const store = ledger();
      const before = structuredClone(store.state);

      const outcome = await completeReturn(
        {
          zoneRules: new FakeZoneRulesSource(),
          ledger: store,
          clock: new FixedClock(RETURNED_AT),
          ids: new SequentialIds(),
          authority: new FakeOperationAuthority<CompleteReturnGrant, typeof NOT_SIGNED_IN>({
            kind: "refused",
            refusal: NOT_SIGNED_IN,
          }),
        },
        INPUT,
      );

      expect(outcome).toEqual(NOT_SIGNED_IN);
      expect(store.transactions).toBe(0);
      expect(store.state).toEqual(before);
    });

    it("asks the authority once, before the transaction", async () => {
      const store = ledger();
      const asked: number[] = [];
      const authority = new FakeOperationAuthority<CompleteReturnGrant, typeof NOT_SIGNED_IN>(
        { kind: "granted", grant: OWN_GRANT },
        () => asked.push(store.transactions),
      );

      await completeReturn(
        {
          zoneRules: new FakeZoneRulesSource(),
          ledger: store,
          clock: new FixedClock(RETURNED_AT),
          ids: new SequentialIds(),
          authority,
        },
        INPUT,
      );

      expect(authority.asked).toBe(1);
      expect(asked).toEqual([0]);
    });
  });

  describe("a write that fails halfway", () => {
    const WRITES: FakeReturnLedgerWrite[] = [
      "recordReturn",
      "recordRefund",
      "recordCashMovement",
      "recordReturnStockMovement",
      "addToStockBalance",
      "appendOutboxEvent",
    ];

    it.each(WRITES)("leaves the register as it was when %s fails", async (write) => {
      const store = ledger();
      const before = structuredClone(store.state);
      store.failOn = write;

      await expect(complete(store)).rejects.toThrow(`${write} failed`);

      expect(store.state).toEqual(before);
    });
  });
});

const INVOICE_OF_SALE = {
  saleId: "sale-1",
  origin: "real_time",
  state: "AUTHORIZED",
  pointOfSale: 3,
  number: 1204,
  buyerTaxStatusCode: 5,
} as const;
const ONLINE = {
  lastHealthCheckOkAt: new Date(RETURNED_AT.getTime() - 1_000),
  tokenValid: true,
  arcaReachable: true,
};
const OFFLINE = { ...ONLINE, lastHealthCheckOkAt: null };
const OFFLINE_SERIES = {
  pointOfSale: 9,
  blocksInAssignmentOrder: [{ firstNumber: 41, lastNumber: 1040 }],
  localLastUsed: null,
  taxAuthorityLastAuthorized: 40,
  highestSyncedNumber: null,
  clockMark: null,
};
const CODE = "71234567890123";
const RETURN_ORIGIN = { kind: "sale_return", returnId: "id-1", issuedOn: "2026-09-20" } as const;
const RETURN_CREDIT_NOTE = {
  creditNoteId: "id-7",
  saleId: "sale-1",
  total: 7000,
  receiverTaxStatusCode: 5,
  correctedVoucher: { voucherType: 11, pointOfSale: 3, number: 1204 },
  origin: RETURN_ORIGIN,
};
const RETURN_CREDIT_NOTE_PAYLOAD = {
  id: "id-7",
  total: 7000,
  receiver_tax_status_code: 5,
  corrects: { voucher_type: 11, point_of_sale: 3, number: 1204 },
  issued_on: "2026-09-20",
};

describe("completeReturn credit note", () => {
  function invoiced(state: Partial<FakeReturnLedgerState> = {}): FakeReturnLedger {
    return ledger({
      fiscalDocuments: [INVOICE_OF_SALE],
      fiscalOnlineEvidence: ONLINE,
      ...state,
    });
  }

  describe("a sale with an authorized invoice", () => {
    it("records a pending credit note for what the return refunded, referencing the invoice, in the same transaction", async () => {
      const store = invoiced();

      const outcome = await complete(store);

      expect(outcome).toMatchObject({
        kind: "completed",
        refundedTotal: 7000,
        creditNote: { kind: "pending", creditNoteId: "id-7" },
      });
      expect(store.state.creditNotes).toEqual([RETURN_CREDIT_NOTE]);
      expect(store.transactions).toBe(1);
    });

    it("credits only what the return refunded, not the whole sale", async () => {
      const store = invoiced();

      await complete(store, {
        lines: [YERBA_BACK],
        refunds: [{ paymentId: "pay-cash", amount: 5000 }],
      });

      expect(store.state.creditNotes).toMatchObject([{ total: 5000 }]);
    });

    it("dates the credit note with the Argentine day of the return", async () => {
      const store = invoiced();

      await complete(
        store,
        {},
        OWN_GRANT,
        new Date(argentinaInstant("2026-09-20", "23:30", FIXED_ARGENTINA_ZONE_RULES)),
      );

      expect(store.state.creditNotes).toMatchObject([
        { origin: { kind: "sale_return", issuedOn: "2026-09-20" } },
      ]);
    });

    it("asks for the credit note in the event, ahead of the lines", async () => {
      const store = invoiced();

      await complete(store);

      expect(store.state.outbox).toHaveLength(1);
      expect(store.state.outbox[0]).toMatchObject({
        event_id: "id-8",
        schema_version: 3,
        payload: { credit_note: RETURN_CREDIT_NOTE_PAYLOAD },
      });
    });

    it("corrects the contingency document, not the real-time invoice, when the sale has both", async () => {
      const store = invoiced({
        fiscalDocuments: [
          INVOICE_OF_SALE,
          { ...INVOICE_OF_SALE, origin: "offline", pointOfSale: 8, number: 77 },
        ],
      });

      await complete(store);

      expect(store.state.creditNotes).toMatchObject([
        { correctedVoucher: { voucherType: 11, pointOfSale: 8, number: 77 } },
      ]);
    });

    it("issues no credit note for a return that refunds nothing", async () => {
      const free = aSaleForReturn();
      free.sale.lines = [{ ...YERBA_LINE, lineTotal: 0 }];
      free.payments = [CASH_PAYMENT];
      const store = invoiced({ sales: [free] });

      const outcome = await complete(store, { lines: [YERBA_BACK], refunds: [] });

      expect(outcome).toMatchObject({ kind: "completed", creditNote: { kind: "none" } });
      expect(store.state.creditNotes).toEqual([]);
      expect(store.state.outbox[0]).toMatchObject({ payload: { credit_note: null } });
    });

    it.each([
      ["no documents", []],
      ["a rejected invoice", [{ ...INVOICE_OF_SALE, state: "REJECTED" as const }]],
    ])("issues no credit note for a sale with %s", async (_case, fiscalDocuments) => {
      const store = invoiced({ fiscalDocuments });

      const outcome = await complete(store);

      expect(outcome).toMatchObject({ kind: "completed", creditNote: { kind: "none" } });
      expect(store.state.creditNotes).toEqual([]);
    });

    it("tells whether the register is online by the clock of the return", async () => {
      const store = invoiced({
        fiscalOnlineEvidence: {
          ...ONLINE,
          lastHealthCheckOkAt: new Date(RETURNED_AT.getTime() - 15_000),
        },
      });

      const outcome = await complete(store);

      expect(outcome).toMatchObject({ creditNote: { kind: "pending" } });
    });
  });

  describe("a sale whose invoice is still to come", () => {
    const AWAITING_NOTE = {
      creditNoteId: "id-7",
      saleId: "sale-1",
      total: 7000,
      receiverTaxStatusCode: null,
      correctedVoucher: null,
      origin: RETURN_ORIGIN,
    };

    it("holds the credit note for the invoice of a deferred sale that was not invoiced yet", async () => {
      const store = ledger({ salesAwaitingDeferredInvoice: ["sale-1"] });

      const outcome = await complete(store);

      expect(outcome).toMatchObject({
        kind: "completed",
        creditNote: { kind: "awaiting_invoice", creditNoteId: "id-7" },
      });
      expect(store.state.creditNotes).toEqual([AWAITING_NOTE]);
    });

    it("holds the credit note for an invoice that is being requested", async () => {
      const store = ledger({
        fiscalDocuments: [{ ...INVOICE_OF_SALE, state: "REQUESTING" }],
      });

      const outcome = await complete(store);

      expect(outcome).toMatchObject({ creditNote: { kind: "awaiting_invoice" } });
      expect(store.state.creditNotes).toEqual([AWAITING_NOTE]);
    });

    it("tells the event the credit note waits, without the invoice it will correct", async () => {
      const store = ledger({ salesAwaitingDeferredInvoice: ["sale-1"] });

      await complete(store);

      expect(store.state.outbox[0]).toMatchObject({
        payload: {
          credit_note: {
            id: "id-7",
            total: 7000,
            receiver_tax_status_code: null,
            corrects: null,
            issued_on: "2026-09-20",
          },
        },
      });
    });

    it("holds it even without a connection, never issuing it offline", async () => {
      const store = ledger({
        salesAwaitingDeferredInvoice: ["sale-1"],
        fiscalOnlineEvidence: OFFLINE,
        offlineCreditNoteSeries: OFFLINE_SERIES,
        offlineAuthorizationCodes: { "2026-09-16": CODE },
      });

      await complete(store);

      expect(store.state.issuedOfflineCreditNotes).toEqual([]);
      expect(store.offlineSeriesReads).toBe(0);
    });
  });

  describe("a sale with an authorized invoice, without a connection", () => {
    const FORTNIGHT = { start: "2026-09-16", end: "2026-09-30" };
    const OFFLINE_CREDIT_NOTE = {
      id: "id-9",
      saleId: "sale-1",
      creditNoteId: "id-7",
      pointOfSale: 9,
      documentType: "credit_note_c",
      number: 41,
      issuedOn: "2026-09-20",
      generatedAt: RETURNED_AT,
      generationStamp: "20260920100000",
      offlineAuthorizationCode: CODE,
      fortnight: FORTNIGHT,
      total: 7000,
      receiverTaxStatusCode: 5,
      corrects: { voucherType: 11, pointOfSale: 3, number: 1204 },
      buyerDocumentType: 99,
      buyerDocumentNumber: 0,
      cause: "no_connectivity",
    };

    function offlineLedger(state: Partial<FakeReturnLedgerState> = {}): FakeReturnLedger {
      return invoiced({
        fiscalOnlineEvidence: OFFLINE,
        offlineCreditNoteSeries: OFFLINE_SERIES,
        offlineAuthorizationCodes: { "2026-09-16": CODE },
        ...state,
      });
    }

    it("issues the credit note itself, numbered next in the credit note series of the offline point of sale", async () => {
      const store = offlineLedger();

      const outcome = await complete(store);

      expect(outcome).toMatchObject({
        kind: "completed",
        creditNote: { kind: "issued_offline", creditNoteId: "id-7" },
      });
      expect(store.state.issuedOfflineCreditNotes).toEqual([OFFLINE_CREDIT_NOTE]);
      expect(store.state.creditNotes).toEqual([]);
      expect(store.transactions).toBe(1);
    });

    it("reports the return and the credit note under the register of the open session, not the one that rang the sale up", async () => {
      const [rungUp] = offlineLedger().state.sales;
      const store = offlineLedger({
        sales: [
          {
            ...(rungUp as NonNullable<typeof rungUp>),
            sale: {
              ...(rungUp as NonNullable<typeof rungUp>).sale,
              registerId: "register-9",
              deviceId: "device-9",
            },
          },
        ],
      });

      await complete(store);

      expect(store.state.outbox[0]).toMatchObject({
        payload: { register_id: "register-1", device_id: "device-1" },
      });
      expect(store.state.outbox[1]).toMatchObject({ payload: { register_id: "register-1" } });
    });

    it("appends the return first and the contingency credit note's report event after it", async () => {
      const store = offlineLedger();

      await complete(store);

      expect(store.state.outbox.map(({ event_type }) => event_type)).toEqual([
        "sale_returned",
        "offline_fiscal_document_issued",
      ]);
      expect(store.state.outbox[0]).toMatchObject({
        event_id: "id-8",
        payload: { credit_note: RETURN_CREDIT_NOTE_PAYLOAD },
      });
      expect(store.state.outbox[1]).toMatchObject({
        event_id: "id-10",
        aggregate_id: "sale-1",
        schema_version: 3,
      });
    });

    it("leaves the credit note in progress for the cloud when the register has no contingency code", async () => {
      const store = offlineLedger({ offlineAuthorizationCodes: {} });

      const outcome = await complete(store);

      expect(outcome).toMatchObject({ creditNote: { kind: "pending" } });
      expect(store.state.creditNotes).toEqual([RETURN_CREDIT_NOTE]);
      expect(store.state.issuedOfflineCreditNotes).toEqual([]);
      expect(store.state.clockMarks).toEqual([]);
    });

    it("reads the credit note series only for a return that has a credit note to issue", async () => {
      const store = offlineLedger({ fiscalDocuments: [] });

      await complete(store);

      expect(store.offlineSeriesReads).toBe(0);
    });
  });

  describe("a write that fails halfway", () => {
    it.each(["recordPendingCreditNote"] as const)(
      "leaves the register as it was when %s fails",
      async (write) => {
        const store = invoiced();
        const before = structuredClone(store.state);
        store.failOn = write;

        await expect(complete(store)).rejects.toThrow(`${write} failed`);

        expect(store.state).toEqual(before);
      },
    );

    it.each(["issueOfflineCreditNote", "recordClockMark", "appendOutboxEvent"] as const)(
      "leaves the register as it was when %s fails while issuing offline",
      async (write) => {
        const store = invoiced({
          fiscalOnlineEvidence: OFFLINE,
          offlineCreditNoteSeries: OFFLINE_SERIES,
          offlineAuthorizationCodes: { "2026-09-16": CODE },
        });
        const before = structuredClone(store.state);
        store.failOn = write;

        await expect(complete(store)).rejects.toThrow(`${write} failed`);

        expect(store.state).toEqual(before);
      },
    );
  });
});

function withState(state: "OPEN" | "VOIDED" | "CANCELLED") {
  const sale = aSaleForReturn();
  sale.sale.state = state;
  return sale;
}
