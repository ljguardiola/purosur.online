import { CalendarDate } from "@internationalized/date";
import { describe, expect, it } from "vitest";
import {
  countedMessage,
  countLineRequestFrom,
  countLineRequestSchema,
  EMPTY_COUNT_LINE_FORM,
  EXPIRY_MESSAGE,
} from "./count-line-form";

describe("countLineRequestFrom", () => {
  it("reads the weight of a product sold by the kilo in thousandths", () => {
    expect(countLineRequestFrom("KG")({ counted: "4,400", expiresOn: null })).toEqual({
      counted: 4400,
      expires_on: null,
    });
  });

  it("reads the quantity of a product sold by the unit in thousandths of a unit", () => {
    expect(countLineRequestFrom("UNIT")({ counted: "24", expiresOn: null }).counted).toBe(24_000);
  });

  it("reads a fraction of a unit as a quantity no request accepts", () => {
    const { counted } = countLineRequestFrom("UNIT")({ counted: "2,5", expiresOn: null });

    expect(countLineRequestSchema.safeParse({ counted, expires_on: null }).success).toBe(false);
  });

  it("reads text that is not a quantity as one no request accepts", () => {
    const { counted } = countLineRequestFrom("KG")({ counted: "mucho", expiresOn: null });

    expect(countLineRequestSchema.safeParse({ counted, expires_on: null }).success).toBe(false);
  });

  it("writes the chosen expiry as a calendar day", () => {
    expect(
      countLineRequestFrom("KG")({ counted: "1", expiresOn: new CalendarDate(2026, 12, 3) }),
    ).toEqual({ counted: 1000, expires_on: "2026-12-03" });
  });

  it("starts with nothing counted and no expiry", () => {
    expect(EMPTY_COUNT_LINE_FORM).toEqual({ counted: "", expiresOn: null });
  });
});

describe("countedMessage", () => {
  it("asks for a weight above zero with up to three decimals for a product sold by the kilo", () => {
    expect(countedMessage("KG", { counted: "0", expiresOn: null })).toBe(
      "Ingresá un peso mayor a 0 kg, con hasta 3 decimales.",
    );
  });

  it("asks for a whole quantity above zero for a product sold by the unit", () => {
    expect(countedMessage("UNIT", { counted: "2,5", expiresOn: null })).toBe(
      "Ingresá una cantidad entera de unidades, mayor a 0.",
    );
  });

  it("says the quantity is over the most a line can hold when it reads but no request accepts it", () => {
    expect(countedMessage("KG", { counted: "9.999.999", expiresOn: null })).toBe(
      "La cantidad supera el máximo de una línea.",
    );
  });
});

describe("EXPIRY_MESSAGE", () => {
  it("asks for a valid day", () => {
    expect(EXPIRY_MESSAGE).toBe("Elegí un vencimiento válido.");
  });
});
