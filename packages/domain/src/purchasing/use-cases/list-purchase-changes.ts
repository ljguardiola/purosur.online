import type { PurchaseChangeListing, PurchaseChangeReader } from "./purchase-change-reader.js";

export interface ListPurchaseChangesInput {
  locationId: string;
  purchaseId: string;
}

export type ListPurchaseChangesOutcome =
  | { kind: "not_found" }
  | { kind: "listed"; changes: PurchaseChangeListing[] };

export async function listPurchaseChanges(
  reader: PurchaseChangeReader,
  input: ListPurchaseChangesInput,
): Promise<ListPurchaseChangesOutcome> {
  const changes = await reader.purchaseChanges(input.locationId, input.purchaseId);
  if (changes === undefined) {
    return { kind: "not_found" };
  }
  return {
    kind: "listed",
    changes: [...changes].sort((a, b) => b.correctedAt.getTime() - a.correctedAt.getTime()),
  };
}
