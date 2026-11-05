import {
  factsOfUntouchedLots,
  lotsOfLine,
  type PurchasedLineLotsTransaction,
  putLotsInStock,
  takeLotsOutOfStock,
} from "./purchased-line-lots.js";

export interface MovePurchasedLotsInput {
  locationId: string;
  purchaseLineId: string;
  productId: string;
  actorId: string;
}

export type MovePurchasedLotsOutcome =
  | { kind: "not_found" }
  | { kind: "counted_since_receipt" }
  | { kind: "units_left_lot" }
  | { kind: "moved" };

export async function movePurchasedLots(
  tx: PurchasedLineLotsTransaction,
  input: MovePurchasedLotsInput,
): Promise<MovePurchasedLotsOutcome> {
  const found = await lotsOfLine(tx, input.locationId, input.purchaseLineId);
  if (!found) {
    return { kind: "not_found" };
  }
  const from = { productId: found.own.productId, locationId: input.locationId };
  const to = { productId: input.productId, locationId: input.locationId };
  for (const productId of [...new Set([from.productId, to.productId])].sort()) {
    const locked = await tx.lockProductStock({ productId, locationId: input.locationId });
    if (locked.kind === "not_found") {
      return { kind: "not_found" };
    }
  }
  const receivedAt = await tx.receiptInstantOfPurchaseLine(input.purchaseLineId);
  if (receivedAt === undefined) {
    return { kind: "not_found" };
  }
  if (
    (await tx.earliestCountAtOrAfter(from, receivedAt)) !== undefined ||
    (await tx.earliestCountAtOrAfter(to, receivedAt)) !== undefined
  ) {
    return { kind: "counted_since_receipt" };
  }
  const facts = await factsOfUntouchedLots(tx, input.purchaseLineId, found.lots);
  if (!facts) {
    return { kind: "units_left_lot" };
  }

  const receipt = {
    purchaseLineId: input.purchaseLineId,
    receivedAt,
    actorId: input.actorId,
    facts,
  };
  await takeLotsOutOfStock(tx, { ...receipt, key: from });
  await putLotsInStock(tx, { ...receipt, key: to });
  return { kind: "moved" };
}
