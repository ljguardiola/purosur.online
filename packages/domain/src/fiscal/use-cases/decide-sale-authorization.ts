import type { PreEmissionGateOutcome } from "../model/pre-emission-gate.js";
import type { DeferralReason } from "../model/real-time-authorization.js";
import { decideRealTimeAuthorization, invoiceDateOf } from "../model/real-time-authorization.js";
import type { ShortCodeRandomness } from "./deferred-sale-ports.js";
import { recordDeferredSale } from "./record-deferred-sale.js";
import type { IdGenerator, SaleAuthorizationTransaction } from "./sale-authorization-ports.js";

export interface DecideSaleAuthorizationInput {
  saleId: string;
  gate: PreEmissionGateOutcome;
  decidedAt: Date;
  occurredAt: Date;
  total: number;
}

export type DecideSaleAuthorizationOutcome =
  | { kind: "reserved"; fiscalDocumentId: string }
  | { kind: "deferred"; reason: DeferralReason };

export function decideSaleAuthorization(
  tx: SaleAuthorizationTransaction,
  ids: IdGenerator,
  shortCodes: ShortCodeRandomness,
  { saleId, gate, decidedAt, occurredAt, total }: DecideSaleAuthorizationInput,
): DecideSaleAuthorizationOutcome {
  const decision = decideRealTimeAuthorization({
    gate,
    online: tx.fiscalOnlineEvidence(),
    now: decidedAt,
    series: tx.realTimeSeries(),
  });
  if (decision.kind === "defer") {
    recordDeferredSale((sale) => tx.routeSaleToDeferred(sale), ids, shortCodes, {
      saleId,
      occurredAt,
      total,
      reason: decision.reason,
      routedAt: decidedAt,
    });
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
