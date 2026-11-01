import type { LotOriginKind } from "@purosur/domain/stock/use-cases";

export function lotOriginOf(lot: {
  technical: boolean;
  assemblyBatchId: string | null;
  purchaseLineId: string | null;
}): LotOriginKind {
  if (lot.technical) {
    return "technical";
  }
  if (lot.assemblyBatchId !== null) {
    return "assembly_batch";
  }
  return lot.purchaseLineId === null ? "initial_count" : "purchase";
}
