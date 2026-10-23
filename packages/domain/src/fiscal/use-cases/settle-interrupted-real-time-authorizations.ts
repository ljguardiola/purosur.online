import { realTimeAuthorizationResolution } from "../model/real-time-authorization.js";
import type { InterruptedRealTimeAuthorizationPorts } from "./interrupted-real-time-authorization-ports.js";
import { recordDeferredSale } from "./record-deferred-sale.js";

export type SettleInterruptedRealTimeAuthorizationsOutcome = {
  kind: "settled";
  saleIds: readonly string[];
};

export async function settleInterruptedRealTimeAuthorizations({
  documents,
  clock,
  ids,
  shortCodes,
}: InterruptedRealTimeAuthorizationPorts): Promise<SettleInterruptedRealTimeAuthorizationsOutcome> {
  const resolution = realTimeAuthorizationResolution({ kind: "unclear" });
  const resolvedAt = clock.now();
  return documents.transaction((tx) => {
    const requesting = tx.requestingDocuments();
    for (const {
      fiscalDocumentId,
      saleId,
      pointOfSale,
      number,
      issuedOn,
      document,
      origin,
      reservedAt,
      holdsDeferredSale,
    } of requesting) {
      if (holdsDeferredSale) {
        tx.resolve({
          fiscalDocumentId,
          saleId,
          resolution,
          resolvedAt,
          deferredSale: null,
          deferredSaleSatisfied: null,
        });
        continue;
      }
      recordDeferredSale(
        (deferredSale) =>
          tx.resolve({
            fiscalDocumentId,
            saleId,
            resolution,
            resolvedAt,
            deferredSale,
            deferredSaleSatisfied: null,
          }),
        ids,
        shortCodes,
        {
          saleId,
          occurredAt: reservedAt,
          total: document.total,
          reason: resolution.deferralReason,
          routedAt: resolvedAt,
          origin,
          unclearDocument: {
            fiscalDocumentId,
            pointOfSale,
            number,
            issuedOn,
            document,
            reservedAt,
          },
        },
      );
    }
    return { kind: "settled", saleIds: requesting.map(({ saleId }) => saleId) };
  });
}
