import { describe, expect, it } from "vitest";
import type { BuyerTaxStatusOption } from "../model/buyer-tax-status-set.js";
import { recordBuyerTaxStatusSet } from "./record-buyer-tax-status-set.js";
import { FakeBuyerTaxStatusStore } from "./test-support/fake-buyer-tax-status-store.js";

const a: BuyerTaxStatusOption = {
  code: 901,
  description: "Condicion de prueba A",
  invoiceClass: "A",
};
const b: BuyerTaxStatusOption = {
  code: 902,
  description: "Condicion de prueba B",
  invoiceClass: "B",
};
const c: BuyerTaxStatusOption = {
  code: 903,
  description: "Condicion de prueba C",
  invoiceClass: "C",
};

describe("recordBuyerTaxStatusSet", () => {
  it("records the first set as version 1", async () => {
    const store = new FakeBuyerTaxStatusStore();

    const outcome = await recordBuyerTaxStatusSet({ store }, { options: [a, b] });

    expect(outcome).toEqual({ kind: "recorded", paramsVersion: 1 });
    expect(store.snapshot()).toEqual([{ paramsVersion: 1, options: [a, b] }]);
  });

  it("records a different set as the next version after the current one, keeping the previous", async () => {
    const store = new FakeBuyerTaxStatusStore();
    store.seedVersion({ paramsVersion: 1, options: [a] });
    store.seedVersion({ paramsVersion: 2, options: [a, b] });

    const outcome = await recordBuyerTaxStatusSet({ store }, { options: [a, b, c] });

    expect(outcome).toEqual({ kind: "recorded", paramsVersion: 3 });
    expect(store.snapshot()).toEqual([
      { paramsVersion: 1, options: [a] },
      { paramsVersion: 2, options: [a, b] },
      { paramsVersion: 3, options: [a, b, c] },
    ]);
  });

  it("records nothing for the current set in another order", async () => {
    const store = new FakeBuyerTaxStatusStore();
    store.seedVersion({ paramsVersion: 4, options: [a, b] });
    const before = store.snapshot();

    const outcome = await recordBuyerTaxStatusSet({ store }, { options: [b, a] });

    expect(outcome).toEqual({ kind: "unchanged", paramsVersion: 4 });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lockCurrentBuyerTaxStatusSet"]);
  });

  it("records a set equal to an older version, as it differs from the current one", async () => {
    const store = new FakeBuyerTaxStatusStore();
    store.seedVersion({ paramsVersion: 1, options: [a] });
    store.seedVersion({ paramsVersion: 2, options: [a, b] });

    const outcome = await recordBuyerTaxStatusSet({ store }, { options: [a] });

    expect(outcome).toEqual({ kind: "recorded", paramsVersion: 3 });
  });

  it.each([
    ["empty", []],
    ["made of options sharing a code", [a, { ...b, code: a.code }]],
  ])("refuses a set that is %s, writing nothing", async (_case, options) => {
    const store = new FakeBuyerTaxStatusStore();
    store.seedVersion({ paramsVersion: 1, options: [a] });
    const before = store.snapshot();

    const outcome = await recordBuyerTaxStatusSet({ store }, { options });

    expect(outcome).toEqual({ kind: "invalid_set" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual([]);
  });

  it("reads the current set before it records, in one transaction", async () => {
    const store = new FakeBuyerTaxStatusStore();

    await recordBuyerTaxStatusSet({ store }, { options: [a] });

    expect(store.operationOrder).toEqual([
      "lockCurrentBuyerTaxStatusSet",
      "recordBuyerTaxStatusSet",
    ]);
    expect(store.transactionCount).toBe(1);
  });
});
