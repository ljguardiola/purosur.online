import { describe, expect, it } from "vitest";
import {
  adjustLineFormRequestSchema,
  adjustLineRequestFrom,
  adjustLineValueMessage,
  EMPTY_ADJUST_LINE_FORM,
  REQUIRED_REASON_MESSAGE,
} from "./adjust-line-form";

describe("adjustLineRequestFrom", () => {
  it("reads a typed price as cents", () => {
    const request = adjustLineRequestFrom({
      kind: "PRICE",
      value: "1.500,50",
      reason: "Vence pronto",
    });

    expect(request).toEqual({
      adjustment: { kind: "PRICE", value: 150_050 },
      reason: "Vence pronto",
    });
    expect(adjustLineFormRequestSchema.safeParse(request).success).toBe(true);
  });

  it("reads a typed discount amount as cents", () => {
    const request = adjustLineRequestFrom({
      kind: "AMOUNT",
      value: "500",
      reason: "Envase dañado",
    });

    expect(request.adjustment).toEqual({ kind: "AMOUNT", value: 50_000 });
    expect(adjustLineFormRequestSchema.safeParse(request).success).toBe(true);
  });

  it("reads a typed percentage as a whole number", () => {
    const request = adjustLineRequestFrom({
      kind: "PERCENT",
      value: "10",
      reason: "Cliente frecuente",
    });

    expect(request.adjustment).toEqual({ kind: "PERCENT", value: 10 });
    expect(adjustLineFormRequestSchema.safeParse(request).success).toBe(true);
  });

  it.each([
    ["PRICE", ""],
    ["PRICE", "mil"],
    ["AMOUNT", "5,"],
    ["PERCENT", ""],
    ["PERCENT", "10,5"],
  ] as const)("leaves %s %j for the shape to refuse", (kind, value) => {
    const request = adjustLineRequestFrom({ kind, value, reason: "Motivo" });

    expect(adjustLineFormRequestSchema.safeParse(request).success).toBe(false);
  });

  it.each([
    ["PERCENT", "0"],
    ["PERCENT", "101"],
    ["AMOUNT", "0"],
  ] as const)("has the shape refuse %s %j", (kind, value) => {
    const request = adjustLineRequestFrom({ kind, value, reason: "Motivo" });

    expect(adjustLineFormRequestSchema.safeParse(request).success).toBe(false);
  });

  it("has the shape refuse a reason with only blanks", () => {
    const request = adjustLineRequestFrom({
      ...EMPTY_ADJUST_LINE_FORM,
      value: "100",
      reason: "   ",
    });

    expect(adjustLineFormRequestSchema.safeParse(request).success).toBe(false);
  });

  it("starts as a price change with nothing typed", () => {
    expect(EMPTY_ADJUST_LINE_FORM).toEqual({ kind: "PRICE", value: "", reason: "" });
  });
});

describe("adjustLineValueMessage", () => {
  it("tells how to type each kind of value", () => {
    expect(adjustLineValueMessage("PRICE")).toBe("Ingresá un precio válido, por ejemplo 1.500,00.");
    expect(adjustLineValueMessage("AMOUNT")).toBe(
      "Ingresá un descuento mayor a 0, por ejemplo 500,00.",
    );
    expect(adjustLineValueMessage("PERCENT")).toBe("Ingresá un porcentaje entero, por ejemplo 10.");
  });

  it("asks for the reason", () => {
    expect(REQUIRED_REASON_MESSAGE).toBe("Escribí el motivo del ajuste.");
  });
});
