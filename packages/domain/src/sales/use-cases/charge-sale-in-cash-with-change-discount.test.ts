import { describe, expect, it } from "vitest";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../../fiscal/test-support/fictional-tax-identities.js";
import type { CashMovement } from "../../register/index.js";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import type { SaleLine, SaleWithLines } from "../model/sale.js";
import type { ApplySaleDiscountGrant } from "./apply-sale-discount.js";
import {
  type ChargeSaleInCashWithChangeDiscountOutcome,
  chargeSaleInCashWithChangeDiscount,
} from "./charge-sale-in-cash-with-change-discount.js";
import { FakeOperationAuthority } from "./test-support/fake-operation-authority.js";
import {
  FakeSaleLedger,
  type FakeSaleLedgerState,
  type FakeSaleLedgerWrite,
  FixedClock,
  SequentialIds,
} from "./test-support/fake-sale-ledger.js";
import { TEN_PERCENT_SALE_DISCOUNT } from "./test-support/sale-discounts.js";

const NOW = new Date("2026-10-07T15:30:00.000Z");
const NOT_SIGNED_IN = { kind: "not_signed_in" } as const;
const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const SESSION = { id: "session-1", openedBy: "cashier" };
const OPENING: CashMovement = {
  id: "movement-0",
  sessionId: "session-1",
  type: "OPENING",
  amount: 10000,
  actorId: "cashier",
  occurredAt: new Date("2026-10-07T08:00:00.000Z"),
};
const LINE: SaleLine = {
  id: "line-1",
  productId: "yerba",
  productName: "Yerba 1 kg",
  saleUnit: "UNIT",
  weightSource: null,
  quantity: 4,
  listUnitPrice: 2400,
  priceListId: "list-1",
  promotions: [],
  manualAdjustment: null,
  promotionId: null,
  discountAmount: 0,
  lineTotal: 9600,
};
const OPEN_SALE: SaleWithLines = {
  id: "sale-1",
  registerId: "register-1",
  deviceId: "device-1",
  sessionId: "session-1",
  actorId: "cashier",
  state: "OPEN",
  saleDiscount: null,
  cashRounding: 0,
  lines: [LINE],
};
const THRESHOLD = { id: "threshold-1", amount: 10_000_000, validFrom: "2026-01-01", revision: 0 };
const OWN_GRANT: ApplySaleDiscountGrant = { actorId: "cashier", authorizedBy: undefined };
const AUTHORIZED_GRANT: ApplySaleDiscountGrant = {
  actorId: "cashier",
  authorizedBy: "supervisor",
};
const ISSUER = {
  legalName: FICTIONAL_LEGAL_NAME,
  grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
  activityStartDate: "2020-01-15",
  authorizedCuit: FICTIONAL_CUIT,
  taxStatus: "Condicion de prueba",
  version: 2,
};
const BUYER_TAX_STATUSES = [{ code: 5, description: "Consumidor Final", invoiceClass: "A/M/C" }];
const PENDING_QR = {
  id: "qr-1",
  saleId: "sale-1",
  kind: "SALE",
  method: "QR",
  provider: "MERCADOPAGO_QR",
  state: "PENDING",
  amount: 2000,
  occurredAt: new Date(NOW.getTime() - 120_000),
  waitEndsAt: new Date(NOW.getTime() + 60_000),
} as const;

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    thresholds: [THRESHOLD],
    accesses: { cashier: CASHIER },
    identity: { registerId: "register-1", deviceId: "device-1" },
    session: SESSION,
    sales: [OPEN_SALE],
    movements: [OPENING],
    issuerIdentifications: [ISSUER],
    buyerTaxStatusSets: [{ paramsVersion: 1, options: BUYER_TAX_STATUSES }],
    ...state,
  });
}

