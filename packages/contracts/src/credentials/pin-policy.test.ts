import { describe, expect, it } from "vitest";
import { pinPolicyMessageSchema, pinPolicyRequestMessageSchema } from "./pin-policy.js";

const REQUEST_ID = "7d1c1e1e-5b1a-4a53-9c1c-3a7c6f0b2d10";

describe("pinPolicyRequestMessageSchema", () => {
  it("accepts a request for the PIN policy", () => {
    const message = { type: "pin-policy-request", request_id: REQUEST_ID };

    expect(pinPolicyRequestMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a request without its id", () => {
    expect(pinPolicyRequestMessageSchema.safeParse({ type: "pin-policy-request" }).success).toBe(
      false,
    );
  });
});

describe("pinPolicyMessageSchema", () => {
  it("accepts the PIN policy with its minimum digits", () => {
    const message = { type: "pin-policy", request_id: REQUEST_ID, min_digits: 6 };

    expect(pinPolicyMessageSchema.parse(message)).toEqual(message);
  });

  it.each([0, 6.5, "6", undefined])(
    "rejects a PIN policy whose minimum digits are %j",
    (minDigits) => {
      expect(
        pinPolicyMessageSchema.safeParse({
          type: "pin-policy",
          request_id: REQUEST_ID,
          min_digits: minDigits,
        }).success,
      ).toBe(false);
    },
  );

  it("rejects a PIN policy without its request id", () => {
    expect(pinPolicyMessageSchema.safeParse({ type: "pin-policy", min_digits: 6 }).success).toBe(
      false,
    );
  });
});
