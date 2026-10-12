import { describe, expect, it } from "vitest";
import { MAX_STOCK_QUANTITY } from "../model/stock-quantity.js";
import type { CountScaleReading } from "./initial-count-ledger.js";
import {
  FakeCountScale,
  FakeInitialCountLedger,
  type FakeInitialCountState,
} from "./test-support/fake-initial-count-ledger.js";
import { weighCountedProduct } from "./weigh-counted-product.js";

const COUNTER = { isAdministrator: false, permissionKeys: ["record_initial_inventory"] };
const YERBA = { id: "yerba", name: "Yerba 1 kg", saleUnit: "UNIT" as const };
const QUESO = { id: "queso", name: "Queso cremoso", saleUnit: "KG" as const };
const STABLE_1250: CountScaleReading = { kind: "stable", weightThousandths: 1_250 };

function ledger(state: Partial<FakeInitialCountState> = {}): FakeInitialCountLedger {
  return new FakeInitialCountLedger({
    accesses: { counter: COUNTER },
    products: [YERBA, QUESO],
    ...state,
  });
}

function weigh(store: FakeInitialCountLedger, scale: FakeCountScale, productId = "queso") {
  return weighCountedProduct({ ledger: store, scale }, { actorId: "counter", productId });
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

  it.each([0, -5, MAX_STOCK_QUANTITY + 1])(
    "keeps weighing for a stable reading of %s that is no quantity",
    async (weightThousandths) => {
      const scale = new FakeCountScale({ kind: "stable", weightThousandths });

      expect(await weigh(ledger(), scale)).toEqual({ kind: "weighing" });
    },
  );

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
