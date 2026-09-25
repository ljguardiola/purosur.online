import { describe, expect, it } from "vitest";
import {
  readExpectedCurrentPriceId,
  readRequiredExpectedCurrentPriceId,
  readUnitPrice,
  validateConfirmationFields,
  validateSetPriceFields,
} from "./price-validation.js";

const PRICE_ID = "11111111-1111-1111-1111-111111111111";

describe("readUnitPrice", () => {
  it("reads a positive integer", () => {
    expect(readUnitPrice({ unitPrice: 1250 })).toBe(1250);
  });

  it("rejects zero", () => {
    expect(readUnitPrice({ unitPrice: 0 })).toBeUndefined();
  });

  it("rejects a negative number", () => {
    expect(readUnitPrice({ unitPrice: -100 })).toBeUndefined();
  });

  it("rejects a non-integer", () => {
    expect(readUnitPrice({ unitPrice: 12.5 })).toBeUndefined();
  });

  it("rejects a non-number", () => {
    expect(readUnitPrice({ unitPrice: "1250" })).toBeUndefined();
  });

  it("rejects a missing field", () => {
    expect(readUnitPrice({})).toBeUndefined();
  });
});

describe("readExpectedCurrentPriceId", () => {
  it("reads null as no current price", () => {
    expect(readExpectedCurrentPriceId({ expectedCurrentPriceId: null })).toBeNull();
  });

  it("reads a well-formed uuid", () => {
    expect(readExpectedCurrentPriceId({ expectedCurrentPriceId: PRICE_ID })).toBe(PRICE_ID);
  });

  it("rejects a malformed id", () => {
    expect(readExpectedCurrentPriceId({ expectedCurrentPriceId: "not-a-uuid" })).toBeUndefined();
  });

  it("rejects a missing field", () => {
    expect(readExpectedCurrentPriceId({})).toBeUndefined();
  });
});

describe("readRequiredExpectedCurrentPriceId", () => {
  it("reads a well-formed uuid", () => {
    expect(readRequiredExpectedCurrentPriceId({ expectedCurrentPriceId: PRICE_ID })).toBe(PRICE_ID);
  });

  it("rejects null, unlike the optional reader", () => {
    expect(readRequiredExpectedCurrentPriceId({ expectedCurrentPriceId: null })).toBeUndefined();
  });

  it("rejects a missing field", () => {
    expect(readRequiredExpectedCurrentPriceId({})).toBeUndefined();
  });
});

describe("validateSetPriceFields", () => {
  it("passes with a valid unit price and a null expected id", () => {
    expect(
      validateSetPriceFields({ unitPrice: 1250, expectedCurrentPriceId: null }),
    ).toBeUndefined();
  });

  it("fails on a missing unit price", () => {
    expect(validateSetPriceFields({ unitPrice: undefined, expectedCurrentPriceId: null })).toEqual({
      field: "unitPrice",
      message: expect.any(String),
    });
  });

  it("fails on a missing expected id", () => {
    expect(validateSetPriceFields({ unitPrice: 1250, expectedCurrentPriceId: undefined })).toEqual({
      field: "expectedCurrentPriceId",
      message: expect.any(String),
    });
  });
});

describe("validateConfirmationFields", () => {
  it("passes with a well-formed expected id", () => {
    expect(validateConfirmationFields({ expectedCurrentPriceId: PRICE_ID })).toBeUndefined();
  });

  it("fails on a missing expected id", () => {
    expect(validateConfirmationFields({ expectedCurrentPriceId: undefined })).toEqual({
      field: "expectedCurrentPriceId",
      message: expect.any(String),
    });
  });
});
