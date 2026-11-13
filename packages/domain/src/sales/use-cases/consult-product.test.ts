import { describe, expect, it } from "vitest";
import type { ScaleReading } from "../../shared/index.js";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import { consultProduct, type ProductToConsult } from "./consult-product.js";
import type { CandidatePromotion } from "./sale-ledger.js";
import {
  FakeSaleLedger,
  type FakeSaleLedgerState,
  FixedClock,
} from "./test-support/fake-sale-ledger.js";
import { FakeScale } from "./test-support/fake-scale.js";

const WEDNESDAY = new Date("2026-09-30T12:34:56.789Z");
const TUESDAY = 2;
const WEDNESDAY_WEEKDAY = 3;
const LONG_AGO = new Date("2026-01-01T00:00:00.000Z");
const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const SESSION = { id: "session-1", openedBy: "cashier" };
const ALMENDRAS = { id: "almendras", name: "Almendras peladas", saleUnit: "KG" as const };
const LECHE = { id: "leche", name: "Leche vegetal 1 l", saleUnit: "UNIT" as const };
const STABLE_410: ScaleReading = { kind: "stable", weightThousandths: 410 };

const TEN_PERCENT_ON_WEDNESDAYS: CandidatePromotion = {
  id: "ten",
  name: "Diez los miércoles",
  benefit: { kind: "PERCENT_OFF", percent: 10 },
  active: true,
  validFrom: "2026-09-01",
  validTo: "2026-12-31",
  weekdays: [WEDNESDAY_WEEKDAY],
};
const TWENTY_PERCENT: CandidatePromotion = {
  ...TEN_PERCENT_ON_WEDNESDAYS,
  id: "twenty",
  name: "Veinte",
  benefit: { kind: "PERCENT_OFF", percent: 20 },
  weekdays: [],
};
const THREE_FOR_TWO: CandidatePromotion = {
  ...TWENTY_PERCENT,
  id: "three-for-two",
  name: "Tres por dos",
  benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 },
};

function priceOf(productId: string, unitPrice: number) {
  return { id: `price-${productId}`, productId, priceListId: "list-1", unitPrice, validFrom: LONG_AGO };
}

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    accesses: { cashier: CASHIER },
    identity: { registerId: "register-1", deviceId: "device-1" },
    session: SESSION,
    products: [ALMENDRAS, LECHE],
    barcodes: { "7790001000017": "leche" },
    prices: [priceOf("almendras", 1_890_000), priceOf("leche", 430_000)],
    stockBalances: { almendras: 12_400, leche: 14_000 },
    ...state,
  });
}

function consult(
  store: FakeSaleLedger,
  product: ProductToConsult = { productId: "almendras" },
  reading: ScaleReading = STABLE_410,
  actorId = "cashier",
) {
  return consultProduct(
    {
      ledger: store,
      restoration: store.restoration,
      clock: new FixedClock(WEDNESDAY),
      zoneRules: new FakeZoneRulesSource(),
      scale: new FakeScale(reading),
    },
    { actorId, product },
  );
}

