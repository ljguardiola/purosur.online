import { MAX_CASH_AMOUNT_CENTS } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  coreStatusMessageSchema,
  coreToRendererMessageSchema,
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
  it("accepts a request to open a cash session with the opener and the float in cents", () => {
    const message = {
      type: "open-cash-session",
      request_id: REQUEST_ID,
      user_id: "u1",
      opening_float: 150000,
    };

    expect(rendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it.each([0, MAX_CASH_AMOUNT_CENTS])("accepts an opening float of %i cents", (opening_float) => {
    const message = {
      type: "open-cash-session",
      request_id: REQUEST_ID,
      user_id: "u1",
      opening_float,
    };

    expect(rendererToCoreMessageSchema.safeParse(message).success).toBe(true);
  });

  it.each([-1, 1.5, MAX_CASH_AMOUNT_CENTS + 1, "100", null])(
    "rejects an opening float of %j",
    (opening_float) => {
      const message = {
        type: "open-cash-session",
        request_id: REQUEST_ID,
        user_id: "u1",
        opening_float,
      };

      expect(rendererToCoreMessageSchema.safeParse(message).success).toBe(false);
    },
  );

  it.each([
    { type: "open-cash-session", user_id: "u1", opening_float: 0 },
    { type: "open-cash-session", request_id: REQUEST_ID, opening_float: 0 },
    { type: "open-cash-session", request_id: REQUEST_ID, user_id: "u1" },
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
    { kind: "not_stored" },
  ])("accepts the enrollment result $kind", (outcome) => {
    const message = { type: "enrollment-result", request_id: REQUEST_ID, outcome };

    expect(coreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "redeemed" },
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
