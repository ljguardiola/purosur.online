import {
  medianRoundTripMs,
  REAL_TIME_AUTHORIZATION_TIMEOUT_MS,
  type RealTimeAuthorizationAnswer,
  type RealTimeAuthorizationResolution,
  realTimeAuthorizationResolution,
} from "../model/real-time-authorization.js";
import type { RealTimeAuthorizationPorts } from "./real-time-authorization-ports.js";
import { recordDeferredSaleAsync } from "./record-deferred-sale.js";

export interface RequestRealTimeAuthorizationInput {
  saleId: string;
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
  { documents, roundTrips, taxAuthority, clock, ids, shortCodes }: RealTimeAuthorizationPorts,
  { saleId }: RequestRealTimeAuthorizationInput,
): Promise<RequestRealTimeAuthorizationOutcome> {
  const waiting = await documents.waitingDocumentOfSale(saleId);
  if (waiting === null) {
    return { kind: "not_waiting" };
  }

  const roundTripMedianMs = medianRoundTripMs(await roundTrips.recent());
  const { saleEvent, reservedAt, ...waitingDocument } = waiting;
  const answer: RealTimeAuthorizationAnswer =
    roundTripMedianMs === null || saleEvent === null
      ? { kind: "not_attempted" }
      : await taxAuthority.authorize({
          ...waitingDocument,
          saleEvent,
          timeoutMs: REAL_TIME_AUTHORIZATION_TIMEOUT_MS,
          roundTripMedianMs,
        });

  const resolution = realTimeAuthorizationResolution(answer);
  const resolved = {
    fiscalDocumentId: waiting.fiscalDocumentId,
    saleId: waiting.saleId,
    resolution,
    resolvedAt: clock.now(),
  };
  if (resolution.state === "AUTHORIZED") {
    await documents.resolve({ ...resolved, deferredSale: null });
  } else {
    await recordDeferredSaleAsync(
      (deferredSale) => documents.resolve({ ...resolved, deferredSale }),
      ids,
      shortCodes,
      {
        saleId: waiting.saleId,
        occurredAt: reservedAt,
        total: waiting.document.total,
        reason: resolution.deferralReason,
        routedAt: resolved.resolvedAt,
      },
    );
  }
  return outcomeOf(resolution);
}
