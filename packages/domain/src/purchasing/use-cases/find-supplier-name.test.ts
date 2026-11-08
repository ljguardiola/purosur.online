import { describe, expect, it } from "vitest";
import { findSupplierName } from "./find-supplier-name.js";
import { FakePurchasingListReader } from "./test-support/fake-purchasing-list-reader.js";

const norte = {
  id: "s-1",
  name: "Norte",
  cuit: null,
  contact: null,
  note: null,
  active: false,
  version: 2,
};

describe("findSupplierName", () => {
  it("answers the name of the supplier asked for, active or not", async () => {
    const reader = new FakePurchasingListReader({
      suppliers: [{ ...norte, id: "s-2", name: "Sur", active: true }, norte],
    });

    expect(await findSupplierName(reader, "s-1")).toEqual({ kind: "found", name: "Norte" });
  });

  it("answers not found for an id no supplier has", async () => {
    const reader = new FakePurchasingListReader({ suppliers: [norte] });

    expect(await findSupplierName(reader, "s-9")).toEqual({ kind: "not_found" });
  });
});
