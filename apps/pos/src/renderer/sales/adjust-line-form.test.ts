import { describe, expect, it } from "vitest";
import {
  ADJUST_LINE_REASONS,
  adjustLineFormRequestSchema,
  adjustLineRequestFrom,
  adjustLineValueMessage,
  EMPTY_ADJUST_LINE_FORM,
  previewAdjustmentFrom,
  REQUIRED_REASON_MESSAGE,
} from "./adjust-line-form";

describe("adjustLineRequestFrom", () => {
  it("reads a typed price as cents", () => {
    const request = adjustLineRequestFrom({
      kind: "PRICE",
      value: "1.500,50",
      reasonOption: "Otro",
      otherReason: "Vence pronto",
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
      reasonOption: "Otro",
      otherReason: "Envase dañado",
    });

    expect(request.adjustment).toEqual({ kind: "AMOUNT", value: 50_000 });
    expect(adjustLineFormRequestSchema.safeParse(request).success).toBe(true);
  });

  it("reads a typed percentage as a whole number", () => {
    const request = adjustLineRequestFrom({
      kind: "PERCENT",
      value: "10",
      reasonOption: "Otro",
      otherReason: "Cliente frecuente",
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
    const request = adjustLineRequestFrom({
      kind,
      value,
      reasonOption: "Otro",
      otherReason: "Motivo",
    });

    expect(adjustLineFormRequestSchema.safeParse(request).success).toBe(false);
  });

  it.each([
    ["PERCENT", "0"],
    ["PERCENT", "101"],
    ["AMOUNT", "0"],
  ] as const)("has the shape refuse %s %j", (kind, value) => {
    const request = adjustLineRequestFrom({
      kind,
      value,
      reasonOption: "Otro",
      otherReason: "Motivo",
    });

    expect(adjustLineFormRequestSchema.safeParse(request).success).toBe(false);
  });

  it("has the shape refuse a reason with only blanks", () => {
    const request = adjustLineRequestFrom({
      ...EMPTY_ADJUST_LINE_FORM,
      value: "100",
      reasonOption: "Otro",
      otherReason: "   ",
    });

    expect(adjustLineFormRequestSchema.safeParse(request).success).toBe(false);
  });

  it("sends the chosen chip's text as the reason", () => {
    const request = adjustLineRequestFrom({
      kind: "PRICE",
      value: "7.000",
      reasonOption: "Producto dañado",
      otherReason: "ignored text",
    });

    expect(request.reason).toBe("Producto dañado");
    expect(adjustLineFormRequestSchema.safeParse(request).success).toBe(true);
  });

  it("sends what was typed, trimmed, when the reason is Otro", () => {
    const request = adjustLineRequestFrom({
      kind: "PRICE",
      value: "7.000",
      reasonOption: "Otro",
      otherReason: "  Vence pronto  ",
    });

    expect(request.reason).toBe("Vence pronto");
  });

  it("has the shape refuse Otro with nothing typed", () => {
    const request = adjustLineRequestFrom({
      ...EMPTY_ADJUST_LINE_FORM,
      value: "7.000",
      reasonOption: "Otro",
    });

    expect(adjustLineFormRequestSchema.safeParse(request).success).toBe(false);
  });

  it("offers the label price, a damaged product and Otro as reasons", () => {
    expect(ADJUST_LINE_REASONS).toEqual(["Precio de etiqueta", "Producto dañado", "Otro"]);
  });

  it("starts on a new price with the label price as the reason", () => {
    expect(EMPTY_ADJUST_LINE_FORM).toEqual({
      kind: "PRICE",
      value: "",
      reasonOption: "Precio de etiqueta",
      otherReason: "",
    });
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
    expect(REQUIRED_REASON_MESSAGE).toBe("Escribí un motivo.");
  });
});

describe("previewAdjustmentFrom", () => {
  it.each([
    ["PRICE", "1.500,50", { kind: "PRICE", value: 150_050 }],
    ["PRICE", "0", { kind: "PRICE", value: 0 }],
    ["AMOUNT", "500", { kind: "AMOUNT", value: 50_000 }],
    ["PERCENT", "10", { kind: "PERCENT", value: 10 }],
    ["PERCENT", "100", { kind: "PERCENT", value: 100 }],
  ] as const)("reads %s %j as the adjustment to preview", (kind, value, expected) => {
    expect(previewAdjustmentFrom({ kind, value })).toEqual(expected);
  });

  it.each([
    ["PRICE", ""],
    ["PRICE", "mil"],
    ["AMOUNT", "5,"],
    ["AMOUNT", "0"],
    ["PERCENT", ""],
    ["PERCENT", "10,5"],
    ["PERCENT", "0"],
    ["PERCENT", "101"],
  ] as const)("previews nothing for %s %j", (kind, value) => {
    expect(previewAdjustmentFrom({ kind, value })).toBeUndefined();
  });
});
