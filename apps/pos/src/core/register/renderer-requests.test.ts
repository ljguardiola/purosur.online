import type { OpenCashSession, OpenCashSessionOutcome, SignInOutcome } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { answerRendererRequest, type RendererRequestDeps } from "./renderer-requests";

function deps(enrolled: boolean, overrides: Partial<RendererRequestDeps> = {}) {
  const enrolledCodes: string[] = [];
  const redemptions: { resetCode: string; newPin: string }[] = [];
  const signIns: { userId: string; pin: string }[] = [];
  const openings: { userId: string; openingFloat: number }[] = [];
  const failures: { context: string; error: unknown }[] = [];
  return {
    enrolledCodes,
    redemptions,
    signIns,
    openings,
    failures,
    deps: {
      credentialsPresent: async () => enrolled,
      registerName: (): string | undefined => undefined,
      enroll: async (code: string) => {
        enrolledCodes.push(code);
        return { kind: "code_rejected" as const };
      },
      redeemPinCode: async (resetCode: string, newPin: string) => {
        redemptions.push({ resetCode, newPin });
        return { kind: "code_expired" as const };
      },
      signInUsers: () => [{ id: "u1", first_name: "Ada" }],
      signIn: async (userId: string, pin: string): Promise<SignInOutcome> => {
        signIns.push({ userId, pin });
        return { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 7 };
      },
      openCashSession: async (
        userId: string,
        openingFloat: number,
      ): Promise<OpenCashSessionOutcome> => {
        openings.push({ userId, openingFloat });
        return { kind: "not_permitted" };
      },
      cashSession: (): OpenCashSession | null => null,
      reportFailure: (context: string, error: unknown) => {
        failures.push({ context, error });
      },
      ...overrides,
    },
  };
}

