import { FACTURA_C_DOCUMENT_TYPE } from "../model/fiscal-rejection-standing.js";
import {
  offlineFiscalDocument,
  offlineFiscalDocumentIssuedEvent,
} from "../model/offline-fiscal-document.js";
import type { PreEmissionGateOutcome } from "../model/pre-emission-gate.js";
import {
  type DeferralReason,
  decideSaleAuthorizationRoute,
  invoiceDateOf,
  invoiceOwnFortnight,
  type OfflineAuthorizationCause,
} from "../model/real-time-authorization.js";
import { raisedClockMark } from "../model/register-clock.js";
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
  | { kind: "issued_offline"; fiscalDocumentId: string; cause: OfflineAuthorizationCause }
  | { kind: "deferred"; reason: DeferralReason };

export function decideSaleAuthorization(
  tx: SaleAuthorizationTransaction,
  ids: IdGenerator,
  shortCodes: ShortCodeRandomness,
  { saleId, gate, decidedAt, occurredAt, total }: DecideSaleAuthorizationInput,
): DecideSaleAuthorizationOutcome {
  const series = tx.realTimeSeries();
  const offlineSeries = tx.offlineSeries();
  const route = decideSaleAuthorizationRoute({
    gate,
    online: tx.fiscalOnlineEvidence(),
    now: decidedAt,
    occurredAt,
    series,
    offlineSeries,
    offlineAuthorizationCode: tx.offlineAuthorizationCodeOf(invoiceOwnFortnight(occurredAt)),
  });
  if (route.kind === "defer") {
    recordDeferredSale((sale) => tx.routeSaleToDeferred(sale), ids, shortCodes, {
      saleId,
      occurredAt,
      total,
      reason: route.reason,
      routedAt: decidedAt,
    });
    return { kind: "deferred", reason: route.reason };
  }
  const fiscalDocumentId = ids.next();
  if (route.kind === "issue_offline") {
    const document = offlineFiscalDocument({
      id: fiscalDocumentId,
      saleId,
      pointOfSale: route.pointOfSale,
      number: route.number,
      issuedOn: route.issuedOn,
      generatedAt: decidedAt,
      offlineAuthorizationCode: route.offlineAuthorizationCode,
      fortnight: route.fortnight,
      document: route.document,
      cause: route.cause,
    });
    tx.issueOfflineFiscalDocument(document);
    tx.recordClockMark({
      pointOfSale: route.pointOfSale,
      documentType: document.documentType,
      reading: raisedClockMark(offlineSeries.clockMark, occurredAt),
    });
    tx.appendOutboxEvent(
      offlineFiscalDocumentIssuedEvent({
        eventId: ids.next(),
        ...tx.originOfSale(saleId),
        document,
      }),
    );
    return { kind: "issued_offline", fiscalDocumentId, cause: route.cause };
  }
  tx.reserveFiscalDocument({
    id: fiscalDocumentId,
    saleId,
    pointOfSale: route.pointOfSale,
    number: route.number,
    issuedOn: invoiceDateOf(decidedAt),
    document: route.document,
    reservedAt: decidedAt,
  });
  tx.recordClockMark({
    pointOfSale: route.pointOfSale,
    documentType: FACTURA_C_DOCUMENT_TYPE,
    reading: raisedClockMark(series.clockMark, decidedAt),
  });
  return { kind: "reserved", fiscalDocumentId };
}