function chargeWithDiscount(
  store: FakeSaleLedger,
  { tendered, discountAmount }: { tendered: number; discountAmount: number },
  grant: ApplySaleDiscountGrant = OWN_GRANT,
): Promise<ChargeSaleInCashWithChangeDiscountOutcome | typeof NOT_SIGNED_IN> {
  return chargeSaleInCashWithChangeDiscount(
    {
      zoneRules: new FakeZoneRulesSource(),
      ledger: store,
      restoration: store.restoration,
      clock: new FixedClock(NOW),
      ids: new SequentialIds(),
      authority: new FakeOperationAuthority<ApplySaleDiscountGrant, never>({
        kind: "granted",
        grant,
      }),
    },
    { saleId: "sale-1", tendered, discountAmount },
  );
}

describe("chargeSaleInCashWithChangeDiscount", () => {
  it("applies the discount and completes the sale with the cash payment", async () => {
    const store = ledger();

    const outcome = await chargeWithDiscount(store, { tendered: 10000, discountAmount: 100 });

    expect(outcome).toEqual({
      kind: "completed",
      saleId: "sale-1",
      total: 9500,
      tendered: 10000,
      change: 500,
      cashRounding: 0,
    });
    expect(store.state.sales[0]?.state).toBe("COMPLETED");
    expect(store.state.sales[0]?.saleDiscount).toEqual({
      kind: "AMOUNT",
      amount: 100,
      reason: "Falta de cambio",
      authorizedBy: null,
    });
    expect(store.state.payments).toEqual([
      expect.objectContaining({ method: "CASH", amount: 9500, tendered: 10000, state: "APPROVED" }),
    ]);
    expect(store.transactions).toBe(1);
  });

  it("keeps the discount and the partial payment when the tendered amount does not cover the discounted total", async () => {
    const store = ledger();

    const outcome = await chargeWithDiscount(store, { tendered: 5000, discountAmount: 100 });

    expect(outcome).toEqual({
      kind: "partially_paid",
      saleId: "sale-1",
      total: 9500,
      paid: 5000,
      pending: 4500,
    });
    expect(store.state.sales[0]?.state).toBe("OPEN");
    expect(store.state.sales[0]?.saleDiscount).toEqual(
      expect.objectContaining({ kind: "AMOUNT", amount: 100, reason: "Falta de cambio" }),
    );
    expect(store.state.payments).toHaveLength(1);
  });

  it("replaces the discount on the total the sale already had", async () => {
    const store = ledger({ sales: [{ ...OPEN_SALE, saleDiscount: TEN_PERCENT_SALE_DISCOUNT }] });

    const outcome = await chargeWithDiscount(store, { tendered: 10000, discountAmount: 100 });

    expect(outcome).toEqual(expect.objectContaining({ kind: "completed", total: 9500 }));
    expect(store.state.sales[0]?.saleDiscount).toEqual(
      expect.objectContaining({ kind: "AMOUNT", amount: 100 }),
    );
  });

  it("records the person who entered their PIN as the authorizer", async () => {
    const store = ledger();

    await chargeWithDiscount(store, { tendered: 10000, discountAmount: 100 }, AUTHORIZED_GRANT);

    expect(store.state.sales[0]?.saleDiscount?.authorizedBy).toBe("supervisor");
  });

  it("answers the discount refusal and records nothing when the discount exceeds the sale", async () => {
    const store = ledger({ sales: [{ ...OPEN_SALE, saleDiscount: TEN_PERCENT_SALE_DISCOUNT }] });
    const before = structuredClone(store.state);

    const outcome = await chargeWithDiscount(store, { tendered: 10000, discountAmount: 9601 });

    expect(outcome).toEqual({ kind: "discount_exceeds_sale" });
    expect(store.state).toEqual(before);
  });

  it("answers the sale-has-payments refusal of the discount and records nothing", async () => {
    const payment = {
      id: "payment-1",
      saleId: "sale-1",
      kind: "SALE",
      method: "CASH",
      provider: "NONE",
      amount: 1000,
      tendered: 1000,
      state: "APPROVED",
      occurredAt: NOW,
    } as const;
    const store = ledger({ payments: [payment] });
    const before = structuredClone(store.state);

    const outcome = await chargeWithDiscount(store, { tendered: 10000, discountAmount: 100 });

    expect(outcome).toEqual({ kind: "sale_has_payments" });
    expect(store.state).toEqual(before);
  });

  it.each([
    [
      "the discounted total reaches the buyer identification threshold",
      { thresholds: [{ ...THRESHOLD, amount: 9500 }] },
      10000,
      { threshold: 9500 },
    ],
    ["the tendered amount is not valid", {}, 0, { kind: "invalid_amount" }],
  ])(
    "answers the charge refusal and leaves the discount unrecorded when %s",
    async (_case, state, tendered, expected) => {
      const store = ledger(state);
      const before = structuredClone(store.state);

      const outcome = await chargeWithDiscount(store, { tendered, discountAmount: 100 });

      expect(outcome).toEqual(expect.objectContaining(expected));
      expect(store.state).toEqual(before);
    },
  );

  it("refuses while a Mercado Pago charge is in progress and records nothing", async () => {
    const store = ledger({ pendingMercadoPagoPayments: [PENDING_QR] });
    const before = structuredClone(store.state);

    const outcome = await chargeWithDiscount(store, { tendered: 10000, discountAmount: 100 });

    expect(outcome).toEqual({ kind: "sale_has_payments" });
    expect(store.state).toEqual(before);
  });

  it.each<FakeSaleLedgerWrite>(["recordPayment", "recordCashMovement"])(
    "leaves the discount unrecorded when %s fails",
    async (write) => {
      const store = ledger();
      store.failOn = write;
      const before = structuredClone(store.state);

      await expect(
        chargeWithDiscount(store, { tendered: 10000, discountAmount: 100 }),
      ).rejects.toThrow();
      expect(store.state).toEqual(before);
    },
  );

  describe("authorization", () => {
    it("returns the refusal of the authority without opening any transaction", async () => {
      const store = ledger();
      const before = structuredClone(store.state);
      const authority = new FakeOperationAuthority<ApplySaleDiscountGrant, typeof NOT_SIGNED_IN>({
        kind: "refused",
        refusal: NOT_SIGNED_IN,
      });

      const outcome = await chargeSaleInCashWithChangeDiscount(
        {
          zoneRules: new FakeZoneRulesSource(),
          ledger: store,
          restoration: store.restoration,
          clock: new FixedClock(NOW),
          ids: new SequentialIds(),
          authority,
        },
        { saleId: "sale-1", tendered: 10000, discountAmount: 100 },
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

      await chargeSaleInCashWithChangeDiscount(
        {
          zoneRules: new FakeZoneRulesSource(),
          ledger: store,
          restoration: store.restoration,
          clock: new FixedClock(NOW),
          ids: new SequentialIds(),
          authority,
        },
        { saleId: "sale-1", tendered: 10000, discountAmount: 100 },
      );

      expect(transactionsWhenAsked).toBe(0);
    });
  });
});

describe("chargeSaleInCashWithChangeDiscount on a total that still is not a multiple of the smallest bill", () => {
  const SALE_OF_337_000: SaleWithLines = {
    ...OPEN_SALE,
    lines: [{ ...LINE, quantity: 1, listUnitPrice: 337_000, lineTotal: 337_000 }],
  };

  it("rounds the total left by the missing-change discount and keeps both on the sale", async () => {
    const store = ledger({ sales: [SALE_OF_337_000] });

    const outcome = await chargeWithDiscount(store, { tendered: 400_000, discountAmount: 10_000 });

    expect(outcome).toEqual({
      kind: "completed",
      saleId: "sale-1",
      total: 320_000,
      tendered: 400_000,
      change: 80_000,
      cashRounding: 7000,
    });
    expect(store.state.sales[0]).toMatchObject({
      saleDiscount: { kind: "AMOUNT", amount: 10_000, reason: "Falta de cambio" },
      cashRounding: 7000,
    });
    expect(store.state.payments[0]).toMatchObject({ amount: 320_000, tendered: 400_000 });
  });
});
