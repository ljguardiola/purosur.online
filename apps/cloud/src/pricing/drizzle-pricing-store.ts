import type {
  CurrentPrice,
  LockActiveProductResult,
  NewPrice,
  NewPriceReview,
  PriceChange,
  PriceConfirmation,
  PricingStore,
  PricingStoreTransaction,
} from "@purosur/domain/pricing/use-cases";
import { and, desc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { auditLog, priceReviews, prices, products } from "../platform/db/schema.js";
import { UUID_PATTERN } from "../platform/db/uuid-pattern.js";
import { PendingChanges } from "../sync/change-log.js";
import { NEWEST_PRICE_FIRST } from "./current-price.js";
import { PRICE_VERSION } from "./price-version.js";

class DrizzlePricingStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements PricingStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;
  private readonly pending: PendingChanges;

  constructor(tx: PgDatabase<TQueryResult>, pending: PendingChanges) {
    this.tx = tx;
    this.pending = pending;
  }

  async lockActiveProduct(productId: string): Promise<LockActiveProductResult> {
    if (!UUID_PATTERN.test(productId)) {
      return { kind: "not_found" };
    }
    const [product] = await this.tx
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.active, true)))
      .for("update");
    return product ? { kind: "locked" } : { kind: "not_found" };
  }

  async currentPrice(productId: string, priceListId: string): Promise<CurrentPrice | undefined> {
    const [current] = await this.tx
      .select({ id: prices.id, unitPrice: prices.unitPrice, validFrom: prices.validFrom })
      .from(prices)
      .where(and(eq(prices.productId, productId), eq(prices.priceListId, priceListId)))
      .orderBy(...NEWEST_PRICE_FIRST)
      .limit(1);
    return current;
  }

  async latestReviewedAt(productId: string, priceListId: string): Promise<Date | undefined> {
    const [latest] = await this.tx
      .select({ reviewedAt: priceReviews.reviewedAt })
      .from(priceReviews)
      .where(and(eq(priceReviews.productId, productId), eq(priceReviews.priceListId, priceListId)))
      .orderBy(desc(priceReviews.reviewedAt))
      .limit(1);
    return latest?.reviewedAt;
  }

  async recordPrice(price: NewPrice): Promise<CurrentPrice> {
    const [recorded] = await this.tx
      .insert(prices)
      .values(price)
      .returning({ id: prices.id, unitPrice: prices.unitPrice, validFrom: prices.validFrom });
    if (!recorded) {
      throw new Error("inserting the new price returned no row");
    }
    this.pending.note({
      entity: "price",
      entityId: recorded.id,
      version: PRICE_VERSION,
      op: "insert",
      priceListId: price.priceListId,
    });
    return recorded;
  }

  async recordPriceReview(review: NewPriceReview): Promise<void> {
    await this.tx.insert(priceReviews).values(review);
  }

  async recordPriceChange(change: PriceChange): Promise<void> {
    await this.tx.insert(auditLog).values({
      entity: "product_price",
      entityId: change.productId,
      actorId: change.actorId,
      previousValue: change.previous,
      newValue: change.next,
    });
  }

  async recordPriceConfirmation(confirmation: PriceConfirmation): Promise<void> {
    await this.tx.insert(auditLog).values({
      entity: "product_price_review",
      entityId: confirmation.productId,
      actorId: confirmation.actorId,
      previousValue: null,
      newValue: { priceId: confirmation.priceId },
    });
  }
}

export class DrizzlePricingStore<TQueryResult extends PgQueryResultHKT> implements PricingStore {
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: PricingStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction(async (tx) => {
      const pending = new PendingChanges();
      const outcome = await work(new DrizzlePricingStoreTransaction(tx, pending));
      await pending.log(tx);
      return outcome;
    });
  }
}
