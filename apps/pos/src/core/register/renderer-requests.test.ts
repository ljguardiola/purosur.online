import { describe, expect, it } from "vitest";
import { answerRendererRequest } from "./renderer-requests";

function deps(enrolled: boolean, registerName: string | undefined = undefined) {
  const enrolledCodes: string[] = [];
  return {
    enrolledCodes,
    deps: {
      credentialsPresent: async () => enrolled,
      registerName: () => registerName,
      enroll: async (code: string) => {
        enrolledCodes.push(code);
        return { kind: "code_rejected" as const };
      },
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
    const answer = await answerRendererRequest(deps(true, "Caja 1").deps, {
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

  it("answers nothing to a ping", async () => {
    expect(await answerRendererRequest(deps(true).deps, { type: "ping" })).toBeUndefined();
  });
});