describe("answerRendererRequest", () => {
  it.each([true, false])(
    "answers whether this installation is enrolled from its stored credentials: %s",
    async (enrolled) => {
      const answer = await answerRendererRequest(deps(enrolled).deps, {
        type: "enrollment-status-request",
        request_id: "r1",
      });

      expect(answer).toEqual({ type: "enrollment-status", request_id: "r1", enrolled });
    },
  );

  it("answers the register's own name as it holds it", async () => {
    const answer = await answerRendererRequest(deps(true, { registerName: () => "Caja 1" }).deps, {
      type: "register-name-request",
      request_id: "r3",
    });

    expect(answer).toEqual({ type: "register-name", request_id: "r3", name: "Caja 1" });
  });

  it("answers no name while the register holds none", async () => {
    const answer = await answerRendererRequest(deps(true).deps, {
      type: "register-name-request",
      request_id: "r4",
    });

    expect(answer).toEqual({ type: "register-name", request_id: "r4", name: null });
  });

  it("enrolls with the code as typed and answers the outcome", async () => {
    const { deps: withEnroll, enrolledCodes } = deps(false);

    const answer = await answerRendererRequest(withEnroll, {
      type: "enroll",
      request_id: "r2",
      code: "p4nx 7kwe",
    });

    expect(enrolledCodes).toEqual(["p4nx 7kwe"]);
    expect(answer).toEqual({
      type: "enrollment-result",
      request_id: "r2",
      outcome: { kind: "code_rejected" },
    });
  });

  it("redeems the PIN code as typed and answers the outcome", async () => {
    const { deps: withRedeem, redemptions } = deps(true);

    const answer = await answerRendererRequest(withRedeem, {
      type: "redeem-pin-code",
      request_id: "r3",
      reset_code: "k7qm 2xpa 3dtr 4hwn",
      new_pin: "482915",
    });

    expect(redemptions).toEqual([{ resetCode: "k7qm 2xpa 3dtr 4hwn", newPin: "482915" }]);
    expect(answer).toEqual({
      type: "pin-code-redemption-result",
      request_id: "r3",
      outcome: { kind: "code_expired" },
    });
  });

  it("answers with the users who can sign in", async () => {
    const answer = await answerRendererRequest(deps(true).deps, {
      type: "sign-in-users",
      request_id: "r3",
    });

    expect(answer).toEqual({
      type: "sign-in-users",
      request_id: "r3",
      users: [{ id: "u1", first_name: "Ada" }],
    });
  });

  it("answers that the users cannot be read when reading them fails, and reports why", async () => {
    const error = new Error("database is locked");
    const failing = deps(true, {
      signInUsers: () => {
        throw error;
      },
    });

    expect(
      await answerRendererRequest(failing.deps, { type: "sign-in-users", request_id: "r4" }),
    ).toEqual({ type: "sign-in-users-unavailable", request_id: "r4" });
    expect(failing.failures).toEqual([{ context: "reading the users who can sign in", error }]);
  });

  it("answers that the users cannot be read when the register has no database", async () => {
    const withoutDatabase = deps(true, { signInUsers: undefined });

    expect(
      await answerRendererRequest(withoutDatabase.deps, {
        type: "sign-in-users",
        request_id: "r5",
      }),
    ).toEqual({ type: "sign-in-users-unavailable", request_id: "r5" });
  });

  it("signs in the chosen user with the PIN as typed and answers the outcome", async () => {
    const { deps: withSignIn, signIns } = deps(true);

    const answer = await answerRendererRequest(withSignIn, {
      type: "sign-in",
      request_id: "r6",
      user_id: "u1",
      pin: "0042",
    });

    expect(signIns).toEqual([{ userId: "u1", pin: "0042" }]);
    expect(answer).toEqual({
      type: "sign-in-result",
      request_id: "r6",
      outcome: { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 7 },
    });
  });

  it("answers that signing in is unavailable when it fails, and reports why", async () => {
    const error = new Error("no memory for argon2");
    const failing = deps(true, {
      signIn: async () => {
        throw error;
      },
    });

    expect(
      await answerRendererRequest(failing.deps, {
        type: "sign-in",
        request_id: "r7",
        user_id: "u1",
        pin: "1",
      }),
    ).toEqual({ type: "sign-in-result", request_id: "r7", outcome: { kind: "unavailable" } });
    expect(failing.failures).toEqual([{ context: "signing in", error }]);
  });

  it("answers that signing in is unavailable when the register has no database", async () => {
    const withoutDatabase = deps(true, { signIn: undefined });

    expect(
      await answerRendererRequest(withoutDatabase.deps, {
        type: "sign-in",
        request_id: "r8",
        user_id: "u1",
        pin: "1",
      }),
    ).toEqual({ type: "sign-in-result", request_id: "r8", outcome: { kind: "unavailable" } });
  });

  it("reports nothing when the users are read and the PIN is checked", async () => {
    const { deps: working, failures } = deps(true);

    await answerRendererRequest(working, { type: "sign-in-users", request_id: "r9" });
    await answerRendererRequest(working, {
      type: "sign-in",
      request_id: "r10",
      user_id: "u1",
      pin: "0042",
    });

    expect(failures).toEqual([]);
  });

  it("opens a cash session for the chosen user with the float as sent and answers the outcome", async () => {
    const opened: OpenCashSessionOutcome = {
      kind: "opened",
      session: { id: "s1", opened_at: "2026-09-30T12:00:00.000Z", opening_float: 5000 },
    };
    const { deps: withOpening, openings } = deps(true, { openCashSession: async () => opened });
    const answer = await answerRendererRequest(withOpening, {
      type: "open-cash-session",
      request_id: "r11",
      user_id: "u1",
      opening_float: 5000,
    });
    const refused = deps(true);
    await answerRendererRequest(refused.deps, {
      type: "open-cash-session",
      request_id: "r12",
      user_id: "u2",
      opening_float: 0,
    });

    expect(answer).toEqual({
      type: "open-cash-session-result",
      request_id: "r11",
      outcome: opened,
    });
    expect(openings).toEqual([]);
    expect(refused.openings).toEqual([{ userId: "u2", openingFloat: 0 }]);
  });

  it("answers that opening a cash session is unavailable when it fails, and reports why", async () => {
    const error = new Error("disk full");
    const failing = deps(true, {
      openCashSession: async () => {
        throw error;
      },
    });

    expect(
      await answerRendererRequest(failing.deps, {
        type: "open-cash-session",
        request_id: "r13",
        user_id: "u1",
        opening_float: 1,
      }),
    ).toEqual({
      type: "open-cash-session-result",
      request_id: "r13",
      outcome: { kind: "unavailable" },
    });
    expect(failing.failures).toEqual([{ context: "opening a cash session", error }]);
  });

  it("answers that opening a cash session is unavailable when the register has no database", async () => {
    const withoutDatabase = deps(true, { openCashSession: undefined });

    expect(
      await answerRendererRequest(withoutDatabase.deps, {
        type: "open-cash-session",
        request_id: "r14",
        user_id: "u1",
        opening_float: 1,
      }),
    ).toEqual({
      type: "open-cash-session-result",
      request_id: "r14",
      outcome: { kind: "unavailable" },
    });
  });

  it("answers the open cash session with who opened it", async () => {
    const session: OpenCashSession = {
      id: "s1",
      opened_at: "2026-09-30T12:00:00.000Z",
      opened_by: { user_id: "u1", first_name: "Ada", permission_keys: ["sell_and_charge"] },
    };

    expect(
      await answerRendererRequest(deps(true, { cashSession: () => session }).deps, {
        type: "cash-session-request",
        request_id: "r15",
      }),
    ).toEqual({ type: "cash-session", request_id: "r15", session });
  });

  it("answers no cash session while none is open or the register has no database", async () => {
    const answers = await Promise.all(
      [deps(true).deps, deps(true, { cashSession: undefined }).deps].map((withoutSession) =>
        answerRendererRequest(withoutSession, { type: "cash-session-request", request_id: "r16" }),
      ),
    );

    expect(answers).toEqual([
      { type: "cash-session", request_id: "r16", session: null },
      { type: "cash-session", request_id: "r16", session: null },
    ]);
  });

  it("answers no cash session when it cannot be read, and reports why", async () => {
    const error = new Error("database is locked");
    const failing = deps(true, {
      cashSession: () => {
        throw error;
      },
    });

    expect(
      await answerRendererRequest(failing.deps, {
        type: "cash-session-request",
        request_id: "r17",
      }),
    ).toEqual({ type: "cash-session", request_id: "r17", session: null });
    expect(failing.failures).toEqual([{ context: "reading the open cash session", error }]);
  });

  it("answers nothing to a ping", async () => {
    expect(await answerRendererRequest(deps(true).deps, { type: "ping" })).toBeUndefined();
  });
});
