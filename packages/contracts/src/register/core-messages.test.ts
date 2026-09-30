import { CASH_MOVEMENT_REASON_MAX_LENGTH, MAX_CASH_AMOUNT_CENTS } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  cashMovementAmountSchema,
  coreStatusMessageSchema,
  coreToRendererMessageSchema,
  countedCashSchema,
  mainToCoreMessageSchema,
  openingFloatSchema,
  rendererToCoreMessageSchema,
} from "./core-messages.js";

const REQUEST_ID = "7d1c1e1e-5b1a-4a53-9c1c-3a7c6f0b2d10";

describe("rendererToCoreMessageSchema", () => {
  it("accepts a ping", () => {
    expect(rendererToCoreMessageSchema.safeParse({ type: "ping" }).success).toBe(true);
  });

  it("accepts a request for whether this installation is enrolled", () => {
    const message = { type: "enrollment-status-request", request_id: REQUEST_ID };

    expect(rendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts a request for the register's own name", () => {
    const message = { type: "register-name-request", request_id: REQUEST_ID };

    expect(rendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts an enrollment with the code as typed", () => {
    const message = { type: "enroll", request_id: REQUEST_ID, code: "p4nx 7kwe 2qrt 6mzd" };

    expect(rendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts a PIN code redemption with the code as typed and the new PIN", () => {
    const message = {
      type: "redeem-pin-code",
      request_id: REQUEST_ID,
      reset_code: "p4nx 7kwe 2qrt 5mzd",
      new_pin: "482913",
    };

    expect(rendererToCoreMessageSchema.parse(message)).toEqual(message);
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

      expect(rendererToCoreMessageSchema.safeParse(message).success).toBe(false);
    },
  );

  it("accepts a request for the users who can sign in", () => {
    const message = { type: "sign-in-users", request_id: REQUEST_ID };

    expect(rendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts a sign-in with the chosen user and the PIN as typed", () => {
    const message = { type: "sign-in", request_id: REQUEST_ID, user_id: "u1", pin: "0042" };

    expect(rendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts a sign-in lookup with the email as typed", () => {
    const message = { type: "sign-in-lookup", request_id: REQUEST_ID, email: "Ada@Example.com " };

    expect(rendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts a request for a first PIN code by the person found", () => {
    const message = { type: "first-pin-code-request", request_id: REQUEST_ID, user_id: "u1" };

    expect(rendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { type: "first-pin-code-request", user_id: "u1" },
    { type: "first-pin-code-request", request_id: REQUEST_ID },
  ])("rejects a first PIN code request missing a field: %j", (message) => {
    expect(rendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });

  it("accepts a first sign-in with the person found and the PIN as typed", () => {
    const message = { type: "first-sign-in", request_id: REQUEST_ID, user_id: "u1", pin: "0042" };

    expect(rendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { type: "sign-in-lookup", email: "ada@example.com" },
    { type: "sign-in-lookup", request_id: REQUEST_ID },
    { type: "first-sign-in", user_id: "u1", pin: "1" },
    { type: "first-sign-in", request_id: REQUEST_ID, pin: "1" },
    { type: "first-sign-in", request_id: REQUEST_ID, user_id: "u1" },
  ])("rejects a first sign-in request missing a field: %j", (message) => {
    expect(rendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });

  it.each([
    { type: "sign-in-users" },
    { type: "sign-in", user_id: "u1", pin: "1" },
    { type: "sign-in", request_id: REQUEST_ID, pin: "1" },
    { type: "sign-in", request_id: REQUEST_ID, user_id: "u1" },
  ])("rejects a sign-in request missing a field: %j", (message) => {
    expect(rendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });

  it("accepts a request for the people who can authorize a permission", () => {
    const message = { type: "authorizers", request_id: REQUEST_ID, permission: "record_cash_in" };

    expect(rendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { type: "authorizers", permission: "record_cash_in" },
    { type: "authorizers", request_id: REQUEST_ID },
    { type: "authorizers", request_id: REQUEST_ID, permission: "sell_and_charge" },
    { type: "authorizers", request_id: REQUEST_ID, permission: "open_the_safe" },
  ])("rejects a request for authorizers it cannot answer: %j", (message) => {
    expect(rendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });

  it("accepts a request to sign out", () => {
    const message = { type: "sign-out", request_id: REQUEST_ID };

    expect(rendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a request to sign out without its request id", () => {
    expect(rendererToCoreMessageSchema.safeParse({ type: "sign-out" }).success).toBe(false);
  });

  it("rejects a request without its request id", () => {
    expect(
      rendererToCoreMessageSchema.safeParse({ type: "enrollment-status-request" }).success,
    ).toBe(false);
    expect(rendererToCoreMessageSchema.safeParse({ type: "enroll", code: "x" }).success).toBe(
      false,
    );
    expect(rendererToCoreMessageSchema.safeParse({ type: "register-name-request" }).success).toBe(
      false,
    );
  });

  it("rejects an enrollment without a code", () => {
    expect(
      rendererToCoreMessageSchema.safeParse({ type: "enroll", request_id: REQUEST_ID }).success,
    ).toBe(false);
  });

  it("rejects any other message type", () => {
    expect(rendererToCoreMessageSchema.safeParse({ type: "health-check" }).success).toBe(false);
    expect(rendererToCoreMessageSchema.safeParse({}).success).toBe(false);
  });
});

describe("cash session requests", () => {
  it("accepts a request to open a cash session with the float in cents", () => {
    const message = { type: "open-cash-session", request_id: REQUEST_ID, opening_float: 150000 };

    expect(rendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("drops an opener sent with a request to open a cash session", () => {
    const message = { type: "open-cash-session", request_id: REQUEST_ID, opening_float: 150000 };

    expect(rendererToCoreMessageSchema.parse({ ...message, user_id: "u9" })).toEqual(message);
  });

  it.each([0, MAX_CASH_AMOUNT_CENTS])("accepts an opening float of %i cents", (opening_float) => {
    const message = { type: "open-cash-session", request_id: REQUEST_ID, opening_float };

    expect(rendererToCoreMessageSchema.safeParse(message).success).toBe(true);
  });

  it.each([-1, 1.5, MAX_CASH_AMOUNT_CENTS + 1, "100", null])(
    "rejects an opening float of %j",
    (opening_float) => {
      const message = { type: "open-cash-session", request_id: REQUEST_ID, opening_float };

      expect(rendererToCoreMessageSchema.safeParse(message).success).toBe(false);
    },
  );

  it.each([
    { type: "open-cash-session", opening_float: 0 },
    { type: "open-cash-session", request_id: REQUEST_ID },
  ])("rejects a request to open a cash session missing a field: %j", (message) => {
    expect(rendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });

  it("accepts a request for the open cash session", () => {
    const message = { type: "cash-session-request", request_id: REQUEST_ID };

    expect(rendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a request for the open cash session without its request id", () => {
    expect(rendererToCoreMessageSchema.safeParse({ type: "cash-session-request" }).success).toBe(
      false,
    );
  });
});

describe("cash movement requests", () => {
  const movement = {
    type: "record-cash-movement",
    request_id: REQUEST_ID,
    kind: "CASH_OUT",
    amount: 2500,
    reason: "Flete",
  };

  it("accepts a cash movement without an authorization", () => {
    expect(rendererToCoreMessageSchema.parse(movement)).toEqual(movement);
  });

  it("accepts a cash movement authorized with another person's PIN", () => {
    const authorized = { ...movement, authorization: { user_id: "u2", pin: "1234" } };

    expect(rendererToCoreMessageSchema.parse(authorized)).toEqual(authorized);
  });

  it.each(["CASH_IN", "CASH_OUT", "WITHDRAWAL"])("accepts a cash movement of kind %s", (kind) => {
    expect(rendererToCoreMessageSchema.safeParse({ ...movement, kind }).success).toBe(true);
  });

  it.each(["OPENING", "SALE", "cash_in", "", 1, null])(
    "rejects a cash movement of kind %j",
    (kind) => {
      expect(rendererToCoreMessageSchema.safeParse({ ...movement, kind }).success).toBe(false);
    },
  );

  it.each([1, MAX_CASH_AMOUNT_CENTS])("accepts an amount of %i cents", (amount) => {
    expect(rendererToCoreMessageSchema.safeParse({ ...movement, amount }).success).toBe(true);
  });

  it.each([0, -1, 1.5, MAX_CASH_AMOUNT_CENTS + 1, "100", null])(
    "rejects an amount of %j",
    (amount) => {
      expect(rendererToCoreMessageSchema.safeParse({ ...movement, amount }).success).toBe(false);
    },
  );

  it.each(["Flete", " Flete ", "a".repeat(CASH_MOVEMENT_REASON_MAX_LENGTH)])(
    "accepts the reason %j",
    (reason) => {
      expect(rendererToCoreMessageSchema.safeParse({ ...movement, reason }).success).toBe(true);
    },
  );

  it.each(["", "   ", "a".repeat(CASH_MOVEMENT_REASON_MAX_LENGTH + 1), 1, null])(
    "rejects the reason %j",
    (reason) => {
      expect(rendererToCoreMessageSchema.safeParse({ ...movement, reason }).success).toBe(false);
    },
  );

  it.each(["request_id", "kind", "amount", "reason"])(
    "rejects a cash movement without its %s",
    (field) => {
      expect(
        rendererToCoreMessageSchema.safeParse({ ...movement, [field]: undefined }).success,
      ).toBe(false);
    },
  );

  it.each([{ user_id: "u2" }, { pin: "1234" }, "1234"])(
    "rejects the authorization %j",
    (authorization) => {
      expect(rendererToCoreMessageSchema.safeParse({ ...movement, authorization }).success).toBe(
        false,
      );
    },
  );

  it("drops an actor sent with a cash movement", () => {
    expect(rendererToCoreMessageSchema.parse({ ...movement, actor_id: "u9" })).toEqual(movement);
  });

  it("accepts a request for the open session's cash movements", () => {
    const message = { type: "cash-movements-request", request_id: REQUEST_ID };

    expect(rendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a request for the cash movements without its request id", () => {
    expect(rendererToCoreMessageSchema.safeParse({ type: "cash-movements-request" }).success).toBe(
      false,
    );
  });
});

describe("coreToRendererMessageSchema", () => {
  it.each([true, false])("accepts whether this installation is enrolled: %s", (enrolled) => {
    const message = { type: "enrollment-status", request_id: REQUEST_ID, enrolled };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each(["Caja 1", null])("accepts the register's own name, or none yet: %s", (name) => {
    const message = { type: "register-name", request_id: REQUEST_ID, name };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a register name that is not text or null", () => {
    expect(
      coreToRendererMessageSchema.safeParse({
        type: "register-name",
        request_id: REQUEST_ID,
        name: 3,
      }).success,
    ).toBe(false);
    expect(
      coreToRendererMessageSchema.safeParse({ type: "register-name", request_id: REQUEST_ID })
        .success,
    ).toBe(false);
  });

  it.each([
    { kind: "enrolled" },
    { kind: "code_rejected" },
    { kind: "rate_limited", retry_after_seconds: 600 },
    { kind: "unreachable" },
    { kind: "unavailable" },
    { kind: "storage_unavailable" },
    { kind: "not_stored" },
  ])("accepts the enrollment result $kind", (outcome) => {
    const message = { type: "enrollment-result", request_id: REQUEST_ID, outcome };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "redeemed" },
    {
      kind: "resumed",
      person: { user_id: "u1", first_name: "Ada", permission_keys: ["sell_and_charge"] },
    },
    { kind: "cash_session_opened_by_another" },
    { kind: "code_invalid" },
    { kind: "code_expired" },
    { kind: "code_burned" },
    { kind: "pin_rejected" },
    { kind: "rate_limited", retry_after_seconds: 600 },
    { kind: "unreachable" },
    { kind: "unavailable" },
  ])("accepts the PIN code redemption result $kind", (outcome) => {
    const message = { type: "pin-code-redemption-result", request_id: REQUEST_ID, outcome };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a resumed PIN code redemption without the person", () => {
    const message = {
      type: "pin-code-redemption-result",
      request_id: REQUEST_ID,
      outcome: { kind: "resumed" },
    };

    expect(coreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("rejects a PIN code redemption rate limit without when to retry", () => {
    const message = {
      type: "pin-code-redemption-result",
      request_id: REQUEST_ID,
      outcome: { kind: "rate_limited" },
    };

    expect(coreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("rejects a PIN code redemption result it does not know or without its request id", () => {
    expect(
      coreToRendererMessageSchema.safeParse({
        type: "pin-code-redemption-result",
        request_id: REQUEST_ID,
        outcome: { kind: "not_stored" },
      }).success,
    ).toBe(false);
    expect(
      coreToRendererMessageSchema.safeParse({
        type: "pin-code-redemption-result",
        outcome: { kind: "redeemed" },
      }).success,
    ).toBe(false);
  });

  it("rejects a rate limit without when to retry", () => {
    const message = {
      type: "enrollment-result",
      request_id: REQUEST_ID,
      outcome: { kind: "rate_limited" },
    };

    expect(coreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("rejects an enrollment result it does not know", () => {
    const message = { type: "enrollment-result", request_id: REQUEST_ID, outcome: { kind: "x" } };

    expect(coreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("accepts the notice that a pull finished, which answers no request", () => {
    const message = { type: "pulled" };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects an enrollment status without whether it is enrolled", () => {
    expect(
      coreToRendererMessageSchema.safeParse({ type: "enrollment-status", request_id: REQUEST_ID })
        .success,
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

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts that the users cannot be read", () => {
    const message = { type: "sign-in-users-unavailable", request_id: REQUEST_ID };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts an empty list of users", () => {
    const message = { type: "sign-in-users", request_id: REQUEST_ID, users: [] };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("drops anything else a listed user carries", () => {
    const message = {
      type: "sign-in-users",
      request_id: REQUEST_ID,
      users: [{ id: "u1", first_name: "Ada", salt: "s" }],
    };

    expect(coreToRendererMessageSchema.parse(message)).toEqual({
      ...message,
      users: [{ id: "u1", first_name: "Ada" }],
    });
  });

  it("rejects a listed user without its first name", () => {
    const message = { type: "sign-in-users", request_id: REQUEST_ID, users: [{ id: "u1" }] };

    expect(coreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it.each([
    {
      kind: "signed_in",
      person: {
        user_id: "u1",
        first_name: "Ada",
        permission_keys: ["sell_and_charge", "void_sale"],
      },
    },
    { kind: "signed_in", person: { user_id: "u1", first_name: "Ada", permission_keys: [] } },
    { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 7 },
    { kind: "wrong_pin", retry_after_seconds: 30, attempts_left: 1 },
    { kind: "rate_limited", retry_after_seconds: 4, attempts_left: 5 },
    { kind: "locked", consecutive_failures: 8 },
    { kind: "no_register_permission" },
    { kind: "cash_session_opened_by_another" },
    { kind: "unavailable" },
  ])("accepts the sign-in result $kind", (outcome) => {
    const message = { type: "sign-in-result", request_id: REQUEST_ID, outcome };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a locked result that counts a different number of failures", () => {
    const outcome = { kind: "locked", consecutive_failures: 7 };
    const message = { type: "sign-in-result", request_id: REQUEST_ID, outcome };

    expect(coreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("rejects a locked result without the failures that locked the person", () => {
    const message = {
      type: "sign-in-result",
      request_id: REQUEST_ID,
      outcome: { kind: "locked" },
    };

    expect(coreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("does not let a signed-in result carry a role", () => {
    const message = {
      type: "sign-in-result",
      request_id: REQUEST_ID,
      outcome: {
        kind: "signed_in",
        person: { user_id: "u1", first_name: "Ada", permission_keys: [], role_name: "Cajera" },
      },
    };

    expect(JSON.stringify(coreToRendererMessageSchema.parse(message))).not.toContain("Cajera");
  });

  it.each([
    { kind: "signed_in" },
    { kind: "signed_in", person: { first_name: "Ada" } },
    { kind: "signed_in", person: { first_name: "Ada", permission_keys: [] } },
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

    expect(coreToRendererMessageSchema.safeParse(message).success).toBe(false);
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

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "has_pin" },
    { kind: "has_pin", user: { id: "u1" } },
    { kind: "rate_limited" },
    { kind: "rate_limited", retry_after_seconds: -1 },
    { kind: "x" },
  ])("rejects a sign-in lookup result it does not know: %j", (outcome) => {
    const message = { type: "sign-in-lookup-result", request_id: REQUEST_ID, outcome };

    expect(coreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("does not let a lookup result carry the email", () => {
    const message = {
      type: "sign-in-lookup-result",
      request_id: REQUEST_ID,
      outcome: { kind: "not_found", email: "ada@example.com" },
    };

    expect(JSON.stringify(coreToRendererMessageSchema.parse(message))).not.toContain("ada@");
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

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "rate_limited" },
    { kind: "rate_limited", retry_after_seconds: -1 },
    { kind: "x" },
  ])("rejects a first PIN code request result it does not know: %j", (outcome) => {
    const message = { type: "first-pin-code-request-result", request_id: REQUEST_ID, outcome };

    expect(coreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("does not let a result carry the code", () => {
    const message = {
      type: "first-pin-code-request-result",
      request_id: REQUEST_ID,
      outcome: { kind: "sent", code: "P4NX7KWE2QRT5MZD" },
    };

    expect(JSON.stringify(coreToRendererMessageSchema.parse(message))).not.toContain("P4NX");
  });
});

describe("closing a cash session requests", () => {
  const close = { type: "close-cash-session", request_id: REQUEST_ID, session_id: "s1" };

  it("accepts a request to close a session with the cash counted in cents", () => {
    const message = { ...close, counted_cash: 152500 };

    expect(rendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts a request to close a session with someone's authorization", () => {
    const message = {
      ...close,
      counted_cash: 0,
      authorization: { user_id: "u2", pin: "1234" },
    };

    expect(rendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("drops a closer sent with a request to close a session", () => {
    const message = { ...close, counted_cash: 100 };

    expect(rendererToCoreMessageSchema.parse({ ...message, closed_by: "u9" })).toEqual(message);
  });

  it.each([-1, 1.5, MAX_CASH_AMOUNT_CENTS + 1, "100", null])(
    "rejects a counted cash of %j",
    (counted_cash) => {
      expect(rendererToCoreMessageSchema.safeParse({ ...close, counted_cash }).success).toBe(false);
      expect(countedCashSchema.safeParse(counted_cash).success).toBe(false);
    },
  );

  it.each([
    { type: "close-cash-session", session_id: "s1", counted_cash: 0 },
    { type: "close-cash-session", request_id: REQUEST_ID, counted_cash: 0 },
    { type: "close-cash-session", request_id: REQUEST_ID, session_id: "s1" },
  ])("rejects a request to close a session missing a field: %j", (message) => {
    expect(rendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });

  it("accepts a request for the cash balance of the open session", () => {
    const message = { type: "cash-balance-request", request_id: REQUEST_ID };

    expect(rendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a request for the cash balance without its request id", () => {
    expect(rendererToCoreMessageSchema.safeParse({ type: "cash-balance-request" }).success).toBe(
      false,
    );
  });
});

describe("closing a cash session answers", () => {
  it("accepts the session that was closed with its expected cash, counted cash and difference", () => {
    const message = {
      type: "close-cash-session-result",
      request_id: REQUEST_ID,
      outcome: {
        kind: "closed",
        session: { id: "s1", expected_cash: 150000, counted_cash: 149000, difference: -1000 },
      },
    };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "invalid_counted_cash" },
    { kind: "no_open_session" },
    { kind: "open_sale", total: 4500 },
    { kind: "not_signed_in" },
    { kind: "lacks_permission" },
    { kind: "unavailable" },
    { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 2 },
  ])("accepts the close result $kind", (outcome) => {
    const message = { type: "close-cash-session-result", request_id: REQUEST_ID, outcome };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "closed" },
    { kind: "closed", session: { id: "s1", expected_cash: 0, counted_cash: 0 } },
    { kind: "open_sale" },
    { kind: "x" },
  ])("rejects a close result it does not know: %j", (outcome) => {
    const message = { type: "close-cash-session-result", request_id: REQUEST_ID, outcome };

    expect(coreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("accepts the cash balance of the open session line by line", () => {
    const message = {
      type: "cash-balance",
      request_id: REQUEST_ID,
      balance: {
        opening_float: 10000,
        cash_sales: 5000,
        change_given: 500,
        refunds: 200,
        cash_in: 300,
        expenses: 100,
        withdrawals: 1000,
        expected: 13500,
      },
    };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts that no cash session is open to balance", () => {
    const message = { type: "cash-balance", request_id: REQUEST_ID, balance: null };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a cash balance missing a line", () => {
    const message = {
      type: "cash-balance",
      request_id: REQUEST_ID,
      balance: { opening_float: 0, expected: 0 },
    };

    expect(coreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("accepts that the cash balance cannot be read", () => {
    const message = { type: "cash-balance-unavailable", request_id: REQUEST_ID };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects that the cash balance cannot be read without its request id", () => {
    expect(
      coreToRendererMessageSchema.safeParse({ type: "cash-balance-unavailable" }).success,
    ).toBe(false);
  });
});

describe("cash session answers", () => {
  it("accepts the session that was opened", () => {
    const message = {
      type: "open-cash-session-result",
      request_id: REQUEST_ID,
      outcome: {
        kind: "opened",
        session: { id: "s1", opened_at: "2026-09-30T12:00:00.000Z", opening_float: 150000 },
      },
    };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "not_signed_in" },
    { kind: "not_permitted" },
    { kind: "already_open" },
    { kind: "invalid_opening_float" },
    { kind: "unavailable" },
  ])("accepts the open result $kind", (outcome) => {
    const message = { type: "open-cash-session-result", request_id: REQUEST_ID, outcome };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "opened" },
    { kind: "opened", session: { id: "s1", opened_at: "2026-09-30T12:00:00.000Z" } },
    { kind: "opened", session: { id: "s1", opening_float: 0 } },
    { kind: "opened", session: { opened_at: "2026-09-30T12:00:00.000Z", opening_float: 0 } },
    { kind: "x" },
  ])("rejects an open result it does not know: %j", (outcome) => {
    const message = { type: "open-cash-session-result", request_id: REQUEST_ID, outcome };

    expect(coreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("accepts the open cash session with who opened it", () => {
    const message = {
      type: "cash-session",
      request_id: REQUEST_ID,
      session: {
        id: "s1",
        opened_at: "2026-09-30T12:00:00.000Z",
        opened_by: { user_id: "u1", first_name: "Ada", permission_keys: ["sell_and_charge"] },
      },
    };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts that no cash session is open", () => {
    const message = { type: "cash-session", request_id: REQUEST_ID, session: null };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts that the open cash session cannot be read", () => {
    const message = { type: "cash-session-unavailable", request_id: REQUEST_ID };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects that the open cash session cannot be read without its request id", () => {
    expect(
      coreToRendererMessageSchema.safeParse({ type: "cash-session-unavailable" }).success,
    ).toBe(false);
  });

  it.each([
    undefined,
    { id: "s1", opened_at: "2026-09-30T12:00:00.000Z" },
    { id: "s1", opened_by: { user_id: "u1", first_name: "Ada", permission_keys: [] } },
    {
      opened_at: "2026-09-30T12:00:00.000Z",
      opened_by: { user_id: "u1", first_name: "Ada", permission_keys: [] },
    },
    {
      id: "s1",
      opened_at: "2026-09-30T12:00:00.000Z",
      opened_by: { first_name: "Ada", permission_keys: [] },
    },
  ])("rejects an open cash session it does not know: %j", (session) => {
    const message = { type: "cash-session", request_id: REQUEST_ID, session };

    expect(coreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });
});

describe("cash movement answers", () => {
  it("accepts a recorded movement done by the operator alone", () => {
    const message = {
      type: "record-cash-movement-result",
      request_id: REQUEST_ID,
      outcome: { kind: "recorded", authorized_by: null },
    };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts a recorded movement with the person who authorized it", () => {
    const message = {
      type: "record-cash-movement-result",
      request_id: REQUEST_ID,
      outcome: { kind: "recorded", authorized_by: { user_id: "u2", first_name: "Grace" } },
    };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "recorded" },
    { kind: "recorded", authorized_by: { user_id: "u2" } },
    { kind: "recorded", authorized_by: { first_name: "Grace" } },
  ])("rejects a recorded movement it does not know: %j", (outcome) => {
    const message = { type: "record-cash-movement-result", request_id: REQUEST_ID, outcome };

    expect(coreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it.each([
    { kind: "invalid_amount" },
    { kind: "invalid_reason" },
    { kind: "no_open_session" },
    { kind: "not_signed_in" },
    { kind: "lacks_permission" },
    { kind: "unavailable" },
    { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 7 },
    { kind: "rate_limited", retry_after_seconds: 30, attempts_left: 3 },
    { kind: "locked", consecutive_failures: 8 },
    { kind: "exceeds_expected_cash", expected: 4_200_000 },
  ])("accepts the refusal $kind", (outcome) => {
    const message = { type: "record-cash-movement-result", request_id: REQUEST_ID, outcome };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "x" },
    { kind: "wrong_pin" },
    { kind: "not_permitted" },
    { kind: "exceeds_expected_cash" },
    { kind: "exceeds_expected_cash", expected: "42" },
  ])("rejects a refusal it does not know: %j", (outcome) => {
    const message = { type: "record-cash-movement-result", request_id: REQUEST_ID, outcome };

    expect(coreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  const listed = {
    id: "m1",
    type: "CASH_IN",
    amount: 5000,
    reason: "Cambio de la panadería",
    occurred_at: "2026-09-30T12:30:00.000Z",
    actor: { user_id: "u1", first_name: "Ada" },
    authorized_by: { user_id: "u2", first_name: "Grace" },
  };

  it("accepts the open session's movements, each with who did it and who authorized it", () => {
    const message = { type: "cash-movements", request_id: REQUEST_ID, movements: [listed] };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts a movement without a reason or an authorizer", () => {
    const opening = { ...listed, type: "OPENING", reason: null, authorized_by: null };
    const message = { type: "cash-movements", request_id: REQUEST_ID, movements: [opening] };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each(["OPENING", "SALE", "CHANGE", "REFUND", "CASH_IN", "CASH_OUT", "WITHDRAWAL", "CLOSING"])(
    "accepts a listed movement of type %s",
    (type) => {
      const message = {
        type: "cash-movements",
        request_id: REQUEST_ID,
        movements: [{ ...listed, type }],
      };

      expect(coreToRendererMessageSchema.safeParse(message).success).toBe(true);
    },
  );

  it("accepts an open session with no movements yet", () => {
    const message = { type: "cash-movements", request_id: REQUEST_ID, movements: [] };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts that no cash session is open", () => {
    const message = { type: "cash-movements", request_id: REQUEST_ID, movements: null };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts that the movements cannot be read", () => {
    const message = { type: "cash-movements-unavailable", request_id: REQUEST_ID };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects that the movements cannot be read without its request id", () => {
    expect(
      coreToRendererMessageSchema.safeParse({ type: "cash-movements-unavailable" }).success,
    ).toBe(false);
  });

  it.each([
    ["id", undefined],
    ["type", "TIP"],
    ["type", undefined],
    ["amount", undefined],
    ["amount", "5000"],
    ["reason", undefined],
    ["occurred_at", undefined],
    ["actor", undefined],
    ["actor", { user_id: "u1" }],
    ["actor", { first_name: "Ada" }],
    ["actor", null],
    ["authorized_by", undefined],
    ["authorized_by", { user_id: "u2" }],
    ["authorized_by", { first_name: "Grace" }],
  ])("rejects a listed movement whose %s is %j", (field, value) => {
    const message = {
      type: "cash-movements",
      request_id: REQUEST_ID,
      movements: [{ ...listed, [field]: value }],
    };

    expect(coreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("rejects the movements of a session without saying whether one is open", () => {
    expect(
      coreToRendererMessageSchema.safeParse({ type: "cash-movements", request_id: REQUEST_ID })
        .success,
    ).toBe(false);
  });
});

describe("authorizers answers", () => {
  it("accepts the people who can authorize, by id and first name", () => {
    const message = {
      type: "authorizers",
      request_id: REQUEST_ID,
      users: [{ id: "u2", first_name: "Grace" }],
    };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts that nobody can authorize", () => {
    const message = { type: "authorizers", request_id: REQUEST_ID, users: [] };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts that the authorizers cannot be read", () => {
    const message = { type: "authorizers-unavailable", request_id: REQUEST_ID };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a listed authorizer without its first name", () => {
    const message = { type: "authorizers", request_id: REQUEST_ID, users: [{ id: "u2" }] };

    expect(coreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });
});

describe("sign-out answer", () => {
  it("accepts the confirmation that nobody is signed in", () => {
    const message = { type: "signed-out", request_id: REQUEST_ID };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a confirmation without its request id", () => {
    expect(coreToRendererMessageSchema.safeParse({ type: "signed-out" }).success).toBe(false);
  });
});

describe("mainToCoreMessageSchema", () => {
  it("accepts a health check", () => {
    expect(mainToCoreMessageSchema.safeParse({ type: "health-check" }).success).toBe(true);
  });

  it("rejects any other message type", () => {
    expect(mainToCoreMessageSchema.safeParse({ type: "ping" }).success).toBe(false);
    expect(mainToCoreMessageSchema.safeParse({}).success).toBe(false);
  });
});

describe("coreStatusMessageSchema", () => {
  it.each(["starting", "down", "up"])("accepts a core status of %s", (status) => {
    expect(coreStatusMessageSchema.safeParse({ type: "core-status", status }).success).toBe(true);
  });

  it("rejects a status outside starting, down and up", () => {
    expect(coreStatusMessageSchema.safeParse({ type: "core-status", status: "" }).success).toBe(
      false,
    );
    expect(coreStatusMessageSchema.safeParse({ type: "core-status" }).success).toBe(false);
  });

  it("rejects any other message type", () => {
    expect(coreStatusMessageSchema.safeParse({ type: "ping", status: "up" }).success).toBe(false);
    expect(coreStatusMessageSchema.safeParse({ status: "up" }).success).toBe(false);
  });
});

describe("openingFloatSchema", () => {
  it.each([0, 1, MAX_CASH_AMOUNT_CENTS])("accepts %i cents", (cents) => {
    expect(openingFloatSchema.safeParse(cents).success).toBe(true);
  });

  it.each([-1, 0.5, MAX_CASH_AMOUNT_CENTS + 1, Number.NaN, "100", null])("rejects %j", (value) => {
    expect(openingFloatSchema.safeParse(value).success).toBe(false);
  });
});

describe("cashMovementAmountSchema", () => {
  it.each([1, 500_000, MAX_CASH_AMOUNT_CENTS])("accepts %i cents", (cents) => {
    expect(cashMovementAmountSchema.safeParse(cents).success).toBe(true);
  });

  it.each([0, -1, 0.5, MAX_CASH_AMOUNT_CENTS + 1, Number.NaN, "100", null])(
    "rejects %j",
    (value) => {
      expect(cashMovementAmountSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe("sale requests", () => {
  it("accepts a scan of a code", () => {
    const message = { type: "scan-product", request_id: REQUEST_ID, code: "7791234567890" };

    expect(rendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("does not take who is selling from the renderer", () => {
    const message = { type: "scan-product", request_id: REQUEST_ID, code: "1" };

    expect(rendererToCoreMessageSchema.parse({ ...message, user_id: "u9" })).toEqual(message);
  });

  it.each([
    { type: "scan-product", code: "1" },
    { type: "scan-product", request_id: REQUEST_ID },
    { type: "scan-product", request_id: REQUEST_ID, code: "" },
    { type: "scan-product", request_id: REQUEST_ID, code: "x".repeat(65) },
  ])("rejects a scan that is not well formed: %j", (message) => {
    expect(rendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });

  it("accepts a request for the sale in progress", () => {
    const message = { type: "sale-request", request_id: REQUEST_ID };

    expect(rendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("does not take who is selling from the sale request either", () => {
    const message = { type: "sale-request", request_id: REQUEST_ID };

    expect(rendererToCoreMessageSchema.parse({ ...message, user_id: "u9" })).toEqual(message);
  });

  it("rejects a request for the sale missing its request id", () => {
    expect(rendererToCoreMessageSchema.safeParse({ type: "sale-request" }).success).toBe(false);
  });
});

describe("sale answers", () => {
  const sale = {
    id: "s1",
    lines: [
      {
        id: "l1",
        product_id: "p1",
        product_name: "Yerba",
        quantity: 1,
        list_unit_price: 1500,
        line_total: 1500,
      },
    ],
    total: 1500,
  };

  it.each([
    { kind: "added", sale },
    { kind: "unknown_code" },
    { kind: "no_price", product_name: "Yerba" },
    { kind: "not_signed_in" },
    { kind: "unavailable" },
  ])("accepts the scan result $kind", (outcome) => {
    const message = { type: "scan-product-result", request_id: REQUEST_ID, outcome };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a scan result it does not know", () => {
    const message = {
      type: "scan-product-result",
      request_id: REQUEST_ID,
      outcome: { kind: "somewhere_else" },
    };

    expect(coreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it.each([sale, null])("accepts the sale in progress %j", (value) => {
    const message = { type: "sale", request_id: REQUEST_ID, sale: value };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects the sale in progress without saying whether there is one", () => {
    expect(
      coreToRendererMessageSchema.safeParse({ type: "sale", request_id: REQUEST_ID }).success,
    ).toBe(false);
  });

  it("accepts that the sale in progress cannot be read", () => {
    const message = { type: "sale-unavailable", request_id: REQUEST_ID };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects that the sale in progress cannot be read without its request id", () => {
    expect(coreToRendererMessageSchema.safeParse({ type: "sale-unavailable" }).success).toBe(false);
  });

  it("accepts that the person signed in may not sell", () => {
    const message = { type: "sale-not-permitted", request_id: REQUEST_ID };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects that the person signed in may not sell without its request id", () => {
    expect(coreToRendererMessageSchema.safeParse({ type: "sale-not-permitted" }).success).toBe(
      false,
    );
  });
});
