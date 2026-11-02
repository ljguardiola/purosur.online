import { describe, expect, it } from "vitest";
import { purchaseOrderDocument } from "./purchase-order-document.js";
import { documentSource } from "./test-support/purchase-order-document-fixtures.js";

describe("purchaseOrderDocument", () => {
  it("titles the document with the supplier and dates it with the day it was created", () => {
    const document = purchaseOrderDocument(documentSource());

    expect(document.title).toBe("Pedido a Distribuidora Sur");
    expect(document.createdDay).toBe("10/03/2026");
  });

  it("dates the document with the day it was created in Argentina", () => {
    const document = purchaseOrderDocument(
      documentSource({ createdAt: new Date("2026-03-10T01:30:00.000Z") }),
    );

    expect(document.createdDay).toBe("09/03/2026");
  });

  it("gives each line its product, the supplier's own item when it has one and its quantity", () => {
    expect(purchaseOrderDocument(documentSource()).lines).toEqual([
      {
        product: "Yerba Piragüé 500 g",
        supplierItem: "YER-500 - Yerba mate 500 g x12",
        quantity: "3 paquetes de 12 u",
      },
      { product: "Harina", supplierItem: null, quantity: "1 paquete de 25 kg" },
    ]);
  });

  it("names a supplier item without a code by its description only", () => {
    const [line] = documentSource().lines;
    if (!line) {
      throw new Error("the fixture has a line");
    }
    const document = purchaseOrderDocument(
      documentSource({
        lines: [{ ...line, supplierItem: { code: null, description: "Yerba mate 500 g x12" } }],
      }),
    );

    expect(document.lines[0]?.supplierItem).toBe("Yerba mate 500 g x12");
  });

  it("writes packages and the quantity in each with the plural and the number format of es-AR", () => {
    const [unitLine, kilogramLine] = documentSource().lines;
    if (!(unitLine && kilogramLine)) {
      throw new Error("the fixture has two lines");
    }
    const quantityOf = (line: typeof unitLine) =>
      purchaseOrderDocument(documentSource({ lines: [line] })).lines[0]?.quantity;

    expect([
      quantityOf({ ...unitLine, packages: 1, quantityPerPackage: 6_000 }),
      quantityOf({ ...unitLine, packages: 2, quantityPerPackage: 12_000 }),
      quantityOf({ ...unitLine, packages: 1_000, quantityPerPackage: 12_000 }),
      quantityOf({ ...kilogramLine, packages: 2, quantityPerPackage: 500 }),
      quantityOf({ ...kilogramLine, packages: 3, quantityPerPackage: 1_500 }),
    ]).toEqual([
      "1 paquete de 6 u",
      "2 paquetes de 12 u",
      "1.000 paquetes de 12 u",
      "2 paquetes de 500 g",
      "3 paquetes de 1,5 kg",
    ]);
  });

  it("carries no price", () => {
    const [line] = documentSource().lines;
    if (!line) {
      throw new Error("the fixture has a line");
    }
    const priced = { ...line, expectedPackagePriceCents: 1_234_500, expectedTotalCents: 3_703_500 };

    const document = purchaseOrderDocument(documentSource({ lines: [priced] }));

    expect(Object.keys(document.lines[0] ?? {}).sort()).toEqual([
      "product",
      "quantity",
      "supplierItem",
    ]);
    expect(JSON.stringify(document)).not.toMatch(/1234|3703|\$/);
  });
});
