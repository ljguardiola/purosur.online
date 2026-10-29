import { lotReferenceCostBodySchema } from "@purosur/contracts";
import { expect, test } from "vitest";
import {
  costFormValuesOf,
  costMessage,
  costRequestFrom,
  EMPTY_COST_FORM,
  referenceCostLabel,
  supplierPriceMessage,
  supplierPriceOptions,
} from "./initial-inventory-cost-form";
import {
  initialLotAlmonds,
  initialLotHoney,
  supplierPriceAlfa,
  supplierPriceBeta,
} from "./test-support/stock-fixtures";

test("builds the request from the typed pesos as cents", () => {
  expect(costRequestFrom({ ...EMPTY_COST_FORM, cost: "10.180,50" })).toEqual({
    unitCostCents: 1_018_050,
  });
});

test("builds a request the contract refuses when the typed cost is not an amount", () => {
  const request = costRequestFrom({ ...EMPTY_COST_FORM, cost: "abc" });

  expect(lotReferenceCostBodySchema.safeParse(request).success).toBe(false);
});

test.each([
  { cost: "", reason: "Ingresá el costo de referencia." },
  {
    cost: "12.50",
    reason: "Escribí el costo con coma para los decimales, por ejemplo 10.180,50.",
  },
  { cost: "0", reason: "Ingresá un costo mayor a cero, de hasta $ 21.474.836,47." },
  {
    cost: "21.474.836,48",
    reason: "Ingresá un costo mayor a cero, de hasta $ 21.474.836,47.",
  },
])("a typed cost of '$cost' can't be saved: $reason", ({ cost, reason }) => {
  expect(costMessage({ ...EMPTY_COST_FORM, cost })).toBe(reason);
});

test("asks to review a cost the contract accepts but the cloud refused", () => {
  expect(costMessage({ ...EMPTY_COST_FORM, cost: "100" })).toBe("Revisá el costo.");
});

test("names the cost per the unit the product is sold by", () => {
  expect(referenceCostLabel("KG")).toBe("Costo de referencia por kg");
  expect(referenceCostLabel("UNIT")).toBe("Costo de referencia por unidad");
});

test("starts a lot with no loaded prices with an empty typed cost and no price chosen", () => {
  expect(costFormValuesOf(initialLotHoney)).toEqual({ cost: "", supplierItemId: null });
});

test("starts a lot with loaded prices on the price its cost already equals", () => {
  const lot = {
    ...initialLotAlmonds,
    supplierPrices: [
      { ...supplierPriceAlfa, cheapest: true, current: false },
      { ...supplierPriceBeta, cheapest: false, current: true },
    ],
  };

  expect(costFormValuesOf(lot)).toEqual({
    cost: "",
    supplierItemId: supplierPriceBeta.supplierItemId,
  });
});

test("starts a lot with loaded prices and none current on the cheapest", () => {
  const lot = {
    ...initialLotAlmonds,
    supplierPrices: [
      { ...supplierPriceAlfa, cheapest: true, current: false },
      { ...supplierPriceBeta, cheapest: false, current: false },
    ],
  };

  expect(costFormValuesOf(lot)).toEqual({
    cost: "",
    supplierItemId: supplierPriceAlfa.supplierItemId,
  });
});

test("builds the request from the price chosen, ignoring what was typed", () => {
  expect(costRequestFrom({ cost: "10", supplierItemId: "item-1" })).toEqual({
    supplierItemId: "item-1",
  });
});

test("offers each loaded price with its supplier, list date, packaging and cost per the unit sold, marking the cheapest", () => {
  const lot = {
    ...initialLotAlmonds,
    supplierPrices: [
      { ...supplierPriceAlfa, cheapest: true, current: false },
      { ...supplierPriceBeta, cheapest: false, current: false },
    ],
  };

  expect(supplierPriceOptions(lot)).toEqual([
    {
      value: supplierPriceAlfa.supplierItemId,
      label: "Alfa del 01/03/2026 · Caja x 10 · $ 9.500,00 / kg",
      status: "La más barata",
    },
    {
      value: supplierPriceBeta.supplierItemId,
      label: "Beta del 15/02/2026 · Bolsa · $ 10.180,00 / kg",
    },
  ]);
});

test("writes the cost of a product sold by the unit with no unit", () => {
  const lot = {
    ...initialLotHoney,
    supplierPrices: [{ ...supplierPriceAlfa, cheapest: false, current: false }],
  };

  expect(supplierPriceOptions(lot)[0]?.label).toBe("Alfa del 01/03/2026 · Caja x 10 · $ 9.500,00");
});

test("asks to choose a price when none is", () => {
  expect(supplierPriceMessage).toBe("Elegí el precio de un proveedor.");
});
