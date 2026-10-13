import { describe, expect, it } from "vitest";
import type { SalePayment } from "../../payments/index.js";
import type { SaleLine, SaleWithLines } from "../model/sale.js";
import {
  type ApplySaleDiscountGrant,
  type ApplySaleDiscountInput,
  type ApplySaleDiscountOutcome,
  applySaleDiscount,
} from "./apply-sale-discount.js";
import { FakeOperationAuthority } from "./test-support/fake-operation-authority.js";
import {
  FakeSaleLedger,
  type FakeSaleLedgerState,
  type FakeSaleLedgerWrite,
  FixedClock,
} from "./test-support/fake-sale-ledger.js";
import { TEN_PERCENT_SALE_DISCOUNT } from "./test-support/sale-discounts.js";

const NOW = new Date("2026-10-07T15:30:00.000Z");
const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const SESSION = { id: "session-1", openedBy: "cashier" };
const TEN_PERCENT = { id: "ten", benefit: { kind: "PERCENT_OFF" as const, percent: 10 } };
const YERBA_LINE: SaleLine = {
  id: "line-1",
  productId: "yerba",
  productName: "Yerba 1 kg",
  saleUnit: "UNIT",
  weightSource: null,
  quantity: 3,
  listUnitPrice: 2500,
  priceListId: "list-1",
  promotions: [TEN_PERCENT],
  manualAdjustment: null,
  promotionId: "ten",
  discountAmount: 750,
  lineTotal: 6750,
};
const AZUCAR_LINE: SaleLine = {
  ...YERBA_LINE,
  id: "line-2",
  productId: "azucar",
  productName: "Azucar",
  quantity: 1,
  listUnitPrice: 1200,
  promotions: [],
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
const OWN_GRANT: ApplySaleDiscountGrant = { actorId: "cashier", authorizedBy: undefined };
const AUTHORIZED_GRANT: ApplySaleDiscountGrant = {
  actorId: "cashier",
  authorizedBy: "supervisor",
};
const NOT_SIGNED_IN = { kind: "not_signed_in" } as const;
const REASON = "cliente frecuente";

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    thresholds: [THRESHOLD],
    accesses: { cashier: CASHIER },
    session: SESSION,
    sales: [OPEN_SALE],
    ...state,
  });
}

function storedDiscount(store: FakeSaleLedger) {
  return store.state.sales[0]?.saleDiscount;
}

function apply(
  store: FakeSaleLedger,
  discount: ApplySaleDiscountInput["discount"],
  grant: ApplySaleDiscountGrant = OWN_GRANT,
): Promise<ApplySaleDiscountOutcome | typeof NOT_SIGNED_IN> {
  return applySaleDiscount(
    {
      ledger: store,
      clock: new FixedClock(NOW),
      authority: new FakeOperationAuthority<ApplySaleDiscountGrant, never>({
        kind: "granted",
        grant,
      }),
    },
    { discount, reason: REASON },
  );
}

