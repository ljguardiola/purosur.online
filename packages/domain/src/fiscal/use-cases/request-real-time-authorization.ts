import {
  medianRoundTripMs,
  REAL_TIME_AUTHORIZATION_TIMEOUT_MS,
  type RealTimeAuthorizationAnswer,
  type RealTimeAuthorizationResolution,
  realTimeAuthorizationResolution,
} from "../model/real-time-authorization.js";
import type { RealTimeAuthorizationPorts } from "./real-time-authorization-ports.js";

export interface RequestRealTimeAuthorizationInput {
  fiscalDocumentId: string;
}

export type RequestRealTimeAuthorizationOutcome =
  | { kind: "authorized" }
  | { kind: "rejected" }
  | { kind: "unclear" }
  | { kind: "not_waiting" };

function outcomeOf({
  state,
}: RealTimeAuthorizationResolution): RequestRealTimeAuthorizationOutcome {
  switch (state) {
    case "AUTHORIZED":
      return { kind: "authorized" };
    case "REJECTED":
      return { kind: "rejected" };
    case "UNKNOWN":
      return { kind: "unclear" };
  }
}

export async function requestRealTimeAuthorization(
  { documents, roundTrips, taxAuthority, clock }: RealTimeAuthorizationPorts,
  { fiscalDocumentId }: RequestRealTimeAuthorizationInput,
): Promise<RequestRealTimeAuthorizationOutcome> {
  const waiting = await documents.waitingDocument(fiscalDocumentId);
  if (waiting === null) {
    return { kind: "not_waiting" };
  }

  const roundTripMedianMs = medianRoundTripMs(await roundTrips.recent());
  const answer: RealTimeAuthorizationAnswer =
    roundTripMedianMs === null
      ? { kind: "not_attempted" }
      : await taxAuthority.authorize({
          ...waiting,
          timeoutMs: REAL_TIME_AUTHORIZATION_TIMEOUT_MS,
          roundTripMedianMs,
        });

  const resolution = realTimeAuthorizationResolution(answer);
  await documents.resolve({
    fiscalDocumentId,
    saleId: waiting.saleId,
    resolution,
    resolvedAt: clock.now(),
  });
  return outcomeOf(resolution);
}
