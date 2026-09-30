import { describe, expect, it } from "vitest";
import type { CorePort } from "./core-client";
import { createCoreClient } from "./core-client";

class FakePort implements CorePort {
  posted: unknown[] = [];
  started = false;
  closed = false;
  private listener: ((event: { data: unknown }) => void) | undefined;

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  addEventListener(_type: "message", listener: (event: { data: unknown }) => void): void {
    this.listener = listener;
  }

  start(): void {
    this.started = true;
  }

  close(): void {
    this.closed = true;
  }

  answer(data: unknown): void {
    this.listener?.({ data });
  }
}

function clientWithSequentialIds() {
  let next = 0;
  return createCoreClient({ newRequestId: () => `request-${++next}` });
}

describe("createCoreClient", () => {
  it("asks the core whether this installation is enrolled and resolves with its answer", async () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const enrolled = client.enrollmentStatus();
    port.answer({ type: "enrollment-status", request_id: "request-1", enrolled: true });

    expect(await enrolled).toBe(true);
    expect(port.started).toBe(true);
    expect(port.posted).toEqual([{ type: "enrollment-status-request", request_id: "request-1" }]);
  });

  it.each(["Caja 1", null])("asks the core for the register's own name: %s", async (name) => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const asked = client.registerName();
    port.answer({ type: "register-name", request_id: "request-1", name });

    expect(await asked).toBe(name);
    expect(port.posted).toEqual([{ type: "register-name-request", request_id: "request-1" }]);
  });

  it("asks the core for the users who can sign in and resolves with them", async () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const users = client.signInUsers();
    port.answer({
      type: "sign-in-users",
      request_id: "request-1",
      users: [{ id: "u1", first_name: "Ada" }],
    });

    expect(await users).toEqual([{ id: "u1", first_name: "Ada" }]);
    expect(port.posted).toEqual([{ type: "sign-in-users", request_id: "request-1" }]);
  });

  it("fails the request for the users when the core cannot read them", async () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const users = client.signInUsers();
    port.answer({ type: "sign-in-users-unavailable", request_id: "request-1" });

    await expect(users).rejects.toThrow();
  });

  it("asks the core for the people who can authorize a permission and resolves with them", async () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const people = client.authorizers("record_cash_in");
    port.answer({
      type: "authorizers",
      request_id: "request-1",
      users: [{ id: "u2", first_name: "Grace" }],
    });

    expect(await people).toEqual([{ id: "u2", first_name: "Grace" }]);
    expect(port.posted).toEqual([
      { type: "authorizers", request_id: "request-1", permission: "record_cash_in" },
    ]);
  });

  it("fails the request for the authorizers when the core cannot read them", async () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const people = client.authorizers("record_cash_in");
    port.answer({ type: "authorizers-unavailable", request_id: "request-1" });

    await expect(people).rejects.toThrow();
  });

  it("asks the core to sign in the chosen user with the PIN as typed and resolves with the outcome", async () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const outcome = client.signIn("u1", "0042");
    port.answer({
      type: "sign-in-result",
      request_id: "request-1",
      outcome: { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 7 },
    });

    expect(await outcome).toEqual({ kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 7 });
    expect(port.posted).toEqual([
      { type: "sign-in", request_id: "request-1", user_id: "u1", pin: "0042" },
    ]);
  });

  it("asks the core who has the email as typed and resolves with the outcome", async () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const outcome = client.signInLookup(" Ada@Example.com ");
    port.answer({
      type: "sign-in-lookup-result",
      request_id: "request-1",
      outcome: { kind: "has_pin", user: { id: "u1", first_name: "Ada" } },
    });

    expect(await outcome).toEqual({ kind: "has_pin", user: { id: "u1", first_name: "Ada" } });
    expect(port.posted).toEqual([
      { type: "sign-in-lookup", request_id: "request-1", email: " Ada@Example.com " },
    ]);
  });

  it("asks the core to email a first PIN code to the person and resolves with the outcome", async () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const outcome = client.requestFirstPinCode("u1");
    port.answer({
      type: "first-pin-code-request-result",
      request_id: "request-1",
      outcome: { kind: "rate_limited", retry_after_seconds: 600 },
    });

    expect(await outcome).toEqual({ kind: "rate_limited", retry_after_seconds: 600 });
    expect(port.posted).toEqual([
      { type: "first-pin-code-request", request_id: "request-1", user_id: "u1" },
    ]);
  });

  it("asks the core to sign in for the first time with the PIN as typed and resolves with the outcome", async () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const outcome = client.firstSignIn("u1", "0042");
    port.answer({
      type: "sign-in-result",
      request_id: "request-1",
      outcome: { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 7 },
    });

    expect(await outcome).toEqual({ kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 7 });
    expect(port.posted).toEqual([
      { type: "first-sign-in", request_id: "request-1", user_id: "u1", pin: "0042" },
    ]);
  });

  it("asks the core to sign out and resolves once it answers", async () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const signedOut = client.signOut();
    port.answer({ type: "signed-out", request_id: "request-1" });

    await expect(signedOut).resolves.toBeUndefined();
    expect(port.posted).toEqual([{ type: "sign-out", request_id: "request-1" }]);
  });

  it("asks the core to open a cash session with the opening float in cents and resolves with the outcome", async () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const outcome = client.openCashSession(2_000_000);
    port.answer({
      type: "open-cash-session-result",
      request_id: "request-1",
      outcome: { kind: "not_permitted" },
    });

    expect(await outcome).toEqual({ kind: "not_permitted" });
    expect(port.posted).toEqual([
      {
        type: "open-cash-session",
        request_id: "request-1",
        opening_float: 2_000_000,
      },
    ]);
  });

  it.each([
    null,
    {
      id: "s1",
      opened_at: "2026-09-30T12:02:00.000Z",
      opened_by: { user_id: "u1", first_name: "Ada", permission_keys: ["sell_and_charge"] },
    },
  ])("asks the core for the open cash session and resolves with it: %j", async (session) => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const asked = client.cashSession();
    port.answer({ type: "cash-session", request_id: "request-1", session });

    expect(await asked).toEqual(session);
    expect(port.posted).toEqual([{ type: "cash-session-request", request_id: "request-1" }]);
  });

  it("resolves that the open cash session is unavailable when the core cannot read it", async () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const asked = client.cashSession();
    port.answer({ type: "cash-session-unavailable", request_id: "request-1" });

    expect(await asked).toBe("unavailable");
  });

  it("asks the core to record a cash movement with its authorization and resolves with the outcome", async () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const outcome = client.recordCashMovement({
      kind: "WITHDRAWAL",
      amount: 7000,
      reason: "Retiro al banco",
      authorization: { user_id: "u2", pin: "1234" },
    });
    port.answer({
      type: "record-cash-movement-result",
      request_id: "request-1",
      outcome: { kind: "recorded", authorized_by: { user_id: "u2", first_name: "Grace" } },
    });

    expect(await outcome).toEqual({
      kind: "recorded",
      authorized_by: { user_id: "u2", first_name: "Grace" },
    });
    expect(port.posted).toEqual([
      {
        type: "record-cash-movement",
        request_id: "request-1",
        kind: "WITHDRAWAL",
        amount: 7000,
        reason: "Retiro al banco",
        authorization: { user_id: "u2", pin: "1234" },
      },
    ]);
  });

  it("asks the core to record a cash movement without an authorization", async () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const outcome = client.recordCashMovement({
      kind: "CASH_IN",
      amount: 100,
      reason: "Cambio",
      authorization: undefined,
    });
    port.answer({
      type: "record-cash-movement-result",
      request_id: "request-1",
      outcome: { kind: "lacks_permission" },
    });

    expect(await outcome).toEqual({ kind: "lacks_permission" });
    expect(port.posted).toEqual([
      {
        type: "record-cash-movement",
        request_id: "request-1",
        kind: "CASH_IN",
        amount: 100,
        reason: "Cambio",
      },
    ]);
  });

  it.each([
    null,
    [
      {
        id: "m1",
        type: "CASH_IN",
        amount: 100,
        reason: "Cambio",
        occurred_at: "2026-09-30T12:00:00.000Z",
        actor: { user_id: "u1", first_name: "Ada" },
        authorized_by: null,
      },
    ],
  ])(
    "asks the core for the open session's cash movements and resolves with them: %j",
    async (movements) => {
      const client = clientWithSequentialIds();
      const port = new FakePort();
      client.connect(port);

      const asked = client.cashMovements();
      port.answer({ type: "cash-movements", request_id: "request-1", movements });

      expect(await asked).toEqual(movements);
      expect(port.posted).toEqual([{ type: "cash-movements-request", request_id: "request-1" }]);
    },
  );

  it("resolves that the cash movements are unavailable when the core cannot read them", async () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const asked = client.cashMovements();
    port.answer({ type: "cash-movements-unavailable", request_id: "request-1" });

    expect(await asked).toBe("unavailable");
  });

  it.each([
    { kind: "unknown_code" },
    { kind: "no_price", product_name: "Yerba" },
    { kind: "unavailable" },
  ])(
    "asks the core to scan the code for the person and resolves with the outcome: %j",
    async (outcome) => {
      const client = clientWithSequentialIds();
      const port = new FakePort();
      client.connect(port);

      const scanned = client.scanProduct("7790001");
      port.answer({ type: "scan-product-result", request_id: "request-1", outcome });

      expect(await scanned).toEqual(outcome);
      expect(port.posted).toEqual([
        { type: "scan-product", request_id: "request-1", code: "7790001" },
      ]);
    },
  );

  it.each([
    { kind: "results", products: [], more: true },
    { kind: "no_open_session" },
    { kind: "unavailable" },
  ])(
    "asks the core to search the products by name and resolves with the outcome: %j",
    async (outcome) => {
      const client = clientWithSequentialIds();
      const port = new FakePort();
      client.connect(port);

      const searched = client.searchProducts("té ver");
      port.answer({ type: "search-products-result", request_id: "request-1", outcome });

      expect(await searched).toEqual(outcome);
      expect(port.posted).toEqual([
        { type: "search-products", request_id: "request-1", query: "té ver" },
      ]);
    },
  );

  it.each([
    { kind: "product_unavailable" },
    { kind: "no_price", product_name: "Yerba" },
    { kind: "unavailable" },
  ])(
    "asks the core to add the product by its id and resolves with the outcome: %j",
    async (outcome) => {
      const client = clientWithSequentialIds();
      const port = new FakePort();
      client.connect(port);

      const added = client.addProduct("p1");
      port.answer({ type: "add-product-result", request_id: "request-1", outcome });

      expect(await added).toEqual(outcome);
      expect(port.posted).toEqual([
        { type: "add-product", request_id: "request-1", product_id: "p1" },
      ]);
    },
  );

  it.each([
    null,
    {
      id: "sale-1",
      lines: [
        {
          id: "line-1",
          product_id: "p1",
          product_name: "Yerba",
          quantity: 2,
          list_unit_price: 2_380,
          discount_amount: 0,
          promotion: null,
          line_total: 4_760,
        },
      ],
      total: 4_760,
    },
  ])(
    "asks the core for the sale in progress of the person and resolves with it: %j",
    async (sale) => {
      const client = clientWithSequentialIds();
      const port = new FakePort();
      client.connect(port);

      const asked = client.currentSale();
      port.answer({ type: "sale", request_id: "request-1", sale });

      expect(await asked).toEqual(sale);
      expect(port.posted).toEqual([{ type: "sale-request", request_id: "request-1" }]);
    },
  );

  it("rejects when the core cannot read the sale in progress", async () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const asked = client.currentSale();
    port.answer({ type: "sale-unavailable", request_id: "request-1" });

    await expect(asked).rejects.toThrow();
  });

  it("resolves that the person signed in may not sell when the core says so", async () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const asked = client.currentSale();
    port.answer({ type: "sale-not-permitted", request_id: "request-1" });

    expect(await asked).toBe("not_permitted");
  });

  it("asks the core to close a session with the cash counted and resolves with the outcome", async () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);
    const closed = {
      kind: "closed",
      session: { id: "s1", expected_cash: 5000, counted_cash: 4800, difference: -200 },
    };

    const outcome = client.closeCashSession("s1", 4800);
    port.answer({ type: "close-cash-session-result", request_id: "request-1", outcome: closed });

    expect(await outcome).toEqual(closed);
    expect(port.posted).toEqual([
      { type: "close-cash-session", request_id: "request-1", session_id: "s1", counted_cash: 4800 },
    ]);
  });

  it("sends the authorization when closing a session with one", async () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);
    const authorization = { user_id: "u2", pin: "1234" };

    const outcome = client.closeCashSession("s1", 0, authorization);
    port.answer({
      type: "close-cash-session-result",
      request_id: "request-1",
      outcome: { kind: "lacks_permission" },
    });

    expect(await outcome).toEqual({ kind: "lacks_permission" });
    expect(port.posted).toEqual([
      {
        type: "close-cash-session",
        request_id: "request-1",
        session_id: "s1",
        counted_cash: 0,
        authorization,
      },
    ]);
  });

  it.each([
    null,
    {
      opening_float: 5000,
      cash_sales: 0,
      change_given: 0,
      refunds: 0,
      cash_in: 0,
      expenses: 0,
      withdrawals: 0,
      expected: 5000,
    },
  ])("asks the core for the cash balance and resolves with it: %j", async (balance) => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const asked = client.cashBalance();
    port.answer({ type: "cash-balance", request_id: "request-1", balance });

    expect(await asked).toEqual(balance);
    expect(port.posted).toEqual([{ type: "cash-balance-request", request_id: "request-1" }]);
  });

  it("resolves that the cash balance is unavailable when the core cannot read it", async () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const asked = client.cashBalance();
    port.answer({ type: "cash-balance-unavailable", request_id: "request-1" });

    expect(await asked).toBe("unavailable");
  });

  it("asks the core to enroll with the code as typed and resolves with the outcome", async () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const outcome = client.enroll("p4nx 7kwe");
    port.answer({
      type: "enrollment-result",
      request_id: "request-1",
      outcome: { kind: "rate_limited", retry_after_seconds: 60 },
    });

    expect(await outcome).toEqual({ kind: "rate_limited", retry_after_seconds: 60 });
    expect(port.posted).toEqual([{ type: "enroll", request_id: "request-1", code: "p4nx 7kwe" }]);
  });

  it("asks the core to redeem a PIN code with the code as typed and the new PIN, and resolves with the outcome", async () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const outcome = client.redeemPinCode("k7qm 2xpa", "482915");
    port.answer({
      type: "pin-code-redemption-result",
      request_id: "request-1",
      outcome: { kind: "code_expired" },
    });

    expect(await outcome).toEqual({ kind: "code_expired" });
    expect(port.posted).toEqual([
      {
        type: "redeem-pin-code",
        request_id: "request-1",
        reset_code: "k7qm 2xpa",
        new_pin: "482915",
      },
    ]);
  });

  it("does not take an enrollment answer for the outcome of a PIN code redemption", async () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const outcome = client.redeemPinCode("k7qm 2xpa", "482915");
    port.answer({
      type: "enrollment-result",
      request_id: "request-1",
      outcome: { kind: "enrolled" },
    });
    port.answer({
      type: "pin-code-redemption-result",
      request_id: "request-1",
      outcome: { kind: "redeemed" },
    });

    expect(await outcome).toEqual({ kind: "redeemed" });
  });

  it("holds a request made before the core is connected until it is", async () => {
    const client = clientWithSequentialIds();
    const enrolled = client.enrollmentStatus();
    const port = new FakePort();

    client.connect(port);
    port.answer({ type: "enrollment-status", request_id: "request-1", enrolled: false });

    expect(port.posted).toEqual([{ type: "enrollment-status-request", request_id: "request-1" }]);
    expect(await enrolled).toBe(false);
  });

  it("ignores an answer that doesn't follow the contract or answers no request", async () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const enrolled = client.enrollmentStatus();
    port.answer({ type: "enrollment-status", request_id: "request-1", enrolled: "yes" });
    port.answer({ type: "enrollment-status", request_id: "request-9", enrolled: false });
    port.answer({
      type: "enrollment-result",
      request_id: "request-1",
      outcome: { kind: "enrolled" },
    });
    port.answer({ type: "enrollment-status", request_id: "request-1", enrolled: true });

    expect(await enrolled).toBe(true);
  });

  it("fails a request the replaced connection can no longer answer, and closes that port", async () => {
    const client = clientWithSequentialIds();
    const previous = new FakePort();
    client.connect(previous);
    const enrolled = client.enrollmentStatus();

    client.connect(new FakePort());

    await expect(enrolled).rejects.toThrow("the core connection was replaced");
    expect(previous.closed).toBe(true);
  });

  it("ignores anything still arriving on a replaced port", async () => {
    const client = clientWithSequentialIds();
    const previous = new FakePort();
    client.connect(previous);
    const next = new FakePort();
    client.connect(next);

    const enrolled = client.enrollmentStatus();
    previous.answer({ type: "enrollment-status", request_id: "request-1", enrolled: false });
    next.answer({ type: "enrollment-status", request_id: "request-1", enrolled: true });

    expect(await enrolled).toBe(true);
  });

  it("tells each listener every time the core finishes a pull, until it stops listening", () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);
    let first = 0;
    let second = 0;
    const stopFirst = client.onPulled(() => {
      first += 1;
    });
    client.onPulled(() => {
      second += 1;
    });

    port.answer({ type: "pulled" });
    stopFirst();
    port.answer({ type: "pulled" });

    expect(first).toBe(1);
    expect(second).toBe(2);
  });

  it("ignores a pull notice arriving on a replaced port", () => {
    const client = clientWithSequentialIds();
    const previous = new FakePort();
    client.connect(previous);
    client.connect(new FakePort());
    let pulls = 0;
    client.onPulled(() => {
      pulls += 1;
    });

    previous.answer({ type: "pulled" });

    expect(pulls).toBe(0);
  });
});
