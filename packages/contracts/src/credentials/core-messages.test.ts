import { describe, expect, it } from "vitest";
import {
  credentialsCoreToRendererMessageSchema,
  credentialsRendererToCoreMessageSchema,
} from "./core-messages.js";

const REQUEST_ID = "7d1c1e1e-5b1a-4a53-9c1c-3a7c6f0b2d10";

const OPEN_CASH_SESSION = {
  id: "s1",
  opened_at: "2026-09-30T12:00:00.000Z",
  opened_by: { user_id: "u1", first_name: "Ada", abilities: ["open_cash_session"] },
  locked: false,
};

describe("credentialsRendererToCoreMessageSchema", () => {
  it("accepts a request for the PIN policy", () => {
    const message = { type: "pin-policy-request", request_id: REQUEST_ID };

    expect(credentialsRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts a PIN code redemption with the code as typed and the new PIN", () => {
    const message = {
      type: "redeem-pin-code",
      request_id: REQUEST_ID,
      reset_code: "p4nx 7kwe 2qrt 5mzd",
      new_pin: "482913",
    };

    expect(credentialsRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it.each(["request_id", "reset_code", "new_pin"])(
    "rejects a PIN code redemption without its %s",
    (field) => {
      const message = {
        type: "redeem-pin-code",
        request_id: REQUEST_ID,
        reset_code: "P4NX7KWE2QRT5MZD",
        new_pin: "482913",
        [field]: undefined,
      };

      expect(credentialsRendererToCoreMessageSchema.safeParse(message).success).toBe(false);
    },
  );

  it("accepts a request for a first PIN code by the person found", () => {
    const message = { type: "first-pin-code-request", request_id: REQUEST_ID, user_id: "u1" };

    expect(credentialsRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { type: "first-pin-code-request", user_id: "u1" },
    { type: "first-pin-code-request", request_id: REQUEST_ID },
  ])("rejects a first PIN code request missing a field: %j", (message) => {
    expect(credentialsRendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });

  it("rejects any other message type", () => {
    expect(credentialsRendererToCoreMessageSchema.safeParse({ type: "health-check" }).success).toBe(
      false,
    );
    expect(credentialsRendererToCoreMessageSchema.safeParse({}).success).toBe(false);
  });
});

describe("credentialsCoreToRendererMessageSchema", () => {
  it("accepts the PIN policy with its minimum digits", () => {
    const message = { type: "pin-policy", request_id: REQUEST_ID, min_digits: 6 };

    expect(credentialsCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "redeemed" },
    {
      kind: "resumed",
      person: { user_id: "u1", first_name: "Ada", abilities: ["open_cash_session"] },
      cash_session: OPEN_CASH_SESSION,
    },
    {
      kind: "resumed",
      person: { user_id: "u1", first_name: "Ada", abilities: ["open_cash_session"] },
      cash_session: null,
    },
    { kind: "cash_session_opened_by_another" },
    { kind: "code_invalid" },
    { kind: "code_expired" },
    { kind: "code_burned" },
    { kind: "pin_rejected" },
    { kind: "rate_limited", retry_after_seconds: 600 },
    { kind: "unreachable" },
    { kind: "unavailable" },
    { kind: "invalid_input", fields: ["reset_code", "new_pin"] },
  ])("accepts the PIN code redemption result $kind", (outcome) => {
    const message = { type: "pin-code-redemption-result", request_id: REQUEST_ID, outcome };

    expect(credentialsCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "resumed", cash_session: OPEN_CASH_SESSION },
    {
      kind: "resumed",
      person: { user_id: "u1", first_name: "Ada", abilities: ["open_cash_session"] },
    },
  ])(
    "rejects a resumed PIN code redemption without the person or the cash session: %j",
    (outcome) => {
      const message = { type: "pin-code-redemption-result", request_id: REQUEST_ID, outcome };

      expect(credentialsCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
    },
  );

  it("rejects a PIN code redemption refusal naming a field the redemption does not have", () => {
    const message = {
      type: "pin-code-redemption-result",
      request_id: REQUEST_ID,
      outcome: { kind: "invalid_input", fields: ["repeat"] },
    };

    expect(credentialsCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("rejects a PIN code redemption rate limit without when to retry", () => {
    const message = {
      type: "pin-code-redemption-result",
      request_id: REQUEST_ID,
      outcome: { kind: "rate_limited" },
    };

    expect(credentialsCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("rejects a PIN code redemption result it does not know or without its request id", () => {
    expect(
      credentialsCoreToRendererMessageSchema.safeParse({
        type: "pin-code-redemption-result",
        request_id: REQUEST_ID,
        outcome: { kind: "not_stored" },
      }).success,
    ).toBe(false);
    expect(
      credentialsCoreToRendererMessageSchema.safeParse({
        type: "pin-code-redemption-result",
        outcome: { kind: "redeemed" },
      }).success,
    ).toBe(false);
  });
});

describe("first PIN code request answers", () => {
  it.each([
    { kind: "sent" },
    { kind: "pin_already_set" },
    { kind: "not_found" },
    { kind: "rate_limited", retry_after_seconds: 600 },
    { kind: "unreachable" },
    { kind: "unavailable" },
  ])("accepts the first PIN code request result $kind", (outcome) => {
    const message = { type: "first-pin-code-request-result", request_id: REQUEST_ID, outcome };

    expect(credentialsCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "rate_limited" },
    { kind: "rate_limited", retry_after_seconds: -1 },
    { kind: "x" },
  ])("rejects a first PIN code request result it does not know: %j", (outcome) => {
    const message = { type: "first-pin-code-request-result", request_id: REQUEST_ID, outcome };

    expect(credentialsCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("does not let a result carry the code", () => {
    const message = {
      type: "first-pin-code-request-result",
      request_id: REQUEST_ID,
      outcome: { kind: "sent", code: "P4NX7KWE2QRT5MZD" },
    };

    expect(JSON.stringify(credentialsCoreToRendererMessageSchema.parse(message))).not.toContain(
      "P4NX",
    );
  });
});

describe("checking typed input", () => {
  it("accepts a check of a PIN code redemption as typed", () => {
    const message = {
      type: "check-pin-code-redemption",
      request_id: REQUEST_ID,
      reset_code: "p4nx",
      new_pin: "12",
    };

    expect(credentialsRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts a PIN code redemption check refusing its fields", () => {
    const message = {
      type: "pin-code-redemption-check",
      request_id: REQUEST_ID,
      fields: ["reset_code", "new_pin"],
    };

    expect(credentialsCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });
});
