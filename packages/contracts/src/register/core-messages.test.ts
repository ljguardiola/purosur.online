import { CASH_MOVEMENT_REASON_MAX_LENGTH, MAX_CASH_AMOUNT_CENTS } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  registerCoreToRendererMessageSchema,
  registerRendererToCoreMessageSchema,
} from "./core-messages.js";

const REQUEST_ID = "7d1c1e1e-5b1a-4a53-9c1c-3a7c6f0b2d10";

const OPEN_CASH_SESSION = {
  id: "s1",
  opened_at: "2026-09-30T12:00:00.000Z",
  opened_by: { user_id: "u1", first_name: "Ada", abilities: ["open_cash_session"] },
  locked: false,
};

describe("registerRendererToCoreMessageSchema", () => {
  it("accepts a ping", () => {
    expect(registerRendererToCoreMessageSchema.safeParse({ type: "ping" }).success).toBe(true);
  });

  it("accepts a request for whether this installation is enrolled", () => {
    const message = { type: "enrollment-status-request", request_id: REQUEST_ID };

    expect(registerRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts a request for whether the register is in service", () => {
    const message = { type: "register-service-request", request_id: REQUEST_ID };

    expect(registerRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a request for whether the register is in service without its request id", () => {
    expect(
      registerRendererToCoreMessageSchema.safeParse({ type: "register-service-request" }).success,
    ).toBe(false);
  });

  it("accepts a request for the register's own name", () => {
    const message = { type: "register-name-request", request_id: REQUEST_ID };

    expect(registerRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts an enrollment with the code as typed", () => {
    const message = { type: "enroll", request_id: REQUEST_ID, code: "p4nx 7kwe 2qrt 6mzd" };

    expect(registerRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts a request for the people who may close a locked register", () => {
    const message = { type: "locked-closers-request", request_id: REQUEST_ID };

    expect(registerRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a request for the people who may close a locked register without its request id", () => {
    expect(
      registerRendererToCoreMessageSchema.safeParse({ type: "locked-closers-request" }).success,
    ).toBe(false);
  });

  it("rejects a request without its request id", () => {
    expect(
      registerRendererToCoreMessageSchema.safeParse({ type: "enrollment-status-request" }).success,
    ).toBe(false);
    expect(
      registerRendererToCoreMessageSchema.safeParse({ type: "enroll", code: "x" }).success,
    ).toBe(false);
    expect(
      registerRendererToCoreMessageSchema.safeParse({ type: "register-name-request" }).success,
    ).toBe(false);
  });

  it("rejects an enrollment without a code", () => {
    expect(
      registerRendererToCoreMessageSchema.safeParse({ type: "enroll", request_id: REQUEST_ID })
        .success,
    ).toBe(false);
  });

  it("rejects any other message type", () => {
    expect(registerRendererToCoreMessageSchema.safeParse({ type: "health-check" }).success).toBe(
      false,
    );
    expect(registerRendererToCoreMessageSchema.safeParse({}).success).toBe(false);
  });
});

describe("cash session requests", () => {
  it("accepts a request to open a cash session with the float in cents", () => {
    const message = { type: "open-cash-session", request_id: REQUEST_ID, opening_float: 150000 };

    expect(registerRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("drops an opener sent with a request to open a cash session", () => {
    const message = { type: "open-cash-session", request_id: REQUEST_ID, opening_float: 150000 };

    expect(registerRendererToCoreMessageSchema.parse({ ...message, user_id: "u9" })).toEqual(
      message,
    );
  });

  it.each([0, MAX_CASH_AMOUNT_CENTS])("accepts an opening float of %i cents", (opening_float) => {
    const message = { type: "open-cash-session", request_id: REQUEST_ID, opening_float };

    expect(registerRendererToCoreMessageSchema.safeParse(message).success).toBe(true);
  });

  it.each([-1, MAX_CASH_AMOUNT_CENTS + 1, 2_147_483_648])(
    "leaves an out-of-range opening float of %i to the core",
    (opening_float) => {
      const message = { type: "open-cash-session", request_id: REQUEST_ID, opening_float };

      expect(registerRendererToCoreMessageSchema.safeParse(message).success).toBe(true);
    },
  );

  it.each([1.5, Number.NaN, "100", null])("rejects an opening float of %j", (opening_float) => {
    const message = { type: "open-cash-session", request_id: REQUEST_ID, opening_float };

    expect(registerRendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });

  it.each([
    { type: "open-cash-session", opening_float: 0 },
    { type: "open-cash-session", request_id: REQUEST_ID },
  ])("rejects a request to open a cash session missing a field: %j", (message) => {
    expect(registerRendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });

  it("accepts a request for the open cash session", () => {
    const message = { type: "cash-session-request", request_id: REQUEST_ID };

    expect(registerRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a request for the open cash session without its request id", () => {
    expect(
      registerRendererToCoreMessageSchema.safeParse({ type: "cash-session-request" }).success,
    ).toBe(false);
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
    expect(registerRendererToCoreMessageSchema.parse(movement)).toEqual(movement);
  });

  it("accepts a cash movement authorized with another person's PIN", () => {
    const authorized = { ...movement, authorization: { user_id: "u2", pin: "1234" } };

    expect(registerRendererToCoreMessageSchema.parse(authorized)).toEqual(authorized);
  });

  it.each(["CASH_IN", "CASH_OUT", "WITHDRAWAL"])("accepts a cash movement of kind %s", (kind) => {
    expect(registerRendererToCoreMessageSchema.safeParse({ ...movement, kind }).success).toBe(true);
  });

  it.each(["OPENING", "SALE", "cash_in", "", 1, null])(
    "rejects a cash movement of kind %j",
    (kind) => {
      expect(registerRendererToCoreMessageSchema.safeParse({ ...movement, kind }).success).toBe(
        false,
      );
    },
  );

  it.each([1, MAX_CASH_AMOUNT_CENTS])("accepts an amount of %i cents", (amount) => {
    expect(registerRendererToCoreMessageSchema.safeParse({ ...movement, amount }).success).toBe(
      true,
    );
  });

  it.each([0, -1, MAX_CASH_AMOUNT_CENTS + 1, 2_147_483_648])(
    "leaves an out-of-range amount of %i to the core",
    (amount) => {
      expect(registerRendererToCoreMessageSchema.safeParse({ ...movement, amount }).success).toBe(
        true,
      );
    },
  );

  it.each([1.5, Number.NaN, "100", null])("rejects an amount of %j", (amount) => {
    expect(registerRendererToCoreMessageSchema.safeParse({ ...movement, amount }).success).toBe(
      false,
    );
  });

  it.each(["Flete", " Flete ", "", "   ", "a".repeat(CASH_MOVEMENT_REASON_MAX_LENGTH + 1)])(
    "carries the reason %j as typed, for the core to judge",
    (reason) => {
      expect(registerRendererToCoreMessageSchema.safeParse({ ...movement, reason }).success).toBe(
        true,
      );
    },
  );

  it.each([1, null])("rejects the reason %j", (reason) => {
    expect(registerRendererToCoreMessageSchema.safeParse({ ...movement, reason }).success).toBe(
      false,
    );
  });

  it.each(["request_id", "kind", "amount", "reason"])(
    "rejects a cash movement without its %s",
    (field) => {
      expect(
        registerRendererToCoreMessageSchema.safeParse({ ...movement, [field]: undefined }).success,
      ).toBe(false);
    },
  );

  it.each([{ user_id: "u2" }, { pin: "1234" }, "1234"])(
    "rejects the authorization %j",
    (authorization) => {
      expect(
        registerRendererToCoreMessageSchema.safeParse({ ...movement, authorization }).success,
      ).toBe(false);
    },
  );

  it("drops an actor sent with a cash movement", () => {
    expect(registerRendererToCoreMessageSchema.parse({ ...movement, actor_id: "u9" })).toEqual(
      movement,
    );
  });

  it("accepts a request for the open session's cash movements", () => {
    const message = { type: "cash-movements-request", request_id: REQUEST_ID };

    expect(registerRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a request for the cash movements without its request id", () => {
    expect(
      registerRendererToCoreMessageSchema.safeParse({ type: "cash-movements-request" }).success,
    ).toBe(false);
  });
});

describe("registerCoreToRendererMessageSchema", () => {
  it.each([true, false])("accepts whether this installation is enrolled: %s", (enrolled) => {
    const message = { type: "enrollment-status", request_id: REQUEST_ID, enrolled };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each(["in_service", "out_of_service"])(
    "accepts whether the register is in service: %s",
    (service) => {
      const message = { type: "register-service", request_id: REQUEST_ID, service };

      expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
    },
  );

  it("rejects a register service that is neither in service nor out of service", () => {
    expect(
      registerCoreToRendererMessageSchema.safeParse({
        type: "register-service",
        request_id: REQUEST_ID,
        service: "damaged",
      }).success,
    ).toBe(false);
    expect(
      registerCoreToRendererMessageSchema.safeParse({
        type: "register-service",
        request_id: REQUEST_ID,
      }).success,
    ).toBe(false);
  });

  it.each(["Caja 1", null])("accepts the register's own name, or none yet: %s", (name) => {
    const message = { type: "register-name", request_id: REQUEST_ID, name };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a register name that is not text or null", () => {
    expect(
      registerCoreToRendererMessageSchema.safeParse({
        type: "register-name",
        request_id: REQUEST_ID,
        name: 3,
      }).success,
    ).toBe(false);
    expect(
      registerCoreToRendererMessageSchema.safeParse({
        type: "register-name",
        request_id: REQUEST_ID,
      }).success,
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
    { kind: "invalid_input", fields: ["code"] },
  ])("accepts the enrollment result $kind", (outcome) => {
    const message = { type: "enrollment-result", request_id: REQUEST_ID, outcome };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a rate limit without when to retry", () => {
    const message = {
      type: "enrollment-result",
      request_id: REQUEST_ID,
      outcome: { kind: "rate_limited" },
    };

    expect(registerCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("rejects an enrollment refusal naming a field the enrollment does not have", () => {
    const message = {
      type: "enrollment-result",
      request_id: REQUEST_ID,
      outcome: { kind: "invalid_input", fields: ["hostname"] },
    };

    expect(registerCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("rejects an enrollment result it does not know", () => {
    const message = { type: "enrollment-result", request_id: REQUEST_ID, outcome: { kind: "x" } };

    expect(registerCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("rejects an enrollment status without whether it is enrolled", () => {
    expect(
      registerCoreToRendererMessageSchema.safeParse({
        type: "enrollment-status",
        request_id: REQUEST_ID,
      }).success,
    ).toBe(false);
  });
});

describe("closing a cash session requests", () => {
  const close = { type: "close-cash-session", request_id: REQUEST_ID, session_id: "s1" };

  it("accepts a request to close a session with the cash counted in cents", () => {
    const message = { ...close, counted_cash: 152500 };

    expect(registerRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("drops an authorization sent with a request to close a session", () => {
    const message = { ...close, counted_cash: 0 };

    expect(
      registerRendererToCoreMessageSchema.parse({
        ...message,
        authorization: { user_id: "u2", pin: "1234" },
      }),
    ).toEqual(message);
  });

  it("drops a closer sent with a request to close a session", () => {
    const message = { ...close, counted_cash: 100 };

    expect(registerRendererToCoreMessageSchema.parse({ ...message, closed_by: "u9" })).toEqual(
      message,
    );
  });

  it.each([-1, MAX_CASH_AMOUNT_CENTS + 1, 2_147_483_648])(
    "leaves an out-of-range counted cash of %i to the core",
    (counted_cash) => {
      expect(
        registerRendererToCoreMessageSchema.safeParse({ ...close, counted_cash }).success,
      ).toBe(true);
    },
  );

  it.each([1.5, Number.NaN, "100", null])("rejects a counted cash of %j", (counted_cash) => {
    expect(registerRendererToCoreMessageSchema.safeParse({ ...close, counted_cash }).success).toBe(
      false,
    );
  });

  it.each([
    { type: "close-cash-session", session_id: "s1", counted_cash: 0 },
    { type: "close-cash-session", request_id: REQUEST_ID, counted_cash: 0 },
    { type: "close-cash-session", request_id: REQUEST_ID, session_id: "s1" },
  ])("rejects a request to close a session missing a field: %j", (message) => {
    expect(registerRendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });

  it("accepts a request for the cash balance of the open session", () => {
    const message = { type: "cash-balance-request", request_id: REQUEST_ID };

    expect(registerRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a request for the cash balance without its request id", () => {
    expect(
      registerRendererToCoreMessageSchema.safeParse({ type: "cash-balance-request" }).success,
    ).toBe(false);
  });
});

describe("previewing a cash count", () => {
  it("accepts a request to preview the counted cash of the open session", () => {
    const message = {
      type: "cash-count-preview-request",
      request_id: REQUEST_ID,
      counted_cash: 42_000,
    };

    expect(registerRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { type: "cash-count-preview-request", request_id: REQUEST_ID },
    { type: "cash-count-preview-request", request_id: REQUEST_ID, counted_cash: 10.5 },
    { type: "cash-count-preview-request", counted_cash: 100 },
  ])("rejects a malformed request to preview a count: %j", (message) => {
    expect(registerRendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });

  it.each([-800, 0, 500])("accepts a preview whose difference is %s", (difference) => {
    const message = { type: "cash-count-preview", request_id: REQUEST_ID, preview: { difference } };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts that no cash session is open to preview", () => {
    const message = { type: "cash-count-preview", request_id: REQUEST_ID, preview: null };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a preview without its difference", () => {
    const message = { type: "cash-count-preview", request_id: REQUEST_ID, preview: {} };

    expect(registerCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("accepts that the preview cannot be read", () => {
    const message = { type: "cash-count-preview-unavailable", request_id: REQUEST_ID };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
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

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "invalid_counted_cash" },
    { kind: "no_open_session" },
    { kind: "open_sale", total: 4500, cancellable: true },
    { kind: "open_sale", total: 4500, cancellable: false },
    { kind: "not_signed_in" },
    { kind: "lacks_permission" },
    { kind: "unavailable" },
  ])("accepts the close result $kind", (outcome) => {
    const message = { type: "close-cash-session-result", request_id: REQUEST_ID, outcome };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "closed" },
    { kind: "closed", session: { id: "s1", expected_cash: 0, counted_cash: 0 } },
    { kind: "open_sale" },
    { kind: "open_sale", total: 4500 },
    { kind: "open_sale", total: 4500, cancellable: "yes" },
    { kind: "x" },
    { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 2 },
    { kind: "rate_limited", retry_after_seconds: 4, attempts_left: 5 },
    { kind: "locked", consecutive_failures: 8 },
  ])("rejects a close result it does not know: %j", (outcome) => {
    const message = { type: "close-cash-session-result", request_id: REQUEST_ID, outcome };

    expect(registerCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("accepts the cash balance of the open session line by line", () => {
    const message = {
      type: "cash-balance",
      request_id: REQUEST_ID,
      balance: {
        opening_float: { amount: 10000, direction: "in" },
        cash_sales: { amount: 5000, direction: "in" },
        change_given: { amount: 500, direction: "out" },
        refunds: { amount: 200, direction: "out" },
        cash_in: { amount: 300, direction: "in" },
        expenses: { amount: 100, direction: "out" },
        withdrawals: { amount: 1000, direction: "out" },
        expected: 13500,
      },
    };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a cash balance line without its direction", () => {
    const message = {
      type: "cash-balance",
      request_id: REQUEST_ID,
      balance: {
        opening_float: { amount: 10000 },
        cash_sales: { amount: 0, direction: "in" },
        change_given: { amount: 0, direction: "out" },
        refunds: { amount: 0, direction: "out" },
        cash_in: { amount: 0, direction: "in" },
        expenses: { amount: 0, direction: "out" },
        withdrawals: { amount: 0, direction: "out" },
        expected: 10000,
      },
    };

    expect(registerCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("accepts that no cash session is open to balance", () => {
    const message = { type: "cash-balance", request_id: REQUEST_ID, balance: null };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a cash balance missing a line", () => {
    const message = {
      type: "cash-balance",
      request_id: REQUEST_ID,
      balance: { opening_float: 0, expected: 0 },
    };

    expect(registerCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("accepts that the cash balance cannot be read", () => {
    const message = { type: "cash-balance-unavailable", request_id: REQUEST_ID };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects that the cash balance cannot be read without its request id", () => {
    expect(
      registerCoreToRendererMessageSchema.safeParse({ type: "cash-balance-unavailable" }).success,
    ).toBe(false);
  });
});

describe("the open sale of the cash session", () => {
  it("accepts a request for the open sale", () => {
    const message = { type: "session-open-sale-request", request_id: REQUEST_ID };

    expect(registerRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a request for the open sale without its request id", () => {
    expect(
      registerRendererToCoreMessageSchema.safeParse({ type: "session-open-sale-request" }).success,
    ).toBe(false);
  });

  it.each([{ total: 3_434_000, cancellable: true }, { total: 0, cancellable: false }, null])(
    "accepts the open sale answered: %j",
    (sale) => {
      const message = { type: "session-open-sale", request_id: REQUEST_ID, sale };

      expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
    },
  );

  it.each([{ total: 4500 }, { cancellable: true }, { total: 4500, cancellable: "yes" }])(
    "rejects an open sale it does not know: %j",
    (sale) => {
      const message = { type: "session-open-sale", request_id: REQUEST_ID, sale };

      expect(registerCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
    },
  );

  it("accepts that the open sale cannot be read", () => {
    const message = { type: "session-open-sale-unavailable", request_id: REQUEST_ID };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects that the open sale cannot be read without its request id", () => {
    expect(
      registerCoreToRendererMessageSchema.safeParse({ type: "session-open-sale-unavailable" })
        .success,
    ).toBe(false);
  });
});

describe("identifying who closes a locked register", () => {
  const identify = {
    type: "identify-locked-closer",
    request_id: REQUEST_ID,
    closer: { user_id: "u2", pin: "1234" },
  };

  it("accepts a request to identify the closer by their PIN", () => {
    expect(registerRendererToCoreMessageSchema.parse(identify)).toEqual(identify);
  });

  it.each(["request_id", "closer"])("rejects a request missing its %s", (field) => {
    const message = Object.fromEntries(Object.entries(identify).filter(([key]) => key !== field));

    expect(registerRendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });

  it("accepts the person identified by their id and first name", () => {
    const message = {
      type: "identify-locked-closer-result",
      request_id: REQUEST_ID,
      outcome: { kind: "identified", person: { user_id: "u2", first_name: "Grace" } },
    };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "not_locked" },
    { kind: "lacks_permission" },
    { kind: "unavailable" },
    { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 2 },
    { kind: "locked", consecutive_failures: 8 },
  ])("accepts the identification result $kind", (outcome) => {
    const message = { type: "identify-locked-closer-result", request_id: REQUEST_ID, outcome };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "identified" },
    { kind: "identified", person: { user_id: "u2" } },
    { kind: "not_signed_in" },
  ])("rejects an identification result it does not know: %j", (outcome) => {
    const message = { type: "identify-locked-closer-result", request_id: REQUEST_ID, outcome };

    expect(registerCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });
});

describe("closing a locked register's cash session", () => {
  const close = {
    type: "close-locked-cash-session",
    request_id: REQUEST_ID,
    session_id: "s1",
    counted_cash: 152500,
    closer: { user_id: "u2", pin: "1234" },
  };

  it("accepts a request to close the session with the cash counted and the closer's PIN", () => {
    expect(registerRendererToCoreMessageSchema.parse(close)).toEqual(close);
  });

  it.each([-1, MAX_CASH_AMOUNT_CENTS + 1, 2_147_483_648])(
    "leaves an out-of-range counted cash of %i to the core",
    (counted_cash) => {
      expect(
        registerRendererToCoreMessageSchema.safeParse({ ...close, counted_cash }).success,
      ).toBe(true);
    },
  );

  it.each([1.5, Number.NaN, "100", null])("rejects a counted cash of %j", (counted_cash) => {
    expect(registerRendererToCoreMessageSchema.safeParse({ ...close, counted_cash }).success).toBe(
      false,
    );
  });

  it.each(["request_id", "session_id", "counted_cash", "closer"])(
    "rejects a request missing its %s",
    (field) => {
      const message = Object.fromEntries(Object.entries(close).filter(([key]) => key !== field));

      expect(registerRendererToCoreMessageSchema.safeParse(message).success).toBe(false);
    },
  );

  it("rejects a closer without a PIN", () => {
    const message = { ...close, closer: { user_id: "u2" } };

    expect(registerRendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });

  it("accepts the session that was closed with its expected cash, counted cash and difference", () => {
    const message = {
      type: "close-locked-cash-session-result",
      request_id: REQUEST_ID,
      outcome: {
        kind: "closed",
        session: { id: "s1", expected_cash: 150000, counted_cash: 149000, difference: -1000 },
      },
    };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "invalid_counted_cash" },
    { kind: "no_open_session" },
    { kind: "open_sale", total: 4500, cancellable: true },
    { kind: "open_sale", total: 4500, cancellable: false },
    { kind: "not_locked" },
    { kind: "lacks_permission" },
    { kind: "unavailable" },
    { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 2 },
    { kind: "rate_limited", retry_after_seconds: 1, attempts_left: 2 },
  ])("accepts the close result $kind", (outcome) => {
    const message = { type: "close-locked-cash-session-result", request_id: REQUEST_ID, outcome };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "not_signed_in" },
    { kind: "closed", session: { id: "s1", expected_cash: 0, counted_cash: 0 } },
    { kind: "open_sale" },
    { kind: "open_sale", total: 4500 },
    { kind: "open_sale", total: 4500, cancellable: "yes" },
  ])("rejects a close result it does not know: %j", (outcome) => {
    const message = { type: "close-locked-cash-session-result", request_id: REQUEST_ID, outcome };

    expect(registerCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });
});

describe("cash session answers", () => {
  it.each([OPEN_CASH_SESSION, null])(
    "accepts the cash session as the core sees it once opened: %j",
    (cashSession) => {
      const message = {
        type: "open-cash-session-result",
        request_id: REQUEST_ID,
        outcome: { kind: "opened", cash_session: cashSession },
      };

      expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
    },
  );

  it.each([
    { kind: "not_signed_in" },
    { kind: "not_permitted" },
    { kind: "already_open" },
    { kind: "invalid_opening_float" },
    { kind: "unavailable" },
  ])("accepts the open result $kind", (outcome) => {
    const message = { type: "open-cash-session-result", request_id: REQUEST_ID, outcome };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "opened" },
    { kind: "opened", cash_session: { ...OPEN_CASH_SESSION, locked: undefined } },
    { kind: "x" },
  ])("rejects an open result it does not know: %j", (outcome) => {
    const message = { type: "open-cash-session-result", request_id: REQUEST_ID, outcome };

    expect(registerCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("accepts the open cash session with who opened it", () => {
    const message = {
      type: "cash-session",
      request_id: REQUEST_ID,
      session: {
        id: "s1",
        opened_at: "2026-09-30T12:00:00.000Z",
        opened_by: { user_id: "u1", first_name: "Ada", abilities: ["open_cash_session"] },
        locked: false,
      },
    };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts that no cash session is open", () => {
    const message = { type: "cash-session", request_id: REQUEST_ID, session: null };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts that the open cash session cannot be read", () => {
    const message = { type: "cash-session-unavailable", request_id: REQUEST_ID };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects that the open cash session cannot be read without its request id", () => {
    expect(
      registerCoreToRendererMessageSchema.safeParse({ type: "cash-session-unavailable" }).success,
    ).toBe(false);
  });

  it.each([
    undefined,
    { id: "s1", opened_at: "2026-09-30T12:00:00.000Z", locked: false },
    {
      id: "s1",
      opened_by: { user_id: "u1", first_name: "Ada", abilities: [] },
      locked: false,
    },
    {
      opened_at: "2026-09-30T12:00:00.000Z",
      opened_by: { user_id: "u1", first_name: "Ada", abilities: [] },
      locked: false,
    },
    {
      id: "s1",
      opened_at: "2026-09-30T12:00:00.000Z",
      opened_by: { first_name: "Ada", abilities: [] },
      locked: false,
    },
    {
      id: "s1",
      opened_at: "2026-09-30T12:00:00.000Z",
      opened_by: { user_id: "u1", first_name: "Ada", abilities: [] },
    },
    {
      id: "s1",
      opened_at: "2026-09-30T12:00:00.000Z",
      opened_by: { user_id: "u1", first_name: "Ada", abilities: [] },
      locked: "yes",
    },
  ])("rejects an open cash session it does not know: %j", (session) => {
    const message = { type: "cash-session", request_id: REQUEST_ID, session };

    expect(registerCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });
});

describe("cash movement answers", () => {
  it("accepts a recorded movement done by the operator alone", () => {
    const message = {
      type: "record-cash-movement-result",
      request_id: REQUEST_ID,
      outcome: { kind: "recorded", authorized_by: null },
    };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts a recorded movement with the person who authorized it", () => {
    const message = {
      type: "record-cash-movement-result",
      request_id: REQUEST_ID,
      outcome: { kind: "recorded", authorized_by: { user_id: "u2", first_name: "Grace" } },
    };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "recorded" },
    { kind: "recorded", authorized_by: { user_id: "u2" } },
    { kind: "recorded", authorized_by: { first_name: "Grace" } },
  ])("rejects a recorded movement it does not know: %j", (outcome) => {
    const message = { type: "record-cash-movement-result", request_id: REQUEST_ID, outcome };

    expect(registerCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it.each([
    { kind: "invalid_amount" },
    { kind: "invalid_reason", max_length: 200 },
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

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "x" },
    { kind: "wrong_pin" },
    { kind: "not_permitted" },
    { kind: "invalid_reason" },
    { kind: "invalid_reason", max_length: "200" },
    { kind: "exceeds_expected_cash" },
    { kind: "exceeds_expected_cash", expected: "42" },
  ])("rejects a refusal it does not know: %j", (outcome) => {
    const message = { type: "record-cash-movement-result", request_id: REQUEST_ID, outcome };

    expect(registerCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  const listed = {
    id: "m1",
    type: "CASH_IN",
    amount: 5000,
    reason: "Cambio de la panadería",
    occurred_at: "2026-09-30T12:30:00.000Z",
    direction: "in",
    actor: { user_id: "u1", first_name: "Ada" },
    authorized_by: { user_id: "u2", first_name: "Grace" },
  };

  it("accepts the open session's movements, each with who did it and who authorized it", () => {
    const message = { type: "cash-movements", request_id: REQUEST_ID, movements: [listed] };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each(["in", "out", "none"])(
    "accepts a listed movement that moves the cash %s",
    (direction) => {
      const message = {
        type: "cash-movements",
        request_id: REQUEST_ID,
        movements: [{ ...listed, direction }],
      };

      expect(registerCoreToRendererMessageSchema.safeParse(message).success).toBe(true);
    },
  );

  it.each([undefined, "sideways"])(
    "rejects a listed movement whose direction is %s",
    (direction) => {
      const message = {
        type: "cash-movements",
        request_id: REQUEST_ID,
        movements: [{ ...listed, direction }],
      };

      expect(registerCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
    },
  );

  it("accepts a movement without a reason or an authorizer", () => {
    const opening = { ...listed, type: "OPENING", reason: null, authorized_by: null };
    const message = { type: "cash-movements", request_id: REQUEST_ID, movements: [opening] };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each(["OPENING", "SALE", "CHANGE", "REFUND", "CASH_IN", "CASH_OUT", "WITHDRAWAL", "CLOSING"])(
    "accepts a listed movement of type %s",
    (type) => {
      const message = {
        type: "cash-movements",
        request_id: REQUEST_ID,
        movements: [{ ...listed, type }],
      };

      expect(registerCoreToRendererMessageSchema.safeParse(message).success).toBe(true);
    },
  );

  it("accepts an open session with no movements yet", () => {
    const message = { type: "cash-movements", request_id: REQUEST_ID, movements: [] };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts that no cash session is open", () => {
    const message = { type: "cash-movements", request_id: REQUEST_ID, movements: null };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts that the movements cannot be read", () => {
    const message = { type: "cash-movements-unavailable", request_id: REQUEST_ID };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects that the movements cannot be read without its request id", () => {
    expect(
      registerCoreToRendererMessageSchema.safeParse({ type: "cash-movements-unavailable" }).success,
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

    expect(registerCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("rejects the movements of a session without saying whether one is open", () => {
    expect(
      registerCoreToRendererMessageSchema.safeParse({
        type: "cash-movements",
        request_id: REQUEST_ID,
      }).success,
    ).toBe(false);
  });
});

describe("locked register closers answers", () => {
  it("accepts the people who may close a locked register, by id and first name", () => {
    const message = {
      type: "locked-closers",
      request_id: REQUEST_ID,
      users: [{ id: "u2", first_name: "Grace" }],
    };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts that nobody may close a locked register", () => {
    const message = { type: "locked-closers", request_id: REQUEST_ID, users: [] };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts that the locked register's closers cannot be read", () => {
    const message = { type: "locked-closers-unavailable", request_id: REQUEST_ID };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a listed closer without its first name", () => {
    const message = { type: "locked-closers", request_id: REQUEST_ID, users: [{ id: "u2" }] };

    expect(registerCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });
});

describe("cash movement kinds request", () => {
  it("accepts a request for the cash movements the person signed in can record", () => {
    const message = { type: "cash-movement-kinds-request", request_id: REQUEST_ID };

    expect(registerRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("does not take who is signed in from the request", () => {
    const message = { type: "cash-movement-kinds-request", request_id: REQUEST_ID };

    expect(registerRendererToCoreMessageSchema.parse({ ...message, user_id: "u9" })).toEqual(
      message,
    );
  });

  it("rejects a request missing its request id", () => {
    expect(
      registerRendererToCoreMessageSchema.safeParse({ type: "cash-movement-kinds-request" })
        .success,
    ).toBe(false);
  });
});

describe("cash movement kinds answers", () => {
  const kinds = {
    CASH_IN: { permission: "record_cash_in", authorization_required: false },
    CASH_OUT: { permission: "record_cash_expense", authorization_required: true },
    WITHDRAWAL: { permission: "withdraw_cash", authorization_required: true },
  };

  it.each([[kinds], [null]])("accepts the answer %j", (answered) => {
    const message = { type: "cash-movement-kinds", request_id: REQUEST_ID, kinds: answered };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    ["a kind left out", { CASH_IN: kinds.CASH_IN, CASH_OUT: kinds.CASH_OUT }],
    ["a kind that is not a cash movement kind", { ...kinds, OPENING: kinds.CASH_IN }],
    [
      "a permission that cannot be authorized",
      { ...kinds, CASH_IN: { ...kinds.CASH_IN, permission: "sell_and_charge" } },
    ],
    ["an unknown permission", { ...kinds, CASH_IN: { ...kinds.CASH_IN, permission: "fly" } }],
    [
      "no say on whether an authorizer is needed",
      { ...kinds, CASH_IN: { permission: "record_cash_in" } },
    ],
  ])("rejects %s", (_case, answered) => {
    expect(
      registerCoreToRendererMessageSchema.safeParse({
        type: "cash-movement-kinds",
        request_id: REQUEST_ID,
        kinds: answered,
      }).success,
    ).toBe(false);
  });

  it("accepts that the kinds cannot be read, and rejects it without its request id", () => {
    const message = { type: "cash-movement-kinds-unavailable", request_id: REQUEST_ID };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
    expect(
      registerCoreToRendererMessageSchema.safeParse({ type: "cash-movement-kinds-unavailable" })
        .success,
    ).toBe(false);
  });
});

describe("checking typed input", () => {
  it("accepts a check of an enrollment code as typed", () => {
    const message = { type: "check-enrollment-code", request_id: REQUEST_ID, code: "p4nx 7kwe" };

    expect(registerRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { type: "check-enrollment-code", request_id: REQUEST_ID },
    { type: "check-enrollment-code", code: "p4nx" },
  ])("rejects an enrollment code check that is not well formed: %j", (message) => {
    expect(registerRendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });

  it.each([[["code"]], [[]]])("accepts an enrollment code check refusing %j", (fields) => {
    const message = { type: "enrollment-code-check", request_id: REQUEST_ID, fields };

    expect(registerCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { type: "enrollment-code-check", request_id: REQUEST_ID, fields: ["hostname"] },
    { type: "enrollment-code-check", request_id: REQUEST_ID },
    { type: "enrollment-code-check", fields: [] },
  ])("rejects a check answer that is not well formed: %j", (message) => {
    expect(registerCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });
});
