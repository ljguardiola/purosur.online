import { describe, expect, it } from "vitest";
import type { ScaleReading } from "../../shared/index.js";
import { MAX_STOCK_QUANTITY } from "../model/stock-quantity.js";
import {
  FakeCountScale,
  FakeInitialCountLedger,
  type FakeInitialCountState,
} from "./test-support/fake-initial-count-ledger.js";
import { weighCountedProduct } from "./weigh-counted-product.js";

const COUNTER = { isAdministrator: false, permissionKeys: ["record_initial_inventory"] };
const YERBA = { id: "yerba", name: "Yerba 1 kg", saleUnit: "UNIT" as const };
const QUESO = { id: "queso", name: "Queso cremoso", saleUnit: "KG" as const };
const STABLE_1250: ScaleReading = { kind: "stable", weightThousandths: 1_250 };

function ledger(state: Partial<FakeInitialCountState> = {}): FakeInitialCountLedger {
  return new FakeInitialCountLedger({
    accesses: { counter: COUNTER },
    products: [YERBA, QUESO],
    ...state,
  });
}

function weigh(
  store: FakeInitialCountLedger,
  scale: FakeCountScale,
  productId = "queso",
  confirmedWeightThousandths: number | null = null,
) {
  return weighCountedProduct(
    { ledger: store, scale },
    { actorId: "counter", productId, confirmedWeightThousandths },
  );
}

describe("weighCountedProduct", () => {
  it("answers the weight of a stable reading, adding no line", async () => {
    const store = ledger();

    const outcome = await weigh(store, new FakeCountScale(STABLE_1250));

    expect(outcome).toEqual({ kind: "weighed", weightThousandths: 1_250 });
    expect(store.state.movements).toEqual([]);
    expect(store.state.balances).toEqual({});
    expect(store.state.outbox).toEqual([]);
  });

  it("keeps weighing while the scale is not stable", async () => {
    expect(await weigh(ledger(), new FakeCountScale({ kind: "not_stable" }))).toEqual({
      kind: "weighing",
    });
  });

  it.each([-5, MAX_STOCK_QUANTITY + 1])(
    "keeps weighing for a stable reading of %s that is no quantity",
    async (weightThousandths) => {
      const reading: ScaleReading = { kind: "stable", weightThousandths };

      expect(await weigh(ledger(), new FakeCountScale(reading))).toEqual({ kind: "weighing" });
      expect(
        await weigh(ledger(), new FakeCountScale(reading), "queso", weightThousandths),
      ).toEqual({ kind: "weighing" });
    },
  );

  it.each([null, 0, 1_250])("tells a stable zero apart, confirming %s", async (confirmed) => {
    const scale = new FakeCountScale({ kind: "stable", weightThousandths: 0 });

    expect(await weigh(ledger(), scale, "queso", confirmed)).toEqual({ kind: "zero_weight" });
  });

  it("confirms a stable reading equal to the weight being confirmed", async () => {
    expect(await weigh(ledger(), new FakeCountScale(STABLE_1250), "queso", 1_250)).toEqual({
      kind: "confirmed",
      weightThousandths: 1_250,
    });
  });

  it("answers a stable reading other than the weight being confirmed as a new weight", async () => {
    expect(await weigh(ledger(), new FakeCountScale(STABLE_1250), "queso", 1_000)).toEqual({
      kind: "weighed",
      weightThousandths: 1_250,
    });
  });

  it("confirms the largest quantity when it is the weight being confirmed", async () => {
    const scale = new FakeCountScale({ kind: "stable", weightThousandths: MAX_STOCK_QUANTITY });

    expect(await weigh(ledger(), scale, "queso", MAX_STOCK_QUANTITY)).toEqual({
      kind: "confirmed",
      weightThousandths: MAX_STOCK_QUANTITY,
    });
  });

  it("says the scale is unavailable when it cannot be read", async () => {
    expect(await weigh(ledger(), new FakeCountScale({ kind: "unavailable" }))).toEqual({
      kind: "scale_unavailable",
    });
  });

  it("refuses a product that does not exist, without reading the scale", async () => {
    const scale = new FakeCountScale(STABLE_1250);

    expect(await weigh(ledger(), scale, "ghost")).toEqual({ kind: "unknown_product" });
    expect(scale.reads).toBe(0);
  });

  it("refuses a product that is not sold by weight, without reading the scale", async () => {
    const scale = new FakeCountScale(STABLE_1250);

    expect(await weigh(ledger(), scale, "yerba")).toEqual({ kind: "not_sold_by_weight" });
    expect(scale.reads).toBe(0);
  });

  it("refuses a person who may not record the initial inventory, without reading the scale", async () => {
    const scale = new FakeCountScale(STABLE_1250);

    expect(await weigh(ledger({ accesses: {} }), scale)).toEqual({ kind: "not_permitted" });
    expect(scale.reads).toBe(0);
  });

  it("is not offered once the branch's first cash session has opened, without reading the scale", async () => {
    const scale = new FakeCountScale(STABLE_1250);

    expect(await weigh(ledger({ branchFirstSessionOpened: true }), scale)).toEqual({
      kind: "not_offered",
    });
    expect(scale.reads).toBe(0);
  });
});
