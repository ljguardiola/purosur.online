import { describe, expect, it } from "vitest";
import { costPaidOf, quantityOf, unitCostOf } from "./purchase-line-text";
import { compraDeAvena, compraDeMiel } from "./test-support/purchases";

const [lineDeMiel] = compraDeMiel.lines;
const [lineDeAvena] = compraDeAvena.lines;

describe("quantityOf", () => {
  it("writes the packages with what each holds and the total", () => {
    expect(lineDeMiel && quantityOf(lineDeMiel)).toBe("2 × 12 u (24 u)");
  });

  it("writes a line loaded by quantity as its total", () => {
    expect(lineDeAvena && quantityOf(lineDeAvena)).toBe("12,500 kg");
  });
});

describe("costPaidOf", () => {
  it("writes the cost paid per package, or per sale unit", () => {
    expect(lineDeMiel && costPaidOf(lineDeMiel)).toBe("$ 7.200,00 por paquete");
    expect(lineDeAvena && costPaidOf(lineDeAvena)).toBe("$ 2.000,00 por kg");
  });
});

describe("unitCostOf", () => {
  it("writes the cost of each sale unit", () => {
    expect(lineDeMiel && unitCostOf(lineDeMiel)).toBe("$ 600,00 por u");
  });
});
