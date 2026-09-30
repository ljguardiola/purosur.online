import { encodePinHash } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import type { DeviceCredentials } from "../../shared/device-credentials-messages";
import type { CloudResponse } from "../platform/cloud-client";
import { lookUpSignIn, type SignInLookupDeps } from "./sign-in-lookup";
import type { SignInRecord } from "./sqlite-sign-in-store";

const USER_ID = "1e7b3a90-52c4-4d18-9f6a-8b0c2d4e6f71";
const CREDENTIALS: DeviceCredentials = {
  device_id: "a4b1",
  device_token: "prefix.secret",
  pepper: "pepper-1",
};

function envelope(code: string, details: unknown[] = []): CloudResponse {
  return { kind: "error", error: { code, message: "x", details } } as CloudResponse;
}

function found(hasPin: boolean): CloudResponse {
  return { kind: "ok", body: { kind: "found", user_id: USER_ID, has_pin: hasPin } };
}

const SIGN_IN_RECORD: SignInRecord = {
  firstName: "Ada",
  salt: encodePinHash(new Uint8Array(16).fill(1)),
  verifier: "verifier",
  access: { isAdministrator: false, permissionKeys: ["sell_and_charge"] },
};

function depsAnswering(
  response: CloudResponse,
  {
    enrolled = true,
    firstName = "Ada" as string | null,
    signInRecord = SIGN_IN_RECORD as SignInRecord | null,
  } = {},
) {
  const posted: { path: string; bearerToken: string; body: unknown }[] = [];
  const deps: SignInLookupDeps = {
    readCredentials: async () => (enrolled ? CREDENTIALS : undefined),
    postToCloud: async (path, bearerToken, body) => {
      posted.push({ path, bearerToken, body });
      return response;
    },
    store: {
      firstNameOf: (userId) => (userId === USER_ID ? (firstName ?? undefined) : undefined),
      signInRecord: (userId) => (userId === USER_ID ? (signInRecord ?? undefined) : undefined),
    },
  };
  return { deps, posted };
}

describe("lookUpSignIn", () => {
  it("posts the normalized email with the device token", async () => {
    const { deps, posted } = depsAnswering(found(true));

    await lookUpSignIn(deps, "  Ada@Example.com ");

    expect(posted).toEqual([
      {
        path: "/api/sign-in-lookups",
        bearerToken: "prefix.secret",
        body: { email: "ada@example.com" },
      },
    ]);
  });

  it("answers has_pin with the person's id and the first name the register holds", async () => {
    const { deps } = depsAnswering(found(true));

    expect(await lookUpSignIn(deps, "ada@example.com")).toEqual({
      kind: "has_pin",
      user: { id: USER_ID, first_name: "Ada" },
    });
  });

  it("answers no_pin with the person's id and the first name the register holds", async () => {
    const { deps } = depsAnswering(found(false));

    expect(await lookUpSignIn(deps, "ada@example.com")).toEqual({
      kind: "no_pin",
      user: { id: USER_ID, first_name: "Ada" },
    });
  });

  it.each([true, false])(
    "answers not_synced when the register has not pulled the person found (has a PIN: %s)",
    async (hasPin) => {
      const { deps } = depsAnswering(found(hasPin), { firstName: null, signInRecord: null });

      expect(await lookUpSignIn(deps, "ada@example.com")).toEqual({ kind: "not_synced" });
    },
  );

  it("answers not_synced when the cloud has a PIN the register has not pulled yet", async () => {
    const { deps } = depsAnswering(found(true), { signInRecord: null });

    expect(await lookUpSignIn(deps, "ada@example.com")).toEqual({ kind: "not_synced" });
  });

  it("answers not_synced when the register holds a PIN it cannot check yet", async () => {
    const { deps } = depsAnswering(found(true), {
      signInRecord: { ...SIGN_IN_RECORD, salt: "not-a-salt" },
    });

    expect(await lookUpSignIn(deps, "ada@example.com")).toEqual({ kind: "not_synced" });
  });

  it("answers no_pin for a person the register holds with no PIN yet", async () => {
    const { deps } = depsAnswering(found(false), { signInRecord: null });

    expect(await lookUpSignIn(deps, "ada@example.com")).toEqual({
      kind: "no_pin",
      user: { id: USER_ID, first_name: "Ada" },
    });
  });

  it("answers not_found when the cloud knows nobody with that email", async () => {
    const { deps } = depsAnswering({ kind: "ok", body: { kind: "not_found" } });

    expect(await lookUpSignIn(deps, "ada@example.com")).toEqual({ kind: "not_found" });
  });

  it.each([
    ["an answer that is not the lookup's shape", { kind: "found", user_id: "nope" }],
    ["an answer with no body", undefined],
  ])("is unavailable on %s", async (_name, body) => {
    const { deps } = depsAnswering({ kind: "ok", body });

    expect(await lookUpSignIn(deps, "ada@example.com")).toEqual({ kind: "unavailable" });
  });

  it.each([
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
    ["validation_failed", envelope("validation_failed"), { kind: "invalid_email" }],
    ["device_token_rejected", envelope("device_token_rejected"), { kind: "unavailable" }],
    ["server_unavailable", envelope("server_unavailable"), { kind: "unavailable" }],
    ["an unreachable cloud", { kind: "unreachable" }, { kind: "unreachable" }],
  ] as const)("answers %s with its outcome", async (_name, response, outcome) => {
    const { deps } = depsAnswering(response as CloudResponse);

    expect(await lookUpSignIn(deps, "ada@example.com")).toEqual(outcome);
  });

  it.each(["", "ada", "ada@", "@example.com", "a b@example.com"])(
    "answers invalid_email without asking the cloud for %j",
    async (typed) => {
      const { deps, posted } = depsAnswering(found(true));

      expect(await lookUpSignIn(deps, typed)).toEqual({ kind: "invalid_email" });
      expect(posted).toEqual([]);
    },
  );

  it("answers unavailable without asking the cloud when no cloud is configured", async () => {
    const { deps } = depsAnswering(found(true));

    expect(await lookUpSignIn({ ...deps, postToCloud: undefined }, "ada@example.com")).toEqual({
      kind: "unavailable",
    });
  });

  it("answers unavailable without asking the cloud when there is no credential", async () => {
    const { deps, posted } = depsAnswering(found(true), { enrolled: false });

    expect(await lookUpSignIn(deps, "ada@example.com")).toEqual({ kind: "unavailable" });
    expect(posted).toEqual([]);
  });
});
