import {
  type CloudError,
  type FirstPinCodeRequestOutcome,
  firstPinCodeBodySchema,
  firstPinCodeSchema,
  retryAfterSecondsOf,
} from "@purosur/contracts";
import type { DeviceCredentials } from "../../shared/device-credentials-messages";
import type { CloudResponse } from "../platform/cloud-client";

export interface FirstPinCodeRequestDeps {
  readCredentials: () => Promise<DeviceCredentials | undefined>;
  postToCloud:
    | ((path: string, bearerToken: string, body: unknown) => Promise<CloudResponse>)
    | undefined;
}

function refusalOutcome(error: CloudError): FirstPinCodeRequestOutcome {
  switch (error.code) {
    case "not_found":
      return { kind: "not_found" };
    case "pin_already_set":
      return { kind: "pin_already_set" };
    case "rate_limited":
      return { kind: "rate_limited", retry_after_seconds: retryAfterSecondsOf(error) ?? 0 };
    default:
      return { kind: "unavailable" };
  }
}

export async function requestFirstPinCode(
  deps: FirstPinCodeRequestDeps,
  userId: string,
): Promise<FirstPinCodeRequestOutcome> {
  const request = firstPinCodeBodySchema.safeParse({ user_id: userId });
  if (!request.success) {
    return { kind: "unavailable" };
  }
  const credentials = await deps.readCredentials();
  if (deps.postToCloud === undefined || credentials === undefined) {
    return { kind: "unavailable" };
  }

  const response = await deps.postToCloud(
    "/api/first-pin-codes",
    credentials.device_token,
    request.data,
  );
  if (response.kind === "unreachable") {
    return { kind: "unreachable" };
  }
  if (response.kind === "error") {
    return refusalOutcome(response.error);
  }
  return firstPinCodeSchema.safeParse(response.body).success
    ? { kind: "sent" }
    : { kind: "unavailable" };
}
