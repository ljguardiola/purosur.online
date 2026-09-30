import { describe, expect, it } from "vitest";
import { answerRendererRequest } from "./renderer-requests";

function deps(enrolled: boolean) {
  const enrolledCodes: string[] = [];
  const redemptions: { resetCode: string; newPin: string }[] = [];
  return {
    enrolledCodes,
    redemptions,
    deps: {
      credentialsPresent: async () => enrolled,
      enroll: async (code: string) => {
        enrolledCodes.push(code);
        return { kind: "code_rejected" as const };
      },
      redeemPinCode: async (resetCode: string, newPin: string) => {
        redemptions.push({ resetCode, newPin });
        return { kind: "code_expired" as const };
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

  it("answers nothing to a ping", async () => {
    expect(await answerRendererRequest(deps(true).deps, { type: "ping" })).toBeUndefined();
  });
});
