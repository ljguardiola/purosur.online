import { PIN_MIN_DIGITS } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  newPinSchema,
  pinCodeRedemptionBodySchema,
  pinCodeRedemptionSchema,
} from "./pin-code-redemption.js";

const VALID_BODY = { reset_code: "P4NX 7KWE 2QRT 5MZD", new_pin: "482913" };

function firstIssue(body: unknown): { path: unknown; message: unknown } | undefined {
  const result = pinCodeRedemptionBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { path: issue.path, message: issue.message };
}

describe("pinCodeRedemptionBodySchema", () => {
  it("reads the reset code without its spaces and dashes and in uppercase", () => {
    const result = pinCodeRedemptionBodySchema.parse({
      ...VALID_BODY,
      reset_code: "p4nx-7kwe 2qrt-5mzd",
    });

    expect(result).toEqual({ reset_code: "P4NX7KWE2QRT5MZD", new_pin: "482913" });
  });

  it.each([
    ["missing", undefined],
    ["not a string", 42],
    ["too short", "P4NX 7KWE 2QRT"],
    ["made of characters outside base32", "P4NX 7KWE 2QRT 5MZ1"],
  ])("rejects a reset code that is %s", (_case, resetCode) => {
    expect(firstIssue({ ...VALID_BODY, reset_code: resetCode })).toEqual({
      path: ["reset_code"],
      message: "reset_code must be 16 base32 characters",
    });
  });

  it("carries the new PIN as it was typed, leaving its rule to the operation", () => {
    const result = pinCodeRedemptionBodySchema.parse({ ...VALID_BODY, new_pin: "12" });

    expect(result.new_pin).toBe("12");
  });

  it.each([
    ["missing", undefined],
    ["not a string", 482913],
  ])("rejects a new PIN that is %s", (_case, newPin) => {
    expect(firstIssue({ ...VALID_BODY, new_pin: newPin })).toEqual({
      path: ["new_pin"],
      message: "new_pin must be a string",
    });
  });
});

describe("pinCodeRedemptionSchema", () => {
  const REDEMPTION = {
    user_id: "6f1b0d5e-3a52-4d0a-9c53-6d0f7d4b2a10",
    salt: "AQEBAQEBAQEBAQEBAQEBAQ",
    pin_hash: "FO3oOFk5tY4DPtoNNGl7KXTcZfn77pjiKvugqG5Dm-E",
  };

  it("carries the user's id and the salt and hash of the new PIN", () => {
    expect(pinCodeRedemptionSchema.parse(REDEMPTION)).toEqual(REDEMPTION);
  });

  it("rejects a user id that is not a uuid", () => {
    expect(pinCodeRedemptionSchema.safeParse({ ...REDEMPTION, user_id: "u-1" }).success).toBe(
      false,
    );
  });

  it.each(["salt", "pin_hash"] as const)("rejects a redemption without its %s", (field) => {
    expect(pinCodeRedemptionSchema.safeParse({ ...REDEMPTION, [field]: undefined }).success).toBe(
      false,
    );
  });
});

describe("newPinSchema", () => {
  it("accepts a PIN of digits with at least the minimum length", () => {
    expect(newPinSchema.parse("4".repeat(PIN_MIN_DIGITS))).toBe("4".repeat(PIN_MIN_DIGITS));
  });

  it.each([
    ["too short", "4".repeat(PIN_MIN_DIGITS - 1)],
    ["not made of digits only", `${"4".repeat(PIN_MIN_DIGITS)}a`],
    ["empty", ""],
    ["not a string", 482913],
  ])("rejects a PIN that is %s, naming the minimum", (_case, pin) => {
    const result = newPinSchema.safeParse(pin);

    expect(result.success ? undefined : result.error.issues[0]?.message).toBe(
      `new_pin must be at least ${PIN_MIN_DIGITS} digits, numbers only`,
    );
  });
});
