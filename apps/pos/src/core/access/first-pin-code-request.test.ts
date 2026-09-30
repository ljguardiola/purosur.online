import { describe, expect, it } from "vitest";
import type { DeviceCredentials } from "../../shared/device-credentials-messages";
import type { CloudResponse } from "../platform/cloud-client";
import { type FirstPinCodeRequestDeps, requestFirstPinCode } from "./first-pin-code-request";

const USER_ID = "1e7b3a90-52c4-4d18-9f6a-8b0c2d4e6f71";
const CREDENTIALS: DeviceCredentials = {
  device_id: "a4b1",
  device_token: "prefix.secret",
  pepper: "pepper-1",
};

function envelope(code: string, details: unknown[] = []): CloudResponse {
  return { kind: "error", error: { code, message: "x", details } } as CloudResponse;
}

function depsAnswering(response: CloudResponse, { enrolled = true } = {}) {
  const posted: { path: string; bearerToken: string; body: unknown }[] = [];
  const deps: FirstPinCodeRequestDeps = {
    readCredentials: async () => (enrolled ? CREDENTIALS : undefined),
    postToCloud: async (path, bearerToken, body) => {
      posted.push({ path, bearerToken, body });
      return response;
    },
  };
  return { deps, posted };
}

const SENT: CloudResponse = { kind: "ok", body: { expires_at: "2026-09-25T12:15:00.000Z" } };

describe("requestFirstPinCode", () => {
  it("asks the cloud for a code for the person with the device token", async () => {
    const { deps, posted } = depsAnswering(SENT);

    await requestFirstPinCode(deps, USER_ID);

    expect(posted).toEqual([
      {
        path: "/api/first-pin-codes",
        bearerToken: "prefix.secret",
        body: { user_id: USER_ID },
      },
    ]);
  });

  it("answers sent once the cloud has emailed the code", async () => {
    const { deps } = depsAnswering(SENT);

    expect(await requestFirstPinCode(deps, USER_ID)).toEqual({ kind: "sent" });
  });

  it.each([
    ["not_found", envelope("not_found"), { kind: "not_found" }],
    ["pin_already_set", envelope("pin_already_set"), { kind: "pin_already_set" }],
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
    ["validation_failed", envelope("validation_failed"), { kind: "unavailable" }],
    ["device_token_rejected", envelope("device_token_rejected"), { kind: "unavailable" }],
    ["server_unavailable", envelope("server_unavailable"), { kind: "unavailable" }],
    ["an unreachable cloud", { kind: "unreachable" }, { kind: "unreachable" }],
  ] as const)("answers %s with its outcome", async (_name, response, outcome) => {
    const { deps } = depsAnswering(response as CloudResponse);

    expect(await requestFirstPinCode(deps, USER_ID)).toEqual(outcome);
  });

  it.each([
    ["an answer that is not the code's shape", { expires_at: "tomorrow" }],
    ["an answer with no body", undefined],
  ])("is unavailable on %s", async (_name, body) => {
    const { deps } = depsAnswering({ kind: "ok", body });

    expect(await requestFirstPinCode(deps, USER_ID)).toEqual({ kind: "unavailable" });
  });

  it("answers unavailable without asking the cloud for an id that is not one", async () => {
    const { deps, posted } = depsAnswering(SENT);

    expect(await requestFirstPinCode(deps, "ada")).toEqual({ kind: "unavailable" });
    expect(posted).toEqual([]);
  });

  it("answers unavailable without asking the cloud when no cloud is configured", async () => {
    const { deps } = depsAnswering(SENT);

    expect(await requestFirstPinCode({ ...deps, postToCloud: undefined }, USER_ID)).toEqual({
      kind: "unavailable",
    });
  });

  it("answers unavailable without asking the cloud when there is no credential", async () => {
    const { deps, posted } = depsAnswering(SENT, { enrolled: false });

    expect(await requestFirstPinCode(deps, USER_ID)).toEqual({ kind: "unavailable" });
    expect(posted).toEqual([]);
  });
});
