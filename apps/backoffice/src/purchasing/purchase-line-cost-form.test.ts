import { purchaseLineCostCorrectionBodySchema } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import {
  PURCHASE_LINE_COST_FIELDS,
  purchaseLineCostLabel,
  purchaseLineCostMessage,
  purchaseLineCostRequestFrom,
  purchaseLineCostValuesOf,
} from "./purchase-line-cost-form";
import { compraDeAvena, compraDeMiel } from "./test-support/purchases";

const [lineDeMiel] = compraDeMiel.lines;
const [lineDeAvena] = compraDeAvena.lines;

describe("purchaseLineCostValuesOf", () => {
  it("starts from the cost paid written as it is typed", () => {
    expect(lineDeMiel && purchaseLineCostValuesOf(lineDeMiel)).toEqual({ cost: "7.200,00" });
  });
});

describe("purchaseLineCostRequestFrom", () => {
  it.each([
    ["6.800,50", 680_050],
    ["0", 0],
  ])("sends %s as %s cents", (cost, cents) => {
    const request = purchaseLineCostRequestFrom({ cost });

    expect(request).toEqual({ costPaidCents: cents });
    expect(purchaseLineCostCorrectionBodySchema.safeParse(request).success).toBe(true);
  });

  it.each(["", "abc", "1,234"])("sends %j as a cost the shape refuses", (cost) => {
    expect(
      purchaseLineCostCorrectionBodySchema.safeParse(purchaseLineCostRequestFrom({ cost })).success,
    ).toBe(false);
  });
});

describe("the cost form's field and messages", () => {
  it("lands the wire key on its field", () => {
    expect(PURCHASE_LINE_COST_FIELDS).toEqual({ costPaidCents: "cost" });
  });

  it("asks for the cost paid with up to 2 decimals", () => {
    expect(purchaseLineCostMessage()).toBe(
      "Escribí el costo pagado con hasta 2 decimales, por ejemplo 1.250,50.",
    );
  });

  it("names what the cost is paid for: a package, or the sale unit", () => {
    expect(lineDeMiel && purchaseLineCostLabel(lineDeMiel)).toBe("Costo pagado por paquete");
    expect(lineDeAvena && purchaseLineCostLabel(lineDeAvena)).toBe("Costo pagado por kg");
  });
});
