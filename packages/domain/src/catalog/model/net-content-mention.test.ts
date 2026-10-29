import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { mentionsNetContent } from "./net-content-mention.js";
import type { NetContentUnit } from "./product.js";

const content = (quantity: number, unit: NetContentUnit) => ({ quantity, unit });

describe("mentionsNetContent", () => {
  it.each([
    ["Granola 1kg", content(1, "KG")],
    ["Granola 1 kg", content(1, "KG")],
    ["Granola 1000 g", content(1, "KG")],
    ["Granola 0,5 kg", content(500, "G")],
    ["Granola 0.5 kg", content(500, "G")],
    ["Granola 500 grs", content(0.5, "KG")],
    ["Gaseosa 250 cc", content(250, "ML")],
    ["Gaseosa 1,5 lt", content(1500, "ML")],
    ["Gaseosa 1500 ml", content(1.5, "L")],
    ["Huevos 12 u", content(12, "UNIT")],
    ["Huevos 12 unidades", content(12, "UNIT")],
    ["Aceite 1 LITRO", content(1, "L")],
    ["Arroz 1 Kilo", content(1, "KG")],
    ["Arroz 2 gramos", content(2, "G")],
    ["Galletas 6 unid", content(6, "UNIT")],
    ["Galletas 6 un", content(6, "UNIT")],
    ["Galletas 6 gr", content(6, "G")],
    ["Galletas 6 kilos", content(6, "KG")],
    ["Galletas 6 lts", content(6, "L")],
    ["Galletas 6 unidad", content(6, "UNIT")],
    ["Galletas 6 litros", content(6, "L")],
    ["Galletas 6 gramo", content(6, "G")],
    ["Galletas 6 grs", content(6, "G")],
  ])("recognizes %s as %j", (text, netContent) => {
    expect(mentionsNetContent(text, netContent)).toBe(true);
  });

  it("does not recognize a different size", () => {
    expect(mentionsNetContent("Granola 1kg", content(500, "G"))).toBe(false);
    expect(mentionsNetContent("Granola 2kg", content(1, "KG"))).toBe(false);
  });

  it("does not convert units that measure different things", () => {
    expect(mentionsNetContent("Granola 1 kg", content(1, "L"))).toBe(false);
    expect(mentionsNetContent("Granola 12 g", content(12, "UNIT"))).toBe(false);
    expect(mentionsNetContent("Huevos 12 u", content(12, "G"))).toBe(false);
  });

  it("does not recognize a quantity with no unit or a unit with no quantity", () => {
    expect(mentionsNetContent("Granola 1", content(1, "KG"))).toBe(false);
    expect(mentionsNetContent("Granola kg", content(1, "KG"))).toBe(false);
  });

  it("does not take a longer number or a longer word for the size", () => {
    expect(mentionsNetContent("Granola 11 kg", content(1, "KG"))).toBe(false);
    expect(mentionsNetContent("Granola 1 kgx", content(1, "KG"))).toBe(false);
    expect(mentionsNetContent("Granola 1 kilogramo", content(1, "KG"))).toBe(false);
    expect(mentionsNetContent("Granola 1 gx", content(1, "G"))).toBe(false);
  });

  it("finds the size anywhere in the text, among other sizes", () => {
    expect(mentionsNetContent("Caja 12 u de 250 g", content(250, "G"))).toBe(true);
    expect(mentionsNetContent("Caja 12 u de 250 g", content(12, "UNIT"))).toBe(true);
  });

  it("ignores accents and case", () => {
    expect(mentionsNetContent("ACEITE 1 LÍTRO", content(1, "L"))).toBe(true);
    expect(mentionsNetContent("ACEITE 1 LT", content(1, "L"))).toBe(true);
  });

  it("compares decimals exactly", () => {
    expect(mentionsNetContent("Salsa 0,1 kg", content(100, "G"))).toBe(true);
    expect(mentionsNetContent("Salsa 1,005 kg", content(1005, "G"))).toBe(true);
    expect(mentionsNetContent("Salsa 1,005 kg", content(1004, "G"))).toBe(false);
  });

  it("always recognizes a size written the way it is stored", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000 }),
        fc.constantFrom<NetContentUnit>("G", "KG", "ML", "L", "UNIT"),
        (quantity, unit) => {
          const spellings = { G: "g", KG: "kg", ML: "ml", L: "l", UNIT: "u" } as const;

          expect(mentionsNetContent(`x ${quantity}${spellings[unit]} y`, content(quantity, unit))).toBe(
            true,
          );
        },
      ),
    );
  });
});
