import { expect, test } from "vitest";
import { marginRowLabel } from "./margin-row-label";

const row = {
  id: null,
  path: [],
  brandName: null,
  netContent: null,
  amount: 0,
  cost: 0,
  margin: 0,
  marginTenthsOfPercent: null,
  incompleteSales: 0,
};

test("names the margin of products with no category", () => {
  expect(marginRowLabel(row)).toBe("Sin categoría");
});

test("names a category by its path", () => {
  expect(marginRowLabel({ ...row, id: "c-1", path: ["Almacén", "Dulces"] })).toBe(
    "Almacén › Dulces",
  );
});

test("names a product with its brand and net content", () => {
  expect(
    marginRowLabel({
      ...row,
      id: "p-1",
      path: ["Yerba mate"],
      brandName: "Hoja Alta",
      netContent: { quantity: 1, unit: "KG" },
    }),
  ).toBe("Yerba mate Hoja Alta 1 kg");
});
