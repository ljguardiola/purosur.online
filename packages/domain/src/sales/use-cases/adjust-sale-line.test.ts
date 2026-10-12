import { describe, expect, it } from "vitest";
import type { SalePayment } from "../../payments/index.js";
import type { SaleLine, SaleWithLines } from "../model/sale.js";
import {
  type AdjustSaleLineGrant,
  type AdjustSaleLineInput,
  type AdjustSaleLineOutcome,
  adjustSaleLine,
} from "./adjust-sale-line.js";
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
const OWN_GRANT: AdjustSaleLineGrant = { actorId: "cashier", authorizedBy: undefined };
const AUTHORIZED_GRANT: AdjustSaleLineGrant = { actorId: "cashier", authorizedBy: "supervisor" };
const NOT_SIGNED_IN = { kind: "not_signed_in" } as const;
const REASON = "caja golpeada";

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    thresholds: [THRESHOLD],
    accesses: { cashier: CASHIER },
    session: SESSION,
    sales: [OPEN_SALE],
    ...state,
  });
}

function storedLine(store: FakeSaleLedger, lineId = "line-1") {
  return store.state.sales[0]?.lines.find((line) => line.id === lineId);
}

function adjust(
  store: FakeSaleLedger,
  adjustment: AdjustSaleLineInput["adjustment"],
  grant: AdjustSaleLineGrant = OWN_GRANT,
  lineId = "line-1",
): Promise<AdjustSaleLineOutcome | typeof NOT_SIGNED_IN> {
  return adjustSaleLine(
    {
      ledger: store,
      clock: new FixedClock(NOW),
      authority: new FakeOperationAuthority<AdjustSaleLineGrant, never>({
        kind: "granted",
        grant,
      }),
    },
    { lineId, adjustment, reason: REASON },
  );
}

