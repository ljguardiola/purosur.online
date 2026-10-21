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
    for (const { fiscalDocumentId, saleId, origin, reservedAt, total } of requesting) {
      recordDeferredSale(
        (deferredSale) =>
          tx.resolve({ fiscalDocumentId, saleId, resolution, resolvedAt, deferredSale }),
        ids,
        shortCodes,
        {
          saleId,
          occurredAt: reservedAt,
          total,
          reason: resolution.deferralReason,
          routedAt: resolvedAt,
          origin,
        },
      );
    }
    return { kind: "settled", saleIds: requesting.map(({ saleId }) => saleId) };
  });
}
