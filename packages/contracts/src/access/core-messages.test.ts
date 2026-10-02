import { describe, expect, it } from "vitest";
import {
  accessCoreToRendererMessageSchema,
  accessRendererToCoreMessageSchema,
} from "./core-messages.js";

const REQUEST_ID = "7d1c1e1e-5b1a-4a53-9c1c-3a7c6f0b2d10";

const OPEN_CASH_SESSION = {
  id: "s1",
  opened_at: "2026-09-30T12:00:00.000Z",
  opened_by: { user_id: "u1", first_name: "Ada", abilities: ["open_cash_session"] },
  locked: false,
};

describe("accessRendererToCoreMessageSchema", () => {
  it("accepts a request for the PIN policy", () => {
    const message = { type: "pin-policy-request", request_id: REQUEST_ID };

    expect(accessRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts a PIN code redemption with the code as typed and the new PIN", () => {
    const message = {
      type: "redeem-pin-code",
      request_id: REQUEST_ID,
      reset_code: "p4nx 7kwe 2qrt 5mzd",
      new_pin: "482913",
    };

    expect(accessRendererToCoreMessageSchema.parse(message)).toEqual(message);
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

      expect(accessRendererToCoreMessageSchema.safeParse(message).success).toBe(false);
    },
  );

  it("accepts a request for the users who can sign in", () => {
    const message = { type: "sign-in-users", request_id: REQUEST_ID };

    expect(accessRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts a sign-in with the chosen user and the PIN as typed", () => {
    const message = { type: "sign-in", request_id: REQUEST_ID, user_id: "u1", pin: "0042" };

    expect(accessRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts a sign-in lookup with the email as typed", () => {
    const message = { type: "sign-in-lookup", request_id: REQUEST_ID, email: "Ada@Example.com " };

    expect(accessRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts a request for a first PIN code by the person found", () => {
    const message = { type: "first-pin-code-request", request_id: REQUEST_ID, user_id: "u1" };

    expect(accessRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { type: "first-pin-code-request", user_id: "u1" },
    { type: "first-pin-code-request", request_id: REQUEST_ID },
  ])("rejects a first PIN code request missing a field: %j", (message) => {
    expect(accessRendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });

  it("accepts a first sign-in with the person found and the PIN as typed", () => {
    const message = { type: "first-sign-in", request_id: REQUEST_ID, user_id: "u1", pin: "0042" };

    expect(accessRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { type: "sign-in-lookup", email: "ada@example.com" },
    { type: "sign-in-lookup", request_id: REQUEST_ID },
    { type: "first-sign-in", user_id: "u1", pin: "1" },
    { type: "first-sign-in", request_id: REQUEST_ID, pin: "1" },
    { type: "first-sign-in", request_id: REQUEST_ID, user_id: "u1" },
  ])("rejects a first sign-in request missing a field: %j", (message) => {
    expect(accessRendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });

  it.each([
    { type: "sign-in-users" },
    { type: "sign-in", user_id: "u1", pin: "1" },
    { type: "sign-in", request_id: REQUEST_ID, pin: "1" },
    { type: "sign-in", request_id: REQUEST_ID, user_id: "u1" },
  ])("rejects a sign-in request missing a field: %j", (message) => {
    expect(accessRendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });

  it("accepts a request for the people who can authorize a permission", () => {
    const message = { type: "authorizers", request_id: REQUEST_ID, permission: "record_cash_in" };

    expect(accessRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { type: "authorizers", permission: "record_cash_in" },
    { type: "authorizers", request_id: REQUEST_ID },
    { type: "authorizers", request_id: REQUEST_ID, permission: "sell_and_charge" },
    { type: "authorizers", request_id: REQUEST_ID, permission: "open_the_safe" },
  ])("rejects a request for authorizers it cannot answer: %j", (message) => {
    expect(accessRendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });

  it("accepts a request to sign out", () => {
    const message = { type: "sign-out", request_id: REQUEST_ID };

    expect(accessRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a request to sign out without its request id", () => {
    expect(accessRendererToCoreMessageSchema.safeParse({ type: "sign-out" }).success).toBe(false);
  });

  it("rejects any other message type", () => {
    expect(accessRendererToCoreMessageSchema.safeParse({ type: "health-check" }).success).toBe(
      false,
    );
    expect(accessRendererToCoreMessageSchema.safeParse({}).success).toBe(false);
  });
});

describe("accessCoreToRendererMessageSchema", () => {
  it("accepts the PIN policy with its minimum digits", () => {
    const message = { type: "pin-policy", request_id: REQUEST_ID, min_digits: 6 };

    expect(accessCoreToRendererMessageSchema.parse(message)).toEqual(message);
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

    expect(accessCoreToRendererMessageSchema.parse(message)).toEqual(message);
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

      expect(accessCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
    },
  );

  it("rejects a PIN code redemption refusal naming a field the redemption does not have", () => {
    const message = {
      type: "pin-code-redemption-result",
      request_id: REQUEST_ID,
      outcome: { kind: "invalid_input", fields: ["repeat"] },
    };

    expect(accessCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("rejects a PIN code redemption rate limit without when to retry", () => {
    const message = {
      type: "pin-code-redemption-result",
      request_id: REQUEST_ID,
      outcome: { kind: "rate_limited" },
    };

    expect(accessCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("rejects a PIN code redemption result it does not know or without its request id", () => {
    expect(
      accessCoreToRendererMessageSchema.safeParse({
        type: "pin-code-redemption-result",
        request_id: REQUEST_ID,
        outcome: { kind: "not_stored" },
      }).success,
    ).toBe(false);
    expect(
      accessCoreToRendererMessageSchema.safeParse({
        type: "pin-code-redemption-result",
        outcome: { kind: "redeemed" },
      }).success,
    ).toBe(false);
  });
});

describe("sign-in answers", () => {
  it("accepts the users who can sign in, by id and first name", () => {
    const message = {
      type: "sign-in-users",
      request_id: REQUEST_ID,
      users: [
        { id: "u1", first_name: "Ada" },
        { id: "u2", first_name: "Bruno" },
      ],
    };

    expect(accessCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts that the users cannot be read", () => {
    const message = { type: "sign-in-users-unavailable", request_id: REQUEST_ID };

    expect(accessCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts an empty list of users", () => {
    const message = { type: "sign-in-users", request_id: REQUEST_ID, users: [] };

    expect(accessCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("drops anything else a listed user carries", () => {
    const message = {
      type: "sign-in-users",
      request_id: REQUEST_ID,
      users: [{ id: "u1", first_name: "Ada", salt: "s" }],
    };

    expect(accessCoreToRendererMessageSchema.parse(message)).toEqual({
      ...message,
      users: [{ id: "u1", first_name: "Ada" }],
    });
  });

  it("rejects a listed user without its first name", () => {
    const message = { type: "sign-in-users", request_id: REQUEST_ID, users: [{ id: "u1" }] };

    expect(accessCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it.each([
    {
      kind: "signed_in",
      person: {
        user_id: "u1",
        first_name: "Ada",
        abilities: ["open_cash_session", "view_sales_history"],
      },
      cash_session: OPEN_CASH_SESSION,
    },
    {
      kind: "signed_in",
      person: { user_id: "u1", first_name: "Ada", abilities: [] },
      cash_session: null,
    },
    { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 7 },
    { kind: "wrong_pin", retry_after_seconds: 30, attempts_left: 1 },
    { kind: "rate_limited", retry_after_seconds: 4, attempts_left: 5 },
    { kind: "locked", consecutive_failures: 8 },
    { kind: "no_register_permission" },
    { kind: "cash_session_opened_by_another" },
    { kind: "unavailable" },
  ])("accepts the sign-in result $kind", (outcome) => {
    const message = { type: "sign-in-result", request_id: REQUEST_ID, outcome };

    expect(accessCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a locked result that counts a different number of failures", () => {
    const outcome = { kind: "locked", consecutive_failures: 7 };
    const message = { type: "sign-in-result", request_id: REQUEST_ID, outcome };

    expect(accessCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("rejects a locked result without the failures that locked the person", () => {
    const message = {
      type: "sign-in-result",
      request_id: REQUEST_ID,
      outcome: { kind: "locked" },
    };

    expect(accessCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("does not let a signed-in result carry a role", () => {
    const message = {
      type: "sign-in-result",
      request_id: REQUEST_ID,
      outcome: {
        kind: "signed_in",
        person: { user_id: "u1", first_name: "Ada", abilities: [], role_name: "Cajera" },
        cash_session: null,
      },
    };

    expect(JSON.stringify(accessCoreToRendererMessageSchema.parse(message))).not.toContain(
      "Cajera",
    );
  });

  it.each([
    { kind: "signed_in" },
    { kind: "signed_in", person: { first_name: "Ada" }, cash_session: null },
    { kind: "signed_in", person: { first_name: "Ada", abilities: [] }, cash_session: null },
    { kind: "signed_in", person: { user_id: "u1", first_name: "Ada", abilities: [] } },
    {
      kind: "signed_in",
      person: { user_id: "u1", first_name: "Ada", permission_keys: ["sell_and_charge"] },
      cash_session: null,
    },
    {
      kind: "signed_in",
      person: { user_id: "u1", first_name: "Ada", abilities: ["sell_and_charge"] },
      cash_session: null,
    },
    { kind: "x" },
    { kind: "wrong_pin" },
    { kind: "wrong_pin", retry_after_seconds: 0 },
    { kind: "wrong_pin", attempts_left: 7 },
    { kind: "wrong_pin", retry_after_seconds: -1, attempts_left: 7 },
    { kind: "wrong_pin", retry_after_seconds: 31, attempts_left: 7 },
    { kind: "wrong_pin", retry_after_seconds: 1.5, attempts_left: 7 },
    { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 0 },
    { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 8 },
    { kind: "rate_limited" },
    { kind: "rate_limited", retry_after_seconds: 0, attempts_left: 5 },
    { kind: "rate_limited", retry_after_seconds: 31, attempts_left: 5 },
    { kind: "rate_limited", retry_after_seconds: 4, attempts_left: 0 },
    { kind: "rate_limited", retry_after_seconds: 4, attempts_left: 8 },
  ])("rejects a sign-in result it does not know: %j", (outcome) => {
    const message = { type: "sign-in-result", request_id: REQUEST_ID, outcome };

    expect(accessCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });
});

describe("sign-in lookup answers", () => {
  it.each([
    { kind: "has_pin", user: { id: "u1", first_name: "Ada" } },
    { kind: "no_pin", user: { id: "u1", first_name: "Ada" } },
    { kind: "not_found" },
    { kind: "invalid_email" },
    { kind: "rate_limited", retry_after_seconds: 30 },
    { kind: "not_synced" },
    { kind: "unreachable" },
    { kind: "unavailable" },
  ])("accepts the sign-in lookup result $kind", (outcome) => {
    const message = { type: "sign-in-lookup-result", request_id: REQUEST_ID, outcome };

    expect(accessCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "has_pin" },
    { kind: "has_pin", user: { id: "u1" } },
    { kind: "rate_limited" },
    { kind: "rate_limited", retry_after_seconds: -1 },
    { kind: "x" },
  ])("rejects a sign-in lookup result it does not know: %j", (outcome) => {
    const message = { type: "sign-in-lookup-result", request_id: REQUEST_ID, outcome };

    expect(accessCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("does not let a lookup result carry the email", () => {
    const message = {
      type: "sign-in-lookup-result",
      request_id: REQUEST_ID,
      outcome: { kind: "not_found", email: "ada@example.com" },
    };

    expect(JSON.stringify(accessCoreToRendererMessageSchema.parse(message))).not.toContain("ada@");
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

    expect(accessCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "rate_limited" },
    { kind: "rate_limited", retry_after_seconds: -1 },
    { kind: "x" },
  ])("rejects a first PIN code request result it does not know: %j", (outcome) => {
    const message = { type: "first-pin-code-request-result", request_id: REQUEST_ID, outcome };

    expect(accessCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("does not let a result carry the code", () => {
    const message = {
      type: "first-pin-code-request-result",
      request_id: REQUEST_ID,
      outcome: { kind: "sent", code: "P4NX7KWE2QRT5MZD" },
    };

    expect(JSON.stringify(accessCoreToRendererMessageSchema.parse(message))).not.toContain("P4NX");
  });
});

describe("authorizers answers", () => {
  it("accepts the people who can authorize, by id and first name", () => {
    const message = {
      type: "authorizers",
      request_id: REQUEST_ID,
      users: [{ id: "u2", first_name: "Grace" }],
    };

    expect(accessCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts that nobody can authorize", () => {
    const message = { type: "authorizers", request_id: REQUEST_ID, users: [] };

    expect(accessCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts that the authorizers cannot be read", () => {
    const message = { type: "authorizers-unavailable", request_id: REQUEST_ID };

    expect(accessCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a listed authorizer without its first name", () => {
    const message = { type: "authorizers", request_id: REQUEST_ID, users: [{ id: "u2" }] };

    expect(accessCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });
});

describe("sign-out answer", () => {
  it("accepts the confirmation that nobody is signed in", () => {
    const message = { type: "signed-out", request_id: REQUEST_ID };

    expect(accessCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a confirmation without its request id", () => {
    expect(accessCoreToRendererMessageSchema.safeParse({ type: "signed-out" }).success).toBe(false);
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

    expect(accessRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts a PIN code redemption check refusing its fields", () => {
    const message = {
      type: "pin-code-redemption-check",
      request_id: REQUEST_ID,
      fields: ["reset_code", "new_pin"],
    };

    expect(accessCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });
});
