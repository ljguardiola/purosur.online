import { describe, expect, it } from "vitest";
import { allocateInternalBarcode } from "./allocate-internal-barcode.js";
import { FakeInternalBarcodeStore } from "./test-support/fake-internal-barcode-store.js";

describe("allocateInternalBarcode", () => {
  it("gives the sequence's next value with its EAN-13 check digit appended", async () => {
    const store = new FakeInternalBarcodeStore({ nextValue: 200000000001n });

    expect(await allocateInternalBarcode(store)).toEqual({
      kind: "allocated",
      code: "2000000000015",
    });
  });

  it("skips every value whose code a product already has", async () => {
    const store = new FakeInternalBarcodeStore({
      nextValue: 200000000001n,
      assignedCodes: ["2000000000015", "2000000000022"],
    });

    const outcome = await allocateInternalBarcode(store);

    expect(outcome).toEqual({ kind: "allocated", code: "2000000000039" });
    expect(store.checkedCodes).toEqual(["2000000000015", "2000000000022", "2000000000039"]);
  });

  it("gives a different code on consecutive allocations", async () => {
    const store = new FakeInternalBarcodeStore({ nextValue: 200000000001n });

    const first = await allocateInternalBarcode(store);
    const second = await allocateInternalBarcode(store);

    expect([first, second]).toEqual([
      { kind: "allocated", code: "2000000000015" },
      { kind: "allocated", code: "2000000000022" },
    ]);
  });
});
