import { describe, expect, it } from "vitest";
import { listPurchaseChoices } from "./list-purchase-choices.js";
import { FakePurchasingListReader } from "./test-support/fake-purchasing-list-reader.js";

const CLOCK = { now: () => new Date("2026-09-16T15:00:00.000Z") };
const YERBA = { id: "p-unit", name: "Yerba", saleUnit: "UNIT", active: true } as const;
const HARINA = { id: "p-kg", name: "Harina", saleUnit: "KG", active: true } as const;

function supplier(id: string, name: string, active: boolean) {
  return { id, name, cuit: null, contact: null, note: null, active, version: 1 };
}

function packaging(overrides: {
  id: string;
  name: string;
  active?: boolean;
  saleUnit?: "UNIT" | "KG";
}) {
  return {
    productId: "p-unit",
    quantityPerPackage: 12_000,
    saleUnit: "UNIT" as const,
    active: true,
    version: 1,
    ...overrides,
  };
}

describe("listPurchaseChoices", () => {
  it("offers only the suppliers a purchase may be registered from", async () => {
    const andina = supplier("s-1", "Andina", true);
    const reader = new FakePurchasingListReader({
      suppliers: [andina, supplier("s-2", "Cerrada", false)],
    });

    expect((await listPurchaseChoices(reader, CLOCK)).suppliers).toEqual([andina]);
  });

  it("offers only the packagings a line may be loaded by, with their product", async () => {
    const caja = packaging({ id: "k-1", name: "Caja x 12" });
    const reader = new FakePurchasingListReader({
      products: [YERBA, HARINA],
      packagings: [
        caja,
        packaging({ id: "k-2", name: "Vieja", active: false }),
        packaging({ id: "k-3", name: "Por kilo", saleUnit: "KG" }),
      ],
    });

    expect((await listPurchaseChoices(reader, CLOCK)).packagings).toEqual([
      { ...caja, productName: "Yerba", productSaleUnit: "UNIT", saleUnitChanged: false },
    ]);
  });

  it("answers the day it is in Argentina as the day today's purchases are dated", async () => {
    const clock = { now: () => new Date("2026-09-17T01:00:00.000Z") };

    expect((await listPurchaseChoices(new FakePurchasingListReader({}), clock)).today).toBe(
      "2026-09-16",
    );
  });
});
