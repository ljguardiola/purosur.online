import { momentAfter } from "../model/price-moment.js";
import type { PricingPorts } from "./pricing-store.js";

export interface ConfirmPriceInput {
  productId: string;
  priceListId: string;
  expectedCurrentPriceId: string;
  actorId: string;
}

export type ConfirmPriceOutcome =
  | { kind: "not_found" }
  | { kind: "no_price_to_confirm" }
  | { kind: "stale_price" }
  | { kind: "confirmed"; lastReviewedAt: Date };

export async function confirmPrice(
  { store, clock }: PricingPorts,
  input: ConfirmPriceInput,
): Promise<ConfirmPriceOutcome> {
  return store.transaction<ConfirmPriceOutcome>(async (tx) => {
    // Locks the product so a concurrent price change or confirmation waits instead of racing the
    // current-price read below.
    const locked = await tx.lockActiveProduct(input.productId);
    if (locked.kind === "not_found") {
      return { kind: "not_found" };
    }

    const current = await tx.currentPrice(input.productId, input.priceListId);
    if (!current) {
      return { kind: "no_price_to_confirm" };
    }
    if (current.id !== input.expectedCurrentPriceId) {
      return { kind: "stale_price" };
    }

    const moment = momentAfter(clock.now(), [
      await tx.latestReviewedAt(input.productId, input.priceListId),
    ]);

    await tx.recordPriceReview({
      productId: input.productId,
      priceListId: input.priceListId,
      reviewedAt: moment,
      actorId: input.actorId,
      priceId: current.id,
    });
    await tx.recordPriceConfirmation({
      productId: input.productId,
      actorId: input.actorId,
      priceId: current.id,
    });

    return { kind: "confirmed", lastReviewedAt: moment };
  });
}
