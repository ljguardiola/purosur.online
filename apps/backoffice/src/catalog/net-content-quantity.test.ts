import { NET_CONTENT_QUANTITY_MAX } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  formatNetContentQuantity,
  netContentQuantityError,
  parseNetContentQuantity,
} from "./net-content-quantity";

describe("parseNetContentQuantity", () => {
  it("reads a comma as the decimal separator", () => {
    expect(parseNetContentQuantity("1,5")).toBe(1.5);
    expect(parseNetContentQuantity("12,345")).toBe(12.345);
  });

  it("reads a dot as a thousands separator in valid 3-digit groups", () => {
    expect(parseNetContentQuantity("1.000")).toBe(1000);
    expect(parseNetContentQuantity("12.345,5")).toBe(12345.5);
    expect(parseNetContentQuantity("1.000.000")).toBe(1_000_000);
  });

  it("reads a plain integer with no separator at all", () => {
    expect(parseNetContentQuantity("500")).toBe(500);
    expect(parseNetContentQuantity("0")).toBe(0);
  });

  it("rejects a dot that is not a valid thousands group", () => {
    expect(parseNetContentQuantity("1.5")).toBeUndefined();
    expect(parseNetContentQuantity("1.00")).toBeUndefined();
    expect(parseNetContentQuantity("1..000")).toBeUndefined();
    expect(parseNetContentQuantity(".5")).toBeUndefined();
  });

  it("rejects a leading zero in the first thousands group, which can never be a real one", () => {
    expect(parseNetContentQuantity("0.500")).toBeUndefined();
    expect(parseNetContentQuantity("00.500")).toBeUndefined();
  });

  it("rejects text that is not a number", () => {
    expect(parseNetContentQuantity("abc")).toBeUndefined();
  });

  it("rejects a negative sign", () => {
    expect(parseNetContentQuantity("-1")).toBeUndefined();
  });

  it("rejects more decimals than the format allows", () => {
    expect(parseNetContentQuantity("1,2345")).toBeUndefined();
  });

  it("trims surrounding spaces", () => {
    expect(parseNetContentQuantity("  1.000,5  ")).toBe(1000.5);
  });

  it("reads a blank value as unparsable, leaving the blank-means-no-content decision to the caller", () => {
    expect(parseNetContentQuantity("")).toBeUndefined();
  });
});

describe("netContentQuantityError", () => {
  const invalid = "Ingresá una cantidad mayor que cero, con hasta 3 decimales.";
  const tooLarge = "Ingresá una cantidad de hasta 100.000.";

  it("is undefined for a blank quantity", () => {
    expect(netContentQuantityError("")).toBeUndefined();
    expect(netContentQuantityError("   ")).toBeUndefined();
  });

  it("is undefined for a valid quantity, up to and including the maximum", () => {
    expect(netContentQuantityError("1,5")).toBeUndefined();
    expect(netContentQuantityError(String(NET_CONTENT_QUANTITY_MAX))).toBeUndefined();
  });

  it("reports the format message for an unparsable or non-positive quantity", () => {
    expect(netContentQuantityError("abc")).toBe(invalid);
    expect(netContentQuantityError("0")).toBe(invalid);
    expect(netContentQuantityError("1.5")).toBe(invalid);
  });

  it("reports the too-large message once the quantity parses over the maximum", () => {
    expect(netContentQuantityError(String(NET_CONTENT_QUANTITY_MAX + 1))).toBe(tooLarge);
    expect(netContentQuantityError("1.000.000")).toBe(tooLarge);
  });
});

describe("formatNetContentQuantity", () => {
  it("uses a decimal comma", () => {
    expect(formatNetContentQuantity(1.5)).toBe("1,5");
  });

  it("uses no thousands separator", () => {
    expect(formatNetContentQuantity(1500.125)).toBe("1500,125");
  });

  it("keeps an integer plain", () => {
    expect(formatNetContentQuantity(500)).toBe("500");
  });

  it("reads back through parseNetContentQuantity to the same number", () => {
    expect(parseNetContentQuantity(formatNetContentQuantity(1500.125))).toBe(1500.125);
  });
});
