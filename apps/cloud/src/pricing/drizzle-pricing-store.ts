import { newestPrice } from "@purosur/domain";
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
import { auditLog, branchSettings, priceReviews, prices, products } from "../platform/db/schema.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";
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
    const [product] = await this.tx
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.active, true)))
      .for("update");
    return product ? { kind: "locked" } : { kind: "not_found" };
  }

  async branchPriceList(locationId: string): Promise<string> {
    const [settings] = await this.tx
      .select({ priceListId: branchSettings.priceListId })
      .from(branchSettings)
      .where(eq(branchSettings.locationId, locationId));
    if (!settings) {
      throw new Error(`branch settings missing for location ${locationId}`);
    }
    return settings.priceListId;
  }

  async currentPrice(productId: string, priceListId: string): Promise<CurrentPrice | undefined> {
    const candidates = await this.tx
      .select({ id: prices.id, unitPrice: prices.unitPrice, validFrom: prices.validFrom })
      .from(prices)
      .where(and(eq(prices.productId, productId), eq(prices.priceListId, priceListId)));
    return newestPrice(candidates);
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
  private readonly pending: PendingChanges | undefined;

  constructor(db: PgDatabase<TQueryResult>, pending?: PendingChanges) {
    this.db = db;
    this.pending = pending;
  }

  transaction<TOutcome>(
    work: (tx: PricingStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, this.pending, (tx, pending) =>
      work(new DrizzlePricingStoreTransaction(tx, pending)),
    );
  }
}
