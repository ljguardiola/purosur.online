import type { PinCodeRedemption } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import type { DeviceCredentials } from "../../shared/device-credentials-messages";
import type { CloudResponse } from "../platform/cloud-client";
import { type PinCodeRedemptionDeps, redeemPinCode } from "./pin-code-redemption";

const USER_ID = "1e7b3a90-52c4-4d18-9f6a-8b0c2d4e6f71";
const CREDENTIALS: DeviceCredentials = {
  device_id: "a4b1",
  device_token: "prefix.secret",
  pepper: "pepper-1",
};
const REDEEMED_BODY = { user_id: USER_ID, salt: "c2FsdA", pin_hash: "aGFzaA" };
const TYPED_CODE = "k7qm 2xpa 3dtr 4hwn";

function envelope(code: string, details: unknown[] = []): CloudResponse {
  return { kind: "error", error: { code, message: "x", details } } as CloudResponse;
}

const OPENER_PERSON = { user_id: USER_ID, first_name: "Ada", permission_keys: ["sell_and_charge"] };
const OPEN_CASH_SESSION = {
  id: "s1",
  opened_at: "2026-05-01T09:00:00.000Z",
  opened_by: OPENER_PERSON,
  locked: false,
};

function depsAnswering(
  response: CloudResponse,
  {
    enrolled = true,
    canApply = true,
    opener,
  }: { enrolled?: boolean; canApply?: boolean; opener?: string } = {},
) {
  const signedIn: string[] = [];
  const cashSessionReads: string[][] = [];
  const posted: { path: string; bearerToken: string; body: unknown }[] = [];
  const applied: { pepper: string; redemption: PinCodeRedemption }[] = [];
  const reported: unknown[] = [];
  const deps: PinCodeRedemptionDeps = {
    readCredentials: async () => (enrolled ? CREDENTIALS : undefined),
    postToCloud: async (path, bearerToken, body) => {
      posted.push({ path, bearerToken, body });
      return response;
    },
    applyRedeemedPin: canApply
      ? (pepper, redemption) => {
          applied.push({ pepper, redemption });
        }
      : undefined,
    reportLocalFailure: (error) => {
      reported.push(error);
    },
    openCashSession: () => (opener === undefined ? undefined : { openedBy: opener }),
    signInRedeemed: (userId) => {
      signedIn.push(userId);
      return OPENER_PERSON;
    },
    cashSession: () => {
      cashSessionReads.push([...signedIn]);
      return OPEN_CASH_SESSION;
    },
  };
  return { deps, posted, applied, reported, signedIn, cashSessionReads };
}

