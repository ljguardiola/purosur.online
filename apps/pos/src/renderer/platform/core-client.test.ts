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

  it("asks the core to open a cash session for the person with the opening float in cents and resolves with the outcome", async () => {
    const client = clientWithSequentialIds();
    const port = new FakePort();
    client.connect(port);

    const outcome = client.openCashSession("u1", 2_000_000);
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
        user_id: "u1",
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
