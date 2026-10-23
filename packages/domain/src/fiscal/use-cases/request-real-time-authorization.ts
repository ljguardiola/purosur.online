import { deferredSaleSatisfiedEvent } from "../model/deferred-sale-satisfied-event.js";
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
  const { saleEvent, reservedAt, origin, ...waitingDocument } = waiting;
  const answer: RealTimeAuthorizationAnswer =
    roundTripMedianMs === null
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
  const existing = await documents.deferredSaleOfSale(waiting.saleId);
  if (resolution.state === "AUTHORIZED") {
    await documents.resolve({
      ...resolved,
      deferredSale: null,
      deferredSaleSatisfied:
        existing === null
          ? null
          : deferredSaleSatisfiedEvent({
              eventId: ids.next(),
              ...origin,
              deferredSaleId: existing.id,
              saleId: waiting.saleId,
              fiscalDocumentId: waiting.fiscalDocumentId,
              pointOfSale: waiting.pointOfSale,
              number: waiting.number,
              issuedOn: waiting.issuedOn,
              document: waiting.document,
              authorizationCode: resolution.authorizationCode,
              authorizationCodeDueOn: resolution.authorizationCodeDueOn,
              reservedAt,
              satisfiedAt: resolved.resolvedAt,
            }),
    });
  } else if (existing === null) {
    await recordDeferredSaleAsync(
      (deferredSale) =>
        documents.resolve({ ...resolved, deferredSale, deferredSaleSatisfied: null }),
      ids,
      shortCodes,
      {
        saleId: waiting.saleId,
        occurredAt: reservedAt,
        total: waiting.document.total,
        reason: resolution.deferralReason,
        routedAt: resolved.resolvedAt,
        origin,
        unclearDocument:
          resolution.deferralReason === "unclear_outcome"
            ? {
                fiscalDocumentId: waiting.fiscalDocumentId,
                pointOfSale: waiting.pointOfSale,
                number: waiting.number,
                issuedOn: waiting.issuedOn,
                document: waiting.document,
                reservedAt,
              }
            : null,
      },
    );
  } else {
    await documents.resolve({ ...resolved, deferredSale: null, deferredSaleSatisfied: null });
  }
  return outcomeOf(resolution);
}
