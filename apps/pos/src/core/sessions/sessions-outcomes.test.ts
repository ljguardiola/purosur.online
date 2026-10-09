import type { OpenCashSession } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { authorizationAnswer, signInAnswer } from "./sessions-outcomes";

const OPEN_CASH_SESSION: OpenCashSession = {
  id: "s1",
  opened_at: "2026-05-01T09:00:00.000Z",
  opened_by: { user_id: "u1", first_name: "Ada", abilities: ["open_cash_session"] },
  locked: false,
};

const REFUSALS = [
  [
    { kind: "wrong_pin", retryAfterSeconds: 2, attemptsLeft: 5 },
    { kind: "wrong_pin", retry_after_seconds: 2, attempts_left: 5 },
  ],
  [
    { kind: "rate_limited", retryAfterSeconds: 30, attemptsLeft: 4 },
    { kind: "rate_limited", retry_after_seconds: 30, attempts_left: 4 },
  ],
  [
    { kind: "locked", consecutiveFailures: 8 },
    { kind: "locked", consecutive_failures: 8 },
  ],
  [{ kind: "unavailable" }, { kind: "unavailable" }],
] as const;

describe("answering a sign-in", () => {
  it("answers who signed in, with their abilities and the cash session they resume", () => {
    expect(
      signInAnswer({
        kind: "signed_in",
        person: { userId: "u1", firstName: "Ada", abilities: ["open_cash_session"] },
        resumedSession: OPEN_CASH_SESSION,
      }),
    ).toEqual({
      kind: "signed_in",
      person: { user_id: "u1", first_name: "Ada", abilities: ["open_cash_session"] },
      cash_session: OPEN_CASH_SESSION,
    });
  });

  it.each(REFUSALS)("answers the refusal %j in the shape of the contract", (refusal, answer) => {
    expect(signInAnswer(refusal)).toEqual(answer);
  });

  it.each([
    { kind: "no_register_permission" },
    { kind: "cash_session_opened_by_another" },
  ] as const)("answers %j as it is", (outcome) => {
    expect(signInAnswer(outcome)).toEqual(outcome);
  });
});

describe("answering an authorization", () => {
  it("answers who authorized", () => {
    expect(
      authorizationAnswer({ kind: "authorized", by: { userId: "u2", firstName: "Grace" } }),
    ).toEqual({ kind: "authorized", by: { user_id: "u2", first_name: "Grace" } });
  });

  it.each(REFUSALS)("answers the refusal %j in the shape of the contract", (refusal, answer) => {
    expect(authorizationAnswer(refusal)).toEqual(answer);
  });

  it("answers a missing permission as it is", () => {
    expect(authorizationAnswer({ kind: "lacks_permission" })).toEqual({
      kind: "lacks_permission",
    });
  });
});
