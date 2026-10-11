import { realTimeAuthorizationResolution } from "../model/real-time-authorization.js";
import type { InterruptedRealTimeAuthorizationPorts } from "./interrupted-real-time-authorization-ports.js";

export type SettleInterruptedRealTimeAuthorizationsOutcome = {
  kind: "settled";
  saleIds: readonly string[];
};

export async function settleInterruptedRealTimeAuthorizations({
  documents,
  clock,
}: InterruptedRealTimeAuthorizationPorts): Promise<SettleInterruptedRealTimeAuthorizationsOutcome> {
  const requesting = await documents.requestingDocuments();
  const resolution = realTimeAuthorizationResolution({ kind: "unclear" });
  const resolvedAt = clock.now();
  for (const { fiscalDocumentId, saleId } of requesting) {
    await documents.resolve({ fiscalDocumentId, saleId, resolution, resolvedAt });
  }
  return { kind: "settled", saleIds: requesting.map(({ saleId }) => saleId) };
}
