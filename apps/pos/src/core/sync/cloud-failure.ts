import { type CloudErrorCode, retryAfterSecondsOf } from "@purosur/contracts";
import type { CloudResponse } from "../platform/cloud-client";

export type CloudFailure =
  | { kind: "unreachable" }
  | { kind: "refused"; code: CloudErrorCode; retryAfterSeconds?: number }
  | { kind: "unreadable" };

export function failureOf(response: Exclude<CloudResponse, { kind: "ok" }>): CloudFailure {
  if (response.kind === "unreachable") {
    return { kind: "unreachable" };
  }
  const retryAfterSeconds = retryAfterSecondsOf(response.error);
  return {
    kind: "refused",
    code: response.error.code,
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  };
}

export function retryAfterMsOf(failure: CloudFailure): number | undefined {
  return failure.kind === "refused" && failure.retryAfterSeconds !== undefined
    ? failure.retryAfterSeconds * 1000
    : undefined;
}