describe("redeemPinCode", () => {
  it("posts the normalized code and the new PIN with the device token", async () => {
    const { deps, posted } = depsAnswering({ kind: "ok", body: REDEEMED_BODY });

    await redeemPinCode(deps, TYPED_CODE, "482915");

    expect(posted).toEqual([
      {
        path: "/api/pin-code-redemptions",
        bearerToken: "prefix.secret",
        body: { reset_code: "K7QM2XPA3DTR4HWN", new_pin: "482915" },
      },
    ]);
  });

  it("applies what the cloud answers with the register's pepper and is redeemed", async () => {
    const { deps, applied } = depsAnswering({ kind: "ok", body: REDEEMED_BODY });

    expect(await redeemPinCode(deps, TYPED_CODE, "482915")).toEqual({ kind: "redeemed" });
    expect(applied).toEqual([{ pepper: "pepper-1", redemption: REDEEMED_BODY }]);
  });

  it("resumes the session by signing in the opener who redeemed the code", async () => {
    const { deps, applied, signedIn } = depsAnswering(
      { kind: "ok", body: REDEEMED_BODY },
      { opener: USER_ID },
    );

    expect(await redeemPinCode(deps, TYPED_CODE, "482915")).toEqual({
      kind: "resumed",
      person: OPENER_PERSON,
      cash_session: OPEN_CASH_SESSION,
    });
    expect(applied).toHaveLength(1);
    expect(signedIn).toEqual([USER_ID]);
  });

  it("answers the open cash session as it stands once the opener is signed in", async () => {
    const { deps, cashSessionReads } = depsAnswering(
      { kind: "ok", body: REDEEMED_BODY },
      { opener: USER_ID },
    );

    await redeemPinCode(deps, TYPED_CODE, "482915");

    expect(cashSessionReads).toEqual([[USER_ID]]);
  });

  it("refuses a code redeemed for anyone but the opener while a session is open, signing nobody in", async () => {
    const { deps, signedIn } = depsAnswering(
      { kind: "ok", body: REDEEMED_BODY },
      { opener: "another-user" },
    );

    expect(await redeemPinCode(deps, TYPED_CODE, "482915")).toEqual({
      kind: "cash_session_opened_by_another",
    });
    expect(signedIn).toEqual([]);
  });

  it("is only redeemed when the opener cannot be signed in", async () => {
    const { deps } = depsAnswering({ kind: "ok", body: REDEEMED_BODY }, { opener: USER_ID });
    deps.signInRedeemed = () => undefined;

    expect(await redeemPinCode(deps, TYPED_CODE, "482915")).toEqual({ kind: "redeemed" });
  });

  it("signs nobody in when no session is open", async () => {
    const { deps, signedIn } = depsAnswering({ kind: "ok", body: REDEEMED_BODY });

    expect(await redeemPinCode(deps, TYPED_CODE, "482915")).toEqual({ kind: "redeemed" });
    expect(signedIn).toEqual([]);
  });

  it("is redeemed and reports the failure when the register cannot keep the new PIN", async () => {
    const failure = new Error("disk full");
    const { deps, reported } = depsAnswering({ kind: "ok", body: REDEEMED_BODY });
    deps.applyRedeemedPin = () => {
      throw failure;
    };

    expect(await redeemPinCode(deps, TYPED_CODE, "482915")).toEqual({ kind: "redeemed" });
    expect(reported).toEqual([failure]);
  });

  it("reports nothing when the register keeps the new PIN", async () => {
    const { deps, reported } = depsAnswering({ kind: "ok", body: REDEEMED_BODY });

    await redeemPinCode(deps, TYPED_CODE, "482915");

    expect(reported).toEqual([]);
  });

  it.each([
    ["an answer that is not the redemption's shape", { user_id: "nope" }],
    ["an answer with no body", undefined],
  ])("applies nothing and is unavailable on %s", async (_name, body) => {
    const { deps, applied } = depsAnswering({ kind: "ok", body });

    expect(await redeemPinCode(deps, TYPED_CODE, "482915")).toEqual({ kind: "unavailable" });
    expect(applied).toEqual([]);
  });

  it.each([
    ["reset_code_invalid", envelope("reset_code_invalid"), { kind: "code_invalid" }],
    ["reset_code_expired", envelope("reset_code_expired"), { kind: "code_expired" }],
    ["reset_code_burned", envelope("reset_code_burned"), { kind: "code_burned" }],
    [
      "validation_failed on the new PIN",
      envelope("validation_failed", [{ field: "new_pin" }]),
      { kind: "pin_rejected" },
    ],
    [
      "validation_failed on the code",
      envelope("validation_failed", [{ field: "reset_code" }]),
      { kind: "code_invalid" },
    ],
    ["validation_failed on nothing known", envelope("validation_failed"), { kind: "unavailable" }],
    [
      "rate_limited",
      envelope("rate_limited", [{ retry_after_seconds: 1800 }]),
      { kind: "rate_limited", retry_after_seconds: 1800 },
    ],
    [
      "rate_limited with no wait",
      envelope("rate_limited"),
      { kind: "rate_limited", retry_after_seconds: 0 },
    ],
    ["device_token_rejected", envelope("device_token_rejected"), { kind: "unavailable" }],
    ["server_unavailable", envelope("server_unavailable"), { kind: "unavailable" }],
    ["an unreachable cloud", { kind: "unreachable" }, { kind: "unreachable" }],
  ] as const)(
    "answers %s with its outcome and applies nothing",
    async (_name, response, outcome) => {
      const { deps, applied } = depsAnswering(response as CloudResponse);

      expect(await redeemPinCode(deps, TYPED_CODE, "482915")).toEqual(outcome);
      expect(applied).toEqual([]);
    },
  );

  it("answers code_invalid without asking the cloud when the code is malformed", async () => {
    const { deps, posted } = depsAnswering({ kind: "ok", body: REDEEMED_BODY });

    expect(await redeemPinCode(deps, "too short", "482915")).toEqual({ kind: "code_invalid" });
    expect(posted).toEqual([]);
  });

  it("answers unavailable without asking the cloud when no cloud is configured", async () => {
    const { deps, applied } = depsAnswering({ kind: "ok", body: REDEEMED_BODY });

    expect(await redeemPinCode({ ...deps, postToCloud: undefined }, TYPED_CODE, "482915")).toEqual({
      kind: "unavailable",
    });
    expect(applied).toEqual([]);
  });

  it("answers unavailable without asking the cloud when there is no credential", async () => {
    const { deps, posted } = depsAnswering(
      { kind: "ok", body: REDEEMED_BODY },
      { enrolled: false },
    );

    expect(await redeemPinCode(deps, TYPED_CODE, "482915")).toEqual({ kind: "unavailable" });
    expect(posted).toEqual([]);
  });

  it("answers unavailable without asking the cloud when there is no local database to keep the PIN in", async () => {
    const { deps, posted } = depsAnswering(
      { kind: "ok", body: REDEEMED_BODY },
      { canApply: false },
    );

    expect(await redeemPinCode(deps, TYPED_CODE, "482915")).toEqual({ kind: "unavailable" });
    expect(posted).toEqual([]);
  });
});
