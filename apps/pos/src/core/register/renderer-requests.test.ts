import type { SignInOutcome } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { answerRendererRequest, type RendererRequestDeps } from "./renderer-requests";

function deps(enrolled: boolean, overrides: Partial<RendererRequestDeps> = {}) {
  const enrolledCodes: string[] = [];
  const signIns: { userId: string; pin: string }[] = [];
  const failures: { context: string; error: unknown }[] = [];
  return {
    enrolledCodes,
    signIns,
    failures,
    deps: {
      credentialsPresent: async () => enrolled,
      registerName: (): string | undefined => undefined,
      enroll: async (code: string) => {
        enrolledCodes.push(code);
        return { kind: "code_rejected" as const };
      },
      signInUsers: () => [{ id: "u1", first_name: "Ada" }],
      signIn: async (userId: string, pin: string): Promise<SignInOutcome> => {
        signIns.push({ userId, pin });
        return { kind: "wrong_pin" };
      },
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
      outcome: { kind: "wrong_pin" },
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

  it("answers nothing to a ping", async () => {
    expect(await answerRendererRequest(deps(true).deps, { type: "ping" })).toBeUndefined();
  });
});
