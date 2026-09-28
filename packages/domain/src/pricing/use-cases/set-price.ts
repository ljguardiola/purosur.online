import { momentAfter } from "../model/price-moment.js";
import type { PricingPorts } from "./pricing-store.js";

export interface SetPriceInput {
  productId: string;
  priceListId: string;
  unitPrice: number;
  expectedCurrentPriceId: string | null;
  actorId: string;
}

export type SetPriceOutcome =
  | { kind: "not_found" }
  | { kind: "stale_price" }
  | { kind: "price_unchanged" }
  | {
      kind: "applied";
      price: { id: string; unitPrice: number; validFrom: Date };
      lastReviewedAt: Date;
    };

export async function setPrice(
  { store, clock }: PricingPorts,
  input: SetPriceInput,
): Promise<SetPriceOutcome> {
  return store.transaction<SetPriceOutcome>(async (tx) => {
    // Locks the product so a concurrent price change waits instead of racing the current-price
    // read below and the write it may lead to.
    const locked = await tx.lockActiveProduct(input.productId);
    if (locked.kind === "not_found") {
      return { kind: "not_found" };
    }

    const current = await tx.currentPrice(input.productId, input.priceListId);
    if ((current?.id ?? null) !== input.expectedCurrentPriceId) {
      return { kind: "stale_price" };
    }
    if (current && current.unitPrice === input.unitPrice) {
      return { kind: "price_unchanged" };
    }

    const moment = momentAfter(clock.now(), [
      current?.validFrom,
      await tx.latestReviewedAt(input.productId, input.priceListId),
    ]);

    const price = await tx.recordPrice({
      productId: input.productId,
      priceListId: input.priceListId,
      unitPrice: input.unitPrice,
      validFrom: moment,
    });
    await tx.recordPriceReview({
      productId: input.productId,
      priceListId: input.priceListId,
      reviewedAt: moment,
      actorId: input.actorId,
      priceId: price.id,
    });
    await tx.recordPriceChange({
      productId: input.productId,
      actorId: input.actorId,
      previous: current ? { priceId: current.id, unitPrice: current.unitPrice } : null,
      next: { priceId: price.id, unitPrice: price.unitPrice },
    });

    return { kind: "applied", price, lastReviewedAt: moment };
  });
}