describe("adjustSaleLine", () => {
  describe("overriding the price", () => {
    it("charges the new price, replaces the promotion and keeps the list price as the original", async () => {
      const store = ledger();

      const outcome = await adjust(store, { kind: "PRICE", unitPrice: 2000 });

      const adjusted = {
        ...YERBA_LINE,
        manualAdjustment: { kind: "PRICE", unitPrice: 2000, reason: REASON, authorizedBy: null },
        promotionId: null,
        discountAmount: 0,
        lineTotal: 6000,
      };
      expect(storedLine(store)).toEqual(adjusted);
      expect(outcome).toEqual({
        kind: "changed",
        removedManualDiscount: false,
        removedSaleDiscount: false,
        sale: { ...OPEN_SALE, lines: [adjusted, AZUCAR_LINE] },
        balance: { paid: 0, pending: 7200 },
        linesLock: null,
        cancellable: true,
        cancelRefusal: null,
        refundsOnCancel: [],
        chargeRefusal: undefined,
      });
      expect(store.state.outbox).toEqual([]);
      expect(store.transactions).toBe(1);
    });

    it("accepts a price above the list price and a price of zero", async () => {
      const above = ledger();
      const free = ledger();

      await adjust(above, { kind: "PRICE", unitPrice: 3000 });
      await adjust(free, { kind: "PRICE", unitPrice: 0 });

      expect(storedLine(above)).toEqual(
        expect.objectContaining({ discountAmount: 0, lineTotal: 9000 }),
      );
      expect(storedLine(free)).toEqual(expect.objectContaining({ lineTotal: 0 }));
    });

    it("refuses a price equal to the list price and changes nothing", async () => {
      const store = ledger();
      const before = structuredClone(store.state);

      const outcome = await adjust(store, { kind: "PRICE", unitPrice: 2500 });

      expect(outcome).toEqual({ kind: "same_as_list_price" });
      expect(store.state).toEqual(before);
    });
  });

  describe("applying a discount", () => {
    it("takes a percentage off the gross amount and replaces the promotion", async () => {
      const store = ledger();

      const outcome = await adjust(store, { kind: "PERCENT", percent: 20 });

      expect(storedLine(store)).toEqual({
        ...YERBA_LINE,
        manualAdjustment: { kind: "PERCENT", percent: 20, reason: REASON, authorizedBy: null },
        promotionId: null,
        discountAmount: 1500,
        lineTotal: 6000,
      });
      expect(outcome).toEqual(expect.objectContaining({ kind: "changed" }));
    });

    it("takes a fixed amount off the gross amount and replaces the promotion", async () => {
      const store = ledger();

      await adjust(store, { kind: "AMOUNT", amount: 1000 });

      expect(storedLine(store)).toEqual({
        ...YERBA_LINE,
        manualAdjustment: { kind: "AMOUNT", amount: 1000, reason: REASON, authorizedBy: null },
        promotionId: null,
        discountAmount: 1000,
        lineTotal: 6500,
      });
    });

    it("accepts an amount equal to the gross amount of the line", async () => {
      const store = ledger();

      await adjust(store, { kind: "AMOUNT", amount: 7500 });

      expect(storedLine(store)).toEqual(
        expect.objectContaining({ discountAmount: 7500, lineTotal: 0 }),
      );
    });

    it("refuses an amount above the gross amount of the line and changes nothing", async () => {
      const store = ledger();
      const before = structuredClone(store.state);

      const outcome = await adjust(store, { kind: "AMOUNT", amount: 7501 });

      expect(outcome).toEqual({ kind: "discount_exceeds_line" });
      expect(store.state).toEqual(before);
    });
  });

  describe("replacing what the line had", () => {
    it("replaces an overridden price with a discount", async () => {
      const store = ledger();
      await adjust(store, { kind: "PRICE", unitPrice: 2000 });

      await adjust(store, { kind: "PERCENT", percent: 10 });

      expect(storedLine(store)).toEqual(
        expect.objectContaining({
          manualAdjustment: { kind: "PERCENT", percent: 10, reason: REASON, authorizedBy: null },
          discountAmount: 750,
          lineTotal: 6750,
        }),
      );
    });

    it("replaces a discount with an overridden price", async () => {
      const store = ledger();
      await adjust(store, { kind: "AMOUNT", amount: 1000 });

      const outcome = await adjust(store, { kind: "PRICE", unitPrice: 2000 });

      expect(storedLine(store)).toEqual(
        expect.objectContaining({
          manualAdjustment: { kind: "PRICE", unitPrice: 2000, reason: REASON, authorizedBy: null },
          discountAmount: 0,
          lineTotal: 6000,
        }),
      );
      expect(outcome).toEqual(expect.objectContaining({ removedManualDiscount: false }));
    });

    it("compares a new price with the list price, not with the price it replaces", async () => {
      const store = ledger();
      await adjust(store, { kind: "PRICE", unitPrice: 2000 });

      expect(await adjust(store, { kind: "PRICE", unitPrice: 2500 })).toEqual({
        kind: "same_as_list_price",
      });
      expect(storedLine(store)?.lineTotal).toBe(6000);
    });

    it("bounds an amount by the gross amount, not by the discounted total", async () => {
      const store = ledger();
      await adjust(store, { kind: "PRICE", unitPrice: 100 });

      const outcome = await adjust(store, { kind: "AMOUNT", amount: 7500 });

      expect(outcome).toEqual(expect.objectContaining({ kind: "changed" }));
    });

    it("leaves the other lines as they were", async () => {
      const store = ledger();

      await adjust(store, { kind: "PERCENT", percent: 50 });

      expect(storedLine(store, "line-2")).toEqual(AZUCAR_LINE);
    });
  });

  describe("who authorized it", () => {
    it("records no authorizer when the cashier held the permission", async () => {
      const store = ledger();

      await adjust(store, { kind: "PERCENT", percent: 20 }, OWN_GRANT);

      expect(storedLine(store)?.manualAdjustment?.authorizedBy).toBeNull();
    });

    it("records the person who entered their PIN", async () => {
      const store = ledger();

      await adjust(store, { kind: "PERCENT", percent: 20 }, AUTHORIZED_GRANT);

      expect(storedLine(store)?.manualAdjustment?.authorizedBy).toBe("supervisor");
    });

    it("returns the refusal of the authority without reading any data", async () => {
      const store = ledger();
      const before = structuredClone(store.state);
      const authority = new FakeOperationAuthority<AdjustSaleLineGrant, typeof NOT_SIGNED_IN>({
        kind: "refused",
        refusal: NOT_SIGNED_IN,
      });

      const outcome = await adjustSaleLine(
        { ledger: store, clock: new FixedClock(NOW), authority },
        { lineId: "line-1", adjustment: { kind: "PERCENT", percent: 20 }, reason: REASON },
      );

      expect(outcome).toEqual(NOT_SIGNED_IN);
      expect(authority.asked).toBe(1);
      expect(store.transactions).toBe(0);
      expect(store.state).toEqual(before);
    });

    it("asks for the authorization before opening any transaction", async () => {
      const store = ledger();
      let transactionsWhenAsked: number | undefined;
      const authority = new FakeOperationAuthority<AdjustSaleLineGrant, never>(
        { kind: "granted", grant: OWN_GRANT },
        () => {
          transactionsWhenAsked = store.transactions;
        },
      );

      await adjustSaleLine(
        { ledger: store, clock: new FixedClock(NOW), authority },
        { lineId: "line-1", adjustment: { kind: "PERCENT", percent: 20 }, reason: REASON },
      );

      expect(transactionsWhenAsked).toBe(0);
    });
  });

  describe("refusals", () => {
    it.each<[string, Partial<FakeSaleLedgerState>, AdjustSaleLineOutcome]>([
      ["the seller may not sell", { accesses: {} }, { kind: "not_permitted" }],
      [
        "the register is locked to another person",
        { session: { id: "session-1", openedBy: "other" } },
        { kind: "not_permitted" },
      ],
      ["there is no open cash session", { session: undefined }, { kind: "no_open_session" }],
      ["the session has no open sale", { sales: [] }, { kind: "no_open_sale" }],
      ["the sale has an approved payment", { payments: [PAYMENT] }, { kind: "sale_has_payments" }],
    ])("answers its refusal when %s and changes nothing", async (_name, state, expected) => {
      const store = ledger(state);
      const before = structuredClone(store.state);

      const outcome = await adjust(store, { kind: "PERCENT", percent: 20 });

      expect(outcome).toEqual(expected);
      expect(store.state).toEqual(before);
    });

    it("answers unknown_line for a line the sale does not have", async () => {
      const store = ledger();
      const before = structuredClone(store.state);

      const outcome = await adjust(store, { kind: "PERCENT", percent: 20 }, OWN_GRANT, "nowhere");

      expect(outcome).toEqual({ kind: "unknown_line" });
      expect(store.state).toEqual(before);
    });

    it("leaves the line untouched when recording it fails", async () => {
      const store = ledger();
      const before = structuredClone(store.state);
      const failing: FakeSaleLedgerWrite = "recordChangedLine";
      store.failOn = failing;

      await expect(adjust(store, { kind: "PERCENT", percent: 20 })).rejects.toThrow(
        "recordChangedLine failed",
      );
      expect(store.state).toEqual(before);
    });
  });
});

describe("adjustSaleLine on a sale with a discount on the total", () => {
  function discountedStore(): FakeSaleLedger {
    return ledger({ sales: [{ ...OPEN_SALE, saleDiscount: TEN_PERCENT_SALE_DISCOUNT }] });
  }

  it("removes the discount and tells so", async () => {
    const store = discountedStore();

    const outcome = await adjust(store, { kind: "PERCENT", percent: 20 });

    expect(store.state.sales[0]?.saleDiscount).toBeNull();
    expect(outcome).toEqual(
      expect.objectContaining({
        kind: "changed",
        removedSaleDiscount: true,
        sale: expect.objectContaining({ saleDiscount: null }),
        balance: { paid: 0, pending: 7200 },
      }),
    );
  });

  it("keeps the discount when the adjustment is refused", async () => {
    const store = discountedStore();

    const outcome = await adjust(store, { kind: "PRICE", unitPrice: 2500 });

    expect(outcome).toEqual({ kind: "same_as_list_price" });
    expect(store.state.sales[0]?.saleDiscount).toEqual(TEN_PERCENT_SALE_DISCOUNT);
  });
});
