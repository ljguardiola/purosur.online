import { describe, expect, it } from "vitest";
import {
  checkPinCodeRedemptionMessageSchema,
  pinCodeRedemptionCheckMessageSchema,
} from "./pin-code-redemption-check.js";

const REQUEST_ID = "7d1c1e1e-5b1a-4a53-9c1c-3a7c6f0b2d10";

describe("checkPinCodeRedemptionMessageSchema", () => {
  it("accepts the code and the new PIN as typed", () => {
    const message = {
      type: "check-pin-code-redemption",
      request_id: REQUEST_ID,
      reset_code: "",
      new_pin: "",
    };

    expect(checkPinCodeRedemptionMessageSchema.parse(message)).toEqual(message);
  });

  it.each(["request_id", "reset_code", "new_pin"])("rejects a check missing its %s", (field) => {
    const message: Record<string, unknown> = {
      type: "check-pin-code-redemption",
      request_id: REQUEST_ID,
      reset_code: "p4nx",
      new_pin: "12",
    };
    delete message[field];

    expect(checkPinCodeRedemptionMessageSchema.safeParse(message).success).toBe(false);
  });
});

describe("pinCodeRedemptionCheckMessageSchema", () => {
  it.each([[[]], [["reset_code"]], [["new_pin"]], [["reset_code", "new_pin"]]])(
    "accepts a check refusing %j",
    (fields) => {
      const message = { type: "pin-code-redemption-check", request_id: REQUEST_ID, fields };

      expect(pinCodeRedemptionCheckMessageSchema.parse(message)).toEqual(message);
    },
  );

  it.each([
    { type: "pin-code-redemption-check", request_id: REQUEST_ID, fields: ["repeat"] },
    { type: "pin-code-redemption-check", request_id: REQUEST_ID },
    { type: "pin-code-redemption-check", fields: [] },
  ])("rejects a check answer that is not well formed: %j", (message) => {
    expect(pinCodeRedemptionCheckMessageSchema.safeParse(message).success).toBe(false);
  });
});
