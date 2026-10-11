import { describe, expect, it } from "vitest";
import { lineAdjustmentOrigin, lineAdjustmentText } from "./line-adjustment-text";

describe("lineAdjustmentText", () => {
  it("writes the new unit price of a price change", () => {
    expect(lineAdjustmentText({ kind: "PRICE", value: 150_000 })).toBe(
      "Precio modificado: $ 1.500,00",
    );
  });

  it("writes a percentage discount with a spaced percent sign", () => {
    expect(lineAdjustmentText({ kind: "PERCENT", value: 10 })).toBe("Descuento manual 10 %");
  });

  it("writes a fixed amount discount as money", () => {
    expect(lineAdjustmentText({ kind: "AMOUNT", value: 50_000 })).toBe(
      "Descuento manual $ 500,00",
    );
  });
});

describe("lineAdjustmentOrigin", () => {
  it("gives the reason and who authorized it", () => {
    expect(
      lineAdjustmentOrigin({
        reason: "Envase dañado",
        authorized_by: { user_id: "u3", first_name: "Sofía" },
      }),
    ).toBe("Motivo: Envase dañado · Autorizó Sofía");
  });

  it("gives only the reason when nobody had to authorize it", () => {
    expect(lineAdjustmentOrigin({ reason: "Envase dañado", authorized_by: null })).toBe(
      "Motivo: Envase dañado",
    );
  });
});
