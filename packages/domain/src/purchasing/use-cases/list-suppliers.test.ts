import { FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { describe, expect, it } from "vitest";
import { listSuppliers } from "./list-suppliers.js";
import { FakePurchasingListReader } from "./test-support/fake-purchasing-list-reader.js";

describe("listSuppliers", () => {
  it("answers every supplier, active and inactive, as the reader holds them", async () => {
    const norte = {
      id: "s-1",
      name: "Norte",
      cuit: FICTIONAL_CUIT,
      contact: null,
      note: null,
      active: true,
      version: 1,
    };
    const sur = { ...norte, id: "s-2", name: "Sur", cuit: null, active: false, version: 4 };

    expect(await listSuppliers(new FakePurchasingListReader({ suppliers: [sur, norte] }))).toEqual([
      norte,
      sur,
    ]);
  });

  it("answers nothing when there are no suppliers", async () => {
    expect(await listSuppliers(new FakePurchasingListReader())).toEqual([]);
  });
});
