import { expect, test } from "vitest";
import { soldRowLabel } from "./sold-row-label";

const row = {
  id: null,
  path: [],
  brandName: null,
  netContent: null,
  units: 0,
  thousandths: 0,
  amount: 0,
};

test("names the sales of products with no category", () => {
  expect(soldRowLabel(row)).toBe("Sin categoría");
});

test("names a category by its path", () => {
  expect(soldRowLabel({ ...row, id: "c-1", path: ["Almacén", "Dulces"] })).toBe("Almacén › Dulces");
});

test("names a product with its brand and net content", () => {
  expect(
    soldRowLabel({
      ...row,
      id: "p-1",
      path: ["Yerba mate"],
      brandName: "Hoja Alta",
      netContent: { quantity: 1, unit: "KG" },
    }),
  ).toBe("Yerba mate Hoja Alta 1 kg");
});