describe("applySaleDiscount", () => {
  it("records a percentage taken off the sum of the line subtotals and answers the sale with its standing", async () => {
    const store = ledger();

    const outcome = await apply(store, { kind: "PERCENT", percent: 10 });

    const discount = { kind: "PERCENT", percent: 10, reason: REASON, authorizedBy: null };
    expect(storedDiscount(store)).toEqual(discount);
    expect(outcome).toEqual({
      kind: "applied",
      sale: { ...OPEN_SALE, saleDiscount: discount },
      balance: { paid: 0, pending: 7155 },
      linesLock: null,
      cancellable: true,
      cancelRefusal: null,
      refundsOnCancel: [],
      mercadoPagoChargeInProgress: null,
      chargeRefusal: undefined,
    });
    expect(store.state.outbox).toEqual([]);
    expect(store.transactions).toBe(1);
  });

  it("records a fixed amount taken off the sum of the line subtotals", async () => {
    const store = ledger();

    const outcome = await apply(store, { kind: "AMOUNT", amount: 950 });

    expect(storedDiscount(store)).toEqual({
      kind: "AMOUNT",
      amount: 950,
      reason: REASON,
      authorizedBy: null,
    });
    expect(outcome).toEqual(
      expect.objectContaining({
        kind: "applied",
        balance: { paid: 0, pending: 7000 },
      }),
    );
  });

  it("accepts the whole sale as a percentage and as an amount", async () => {
    const whole = ledger();
    const exact = ledger();

    expect(await apply(whole, { kind: "PERCENT", percent: 100 })).toEqual(
      expect.objectContaining({ balance: { paid: 0, pending: 0 } }),
    );
    expect(await apply(exact, { kind: "AMOUNT", amount: 7950 })).toEqual(
      expect.objectContaining({ balance: { paid: 0, pending: 0 } }),
    );
  });

  it("calculates on the line subtotals after promotions and manual line adjustments", async () => {
    const adjusted = {
      ...AZUCAR_LINE,
      manualAdjustment: {
        kind: "PRICE" as const,
        unitPrice: 1000,
        reason: "caja golpeada",
        authorizedBy: null,
      },
      lineTotal: 1000,
    };
    const store = ledger({ sales: [{ ...OPEN_SALE, lines: [YERBA_LINE, adjusted] }] });

    const outcome = await apply(store, { kind: "PERCENT", percent: 10 });

    expect(outcome).toEqual(expect.objectContaining({ balance: { paid: 0, pending: 6975 } }));
  });

  it("leaves the lines as they were", async () => {
    const store = ledger();

    await apply(store, { kind: "PERCENT", percent: 10 });

    expect(store.state.sales[0]?.lines).toEqual([YERBA_LINE, AZUCAR_LINE]);
  });

  it("replaces the discount the sale already had", async () => {
    const store = ledger({ sales: [{ ...OPEN_SALE, saleDiscount: TEN_PERCENT_SALE_DISCOUNT }] });

    const outcome = await apply(store, { kind: "AMOUNT", amount: 500 });

    expect(storedDiscount(store)).toEqual({
      kind: "AMOUNT",
      amount: 500,
      reason: REASON,
      authorizedBy: null,
    });
    expect(outcome).toEqual(expect.objectContaining({ balance: { paid: 0, pending: 7450 } }));
  });

  it("works out the buyer identification refusal on the discounted total", async () => {
    const reached = ledger({ thresholds: [{ ...THRESHOLD, amount: 7500 }] });
    const notReached = ledger({ thresholds: [{ ...THRESHOLD, amount: 7500 }] });

    const small = await apply(notReached, { kind: "PERCENT", percent: 10 });
    const none = await apply(reached, { kind: "AMOUNT", amount: 1 });

    expect(small).toEqual(expect.objectContaining({ chargeRefusal: undefined }));
    expect(none).toEqual(
      expect.objectContaining({ chargeRefusal: expect.objectContaining({ threshold: 7500 }) }),
    );
  });

  describe("who authorized it", () => {
    it("records no authorizer when the cashier held the permission", async () => {
      const store = ledger();

      await apply(store, { kind: "PERCENT", percent: 10 }, OWN_GRANT);

      expect(storedDiscount(store)?.authorizedBy).toBeNull();
    });

    it("records the person who entered their PIN", async () => {
      const store = ledger();

      await apply(store, { kind: "PERCENT", percent: 10 }, AUTHORIZED_GRANT);

      expect(storedDiscount(store)?.authorizedBy).toBe("supervisor");
    });

    it("returns the refusal of the authority without reading any data", async () => {
      const store = ledger();
      const before = structuredClone(store.state);
      const authority = new FakeOperationAuthority<ApplySaleDiscountGrant, typeof NOT_SIGNED_IN>({
        kind: "refused",
        refusal: NOT_SIGNED_IN,
      });

      const outcome = await applySaleDiscount(
        { ledger: store, clock: new FixedClock(NOW), authority },
        { discount: { kind: "PERCENT", percent: 10 }, reason: REASON },
      );

      expect(outcome).toEqual(NOT_SIGNED_IN);
      expect(authority.asked).toBe(1);
      expect(store.transactions).toBe(0);
      expect(store.state).toEqual(before);
    });

    it("asks for the authorization before opening any transaction", async () => {
      const store = ledger();
      let transactionsWhenAsked: number | undefined;
      const authority = new FakeOperationAuthority<ApplySaleDiscountGrant, never>(
        { kind: "granted", grant: OWN_GRANT },
        () => {
          transactionsWhenAsked = store.transactions;
        },
      );

      await applySaleDiscount(
        { ledger: store, clock: new FixedClock(NOW), authority },
        { discount: { kind: "PERCENT", percent: 10 }, reason: REASON },
      );

      expect(transactionsWhenAsked).toBe(0);
    });
  });

  describe("refusals", () => {
    it.each<[string, Partial<FakeSaleLedgerState>, ApplySaleDiscountOutcome]>([
      ["the seller may not sell", { accesses: {} }, { kind: "not_permitted" }],
      [
        "the register is locked to another person",
        { session: { id: "session-1", openedBy: "other" } },
        { kind: "not_permitted" },
      ],
      ["there is no open cash session", { session: undefined }, { kind: "no_open_session" }],
      ["the session has no open sale", { sales: [] }, { kind: "no_open_sale" }],
      ["the sale has an approved payment", { payments: [PAYMENT] }, { kind: "sale_has_payments" }],
      ["the sale has no lines", { sales: [{ ...OPEN_SALE, lines: [] }] }, { kind: "empty_sale" }],
      [
        "the sale adds up to nothing",
        { sales: [{ ...OPEN_SALE, lines: [{ ...AZUCAR_LINE, lineTotal: 0 }] }] },
        { kind: "zero_total" },
      ],
    ])("answers its refusal when %s and changes nothing", async (_name, state, expected) => {
      const store = ledger(state);
      const before = structuredClone(store.state);

      const outcome = await apply(store, { kind: "PERCENT", percent: 10 });

      expect(outcome).toEqual(expected);
      expect(store.state).toEqual(before);
    });

    it("refuses an amount above the sum of the line subtotals and keeps the discount the sale had", async () => {
      const store = ledger({ sales: [{ ...OPEN_SALE, saleDiscount: TEN_PERCENT_SALE_DISCOUNT }] });
      const before = structuredClone(store.state);

      const outcome = await apply(store, { kind: "AMOUNT", amount: 7951 });

      expect(outcome).toEqual({ kind: "discount_exceeds_sale" });
      expect(store.state).toEqual(before);
    });

    it("leaves the sale untouched when recording the discount fails", async () => {
      const store = ledger();
      const before = structuredClone(store.state);
      const failing: FakeSaleLedgerWrite = "recordSaleDiscount";
      store.failOn = failing;

      await expect(apply(store, { kind: "PERCENT", percent: 10 })).rejects.toThrow(
        "recordSaleDiscount failed",
      );
      expect(store.state).toEqual(before);
    });
  });
});