describe("consultProduct", () => {
  it("answers a weighed product's price, the promotion in force, the amount it charges for the scale's weight and its stock", async () => {
    const store = ledger({ promotionsByProduct: { almendras: [TEN_PERCENT_ON_WEDNESDAYS] } });

    const outcome = await consult(store);

    expect(outcome).toEqual({
      kind: "consulted",
      product: ALMENDRAS,
      unitPrice: 1_890_000,
      promotion: { benefit: { kind: "PERCENT_OFF", percent: 10 }, weekdays: [WEDNESDAY_WEEKDAY] },
      weightThousandths: 410,
      amount: 697_410,
      stockThousandths: 12_400,
    });
  });

  it("leaves out a promotion not in force and charges the weight at its list price", async () => {
    const store = ledger({
      promotionsByProduct: {
        almendras: [{ ...TEN_PERCENT_ON_WEDNESDAYS, weekdays: [TUESDAY] }],
      },
    });

    const outcome = await consult(store);

    expect(outcome).toMatchObject({ kind: "consulted", promotion: null, amount: 774_900 });
  });

  it("answers the promotion that gives the largest discount when several are in force", async () => {
    const store = ledger({
      promotionsByProduct: { almendras: [TEN_PERCENT_ON_WEDNESDAYS, TWENTY_PERCENT] },
    });

    const outcome = await consult(store);

    expect(outcome).toMatchObject({
      kind: "consulted",
      promotion: { benefit: { kind: "PERCENT_OFF", percent: 20 }, weekdays: [] },
      amount: 619_920,
    });
  });

  it.each<[string, ScaleReading]>([
    ["empty", { kind: "stable", weightThousandths: 0 }],
    ["unsteady", { kind: "unstable", weightThousandths: 410 }],
    ["still settling", { kind: "not_stable" }],
    ["not connected", { kind: "unavailable" }],
  ])("answers no weight and no amount while the scale is %s, keeping price, promotion and stock", async (_, reading) => {
    const store = ledger({ promotionsByProduct: { almendras: [TEN_PERCENT_ON_WEDNESDAYS] } });

    const outcome = await consult(store, { productId: "almendras" }, reading);

    expect(outcome).toEqual({
      kind: "consulted",
      product: ALMENDRAS,
      unitPrice: 1_890_000,
      promotion: { benefit: { kind: "PERCENT_OFF", percent: 10 }, weekdays: [WEDNESDAY_WEEKDAY] },
      weightThousandths: null,
      amount: null,
      stockThousandths: 12_400,
    });
  });

  it("answers a product sold by unit with no weight and the amount of one unit with the promotion in force", async () => {
    const store = ledger({ promotionsByProduct: { leche: [TEN_PERCENT_ON_WEDNESDAYS] } });

    const outcome = await consult(store, { productId: "leche" });

    expect(outcome).toEqual({
      kind: "consulted",
      product: LECHE,
      unitPrice: 430_000,
      promotion: { benefit: { kind: "PERCENT_OFF", percent: 10 }, weekdays: [WEDNESDAY_WEEKDAY] },
      weightThousandths: null,
      amount: 387_000,
      stockThousandths: 14_000,
    });
  });

  it("answers no promotion for one unit when only a buy-N-pay-M promotion is in force", async () => {
    const store = ledger({ promotionsByProduct: { leche: [THREE_FOR_TWO] } });

    const outcome = await consult(store, { productId: "leche" });

    expect(outcome).toMatchObject({ kind: "consulted", promotion: null, amount: 430_000 });
  });

  it("finds the product by its barcode", async () => {
    const outcome = await consult(ledger(), { barcode: "7790001000017" });

    expect(outcome).toMatchObject({ kind: "consulted", product: LECHE });
  });

  it.each<[string, ProductToConsult]>([
    ["an unknown barcode", { barcode: "0000000000000" }],
    ["an unknown product", { productId: "missing" }],
  ])("answers not found for %s", async (_, product) => {
    const outcome = await consult(ledger(), product);

    expect(outcome).toEqual({ kind: "not_found" });
  });

  it("answers an unknown stock when the register holds no balance for the product", async () => {
    const store = ledger({ stockBalances: {} });

    const outcome = await consult(store);

    expect(outcome).toMatchObject({ kind: "consulted", stockThousandths: null });
  });

  it("answers a negative balance as it is", async () => {
    const store = ledger({ stockBalances: { almendras: -500 } });

    const outcome = await consult(store);

    expect(outcome).toMatchObject({ kind: "consulted", stockThousandths: -500 });
  });

  it("answers no amount and no promotion for a product without a price", async () => {
    const store = ledger({
      prices: [],
      promotionsByProduct: { almendras: [TEN_PERCENT_ON_WEDNESDAYS] },
    });

    const outcome = await consult(store);

    expect(outcome).toMatchObject({
      kind: "consulted",
      unitPrice: null,
      promotion: null,
      weightThousandths: 410,
      amount: null,
    });
  });

  it("refuses a person who may not sell", async () => {
    const outcome = await consult(ledger(), { productId: "almendras" }, STABLE_410, "stranger");

    expect(outcome).toEqual({ kind: "not_permitted" });
  });

  it("refuses while no cash session is open", async () => {
    const outcome = await consult(ledger({ session: undefined }));

    expect(outcome).toEqual({ kind: "no_open_session" });
  });

  it("leaves the sale and the stock as they were", async () => {
    const store = ledger({ promotionsByProduct: { almendras: [TEN_PERCENT_ON_WEDNESDAYS] } });
    const before = structuredClone(store.state);

    await consult(store);

    expect(store.state).toEqual(before);
  });
});
