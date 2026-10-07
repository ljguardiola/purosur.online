import {
  installationRequestRetryAfterSeconds,
  installationRequestWindowStart,
  type LimitedEndpoint,
} from "../model/installation-request-limit.js";
import type { AdmissionPorts } from "./sync-ports.js";

export interface AdmitInstallationRequestInput {
  deviceId: string;
  endpoint: LimitedEndpoint;
}

export type AdmitInstallationRequestOutcome =
  | { kind: "admitted" }
  | { kind: "rate_limited"; retryAfterSeconds: number };

export async function admitInstallationRequest(
  { admission, clock }: AdmissionPorts,
  { deviceId, endpoint }: AdmitInstallationRequestInput,
): Promise<AdmitInstallationRequestOutcome> {
  return admission.transaction<AdmitInstallationRequestOutcome>(async (tx) => {
    const now = clock.now();
    await tx.lockRequestAttempts(deviceId, endpoint);

    const windowStart = installationRequestWindowStart(now);
    const retryAfterSeconds = installationRequestRetryAfterSeconds(
      endpoint,
      await tx.admittedRequests(deviceId, endpoint, windowStart),
      now,
    );
    if (retryAfterSeconds !== undefined) {
      return { kind: "rate_limited", retryAfterSeconds };
    }
    await tx.recordAdmittedRequest(deviceId, endpoint, now);
    await tx.forgetRequestsThrough(deviceId, endpoint, windowStart);
    return { kind: "admitted" };
  });
}
