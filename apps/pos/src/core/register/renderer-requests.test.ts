import { describe, expect, it } from "vitest";
import { answerRendererRequest } from "./renderer-requests";

function deps(enrolled: boolean) {
  const enrolledCodes: string[] = [];
  return {
    enrolledCodes,
    deps: {
      credentialsPresent: async () => enrolled,
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
