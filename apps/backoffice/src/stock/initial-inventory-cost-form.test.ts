import { lotReferenceCostBodySchema } from "@purosur/contracts";
import { expect, test } from "vitest";
import {
  costMessage,
  costRequestFrom,
  EMPTY_COST_FORM,
  referenceCostLabel,
} from "./initial-inventory-cost-form";

test("builds the request from the typed pesos as cents", () => {
  expect(costRequestFrom({ cost: "10.180,50" })).toEqual({ unitCostCents: 1_018_050 });
});

test("builds a request the contract refuses when the typed cost is not an amount", () => {
  const request = costRequestFrom({ cost: "abc" });

  expect(lotReferenceCostBodySchema.safeParse(request).success).toBe(false);
});

test.each([
  { cost: "", reason: "Ingresá el costo de referencia." },
  {
    cost: "12.50",
    reason: "Escribí el costo con coma para los decimales, por ejemplo 10.180,50.",
  },
  { cost: "0", reason: "Ingresá un costo mayor a cero." },
])("a typed cost of '$cost' can't be saved: $reason", ({ cost, reason }) => {
  expect(costMessage({ ...EMPTY_COST_FORM, cost })).toBe(reason);
});

test("names the cost per the unit the product is sold by", () => {
  expect(referenceCostLabel("KG")).toBe("Costo de referencia por kg");
  expect(referenceCostLabel("UNIT")).toBe("Costo de referencia por unidad");
});
