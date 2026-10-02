import type { DeviceCredentials } from "@purosur/contracts";
import {
  type CloudError,
  retryAfterSecondsOf,
  type SignInLookupOutcome,
  signInLookupBodySchema,
  signInLookupSchema,
} from "@purosur/contracts";
import type { CloudResponse } from "../platform/cloud-client";

import type { SignInStore } from "./sqlite-sign-in-store";

export interface SignInLookupDeps {
  readCredentials: () => Promise<DeviceCredentials | undefined>;
  postToCloud:
    | ((path: string, bearerToken: string, body: unknown) => Promise<CloudResponse>)
    | undefined;
  store: Pick<SignInStore, "firstNameOf" | "pinHolder">;
}

function refusalOutcome(error: CloudError): SignInLookupOutcome {
  switch (error.code) {
    case "rate_limited":
      return { kind: "rate_limited", retry_after_seconds: retryAfterSecondsOf(error) ?? 0 };
    case "validation_failed":
      return { kind: "invalid_email" };
    default:
      return { kind: "unavailable" };
  }
}

export async function lookUpSignIn(
  deps: SignInLookupDeps,
  typedEmail: string,
): Promise<SignInLookupOutcome> {
  const request = signInLookupBodySchema.safeParse({ email: typedEmail });
  if (!request.success) {
    return { kind: "invalid_email" };
  }
  const credentials = await deps.readCredentials();
  if (deps.postToCloud === undefined || credentials === undefined) {
    return { kind: "unavailable" };
  }

  const response = await deps.postToCloud(
    "/api/sign-in-lookups",
    credentials.device_token,
    request.data,
  );
  if (response.kind === "unreachable") {
    return { kind: "unreachable" };
  }
  if (response.kind === "error") {
    return refusalOutcome(response.error);
  }
  const lookup = signInLookupSchema.safeParse(response.body);
  if (!lookup.success) {
    return { kind: "unavailable" };
  }
  if (lookup.data.kind === "not_found") {
    return { kind: "not_found" };
  }

  const firstName = deps.store.firstNameOf(lookup.data.user_id);
  if (
    firstName === undefined ||
    (lookup.data.has_pin && deps.store.pinHolder(lookup.data.user_id) === undefined)
  ) {
    return { kind: "not_synced" };
  }
  return {
    kind: lookup.data.has_pin ? "has_pin" : "no_pin",
    user: { id: lookup.data.user_id, first_name: firstName },
  };
}
