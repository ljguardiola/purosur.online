import {
  factsOfUntouchedLots,
  lotsOfLine,
  type PurchasedLineLotsTransaction,
  takeLotsOutOfStock,
} from "./purchased-line-lots.js";

export interface WithdrawPurchasedLotsInput {
  locationId: string;
  purchaseLineId: string;
  actorId: string;
}

export type WithdrawPurchasedLotsOutcome =
  | { kind: "not_found" }
  | { kind: "counted_since_receipt" }
  | { kind: "units_left_lot" }
  | { kind: "withdrawn" };

export async function withdrawPurchasedLots(
  tx: PurchasedLineLotsTransaction,
  input: WithdrawPurchasedLotsInput,
): Promise<WithdrawPurchasedLotsOutcome> {
  const found = await lotsOfLine(tx, input.locationId, input.purchaseLineId);
  if (!found) {
    return { kind: "not_found" };
  }
  const key = { productId: found.own.productId, locationId: input.locationId };
  const locked = await tx.lockProductStock(key);
  if (locked.kind === "not_found") {
    return { kind: "not_found" };
  }
  const receivedAt = await tx.receiptInstantOfPurchaseLine(input.purchaseLineId);
  if (receivedAt === undefined) {
    return { kind: "not_found" };
  }
  if ((await tx.earliestCountAtOrAfter(key, receivedAt)) !== undefined) {
    return { kind: "counted_since_receipt" };
  }
  const facts = await factsOfUntouchedLots(tx, input.purchaseLineId, found.lots);
  if (!facts) {
    return { kind: "units_left_lot" };
  }

  await takeLotsOutOfStock(tx, {
    key,
    purchaseLineId: input.purchaseLineId,
    receivedAt,
    actorId: input.actorId,
    facts,
  });
  return { kind: "withdrawn" };
}
