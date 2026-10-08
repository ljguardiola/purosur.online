import type { PreEmissionGateOutcome } from "../model/pre-emission-gate.js";
import type { DeferralReason } from "../model/real-time-authorization.js";
import { decideRealTimeAuthorization, invoiceDateOf } from "../model/real-time-authorization.js";
import type { IdGenerator, SaleAuthorizationTransaction } from "./sale-authorization-ports.js";

export interface DecideSaleAuthorizationInput {
  saleId: string;
  gate: PreEmissionGateOutcome;
  decidedAt: Date;
}

export type DecideSaleAuthorizationOutcome =
  | { kind: "reserved"; fiscalDocumentId: string }
  | { kind: "deferred"; reason: DeferralReason };

export function decideSaleAuthorization(
  tx: SaleAuthorizationTransaction,
  ids: IdGenerator,
  { saleId, gate, decidedAt }: DecideSaleAuthorizationInput,
): DecideSaleAuthorizationOutcome {
  const decision = decideRealTimeAuthorization({
    gate,
    online: tx.fiscalOnlineEvidence(),
    now: decidedAt,
    series: tx.realTimeSeries(),
  });
  if (decision.kind === "defer") {
    tx.routeSaleToDeferred({ saleId, reason: decision.reason, routedAt: decidedAt });
    return { kind: "deferred", reason: decision.reason };
  }
  const fiscalDocumentId = ids.next();
  tx.reserveFiscalDocument({
    id: fiscalDocumentId,
    saleId,
    pointOfSale: decision.pointOfSale,
    number: decision.number,
    issuedOn: invoiceDateOf(decidedAt),
    document: decision.document,
    reservedAt: decidedAt,
  });
  return { kind: "reserved", fiscalDocumentId };
}
