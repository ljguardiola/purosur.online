import type {
  DiscountFields,
  DiscountStore,
  DiscountStoreTransaction,
  LockAssignableTargetResult,
  LockDiscountResult,
} from "@purosur/domain/pricing/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { categories, discounts, products, tags } from "../platform/db/schema.js";
import { UUID_PATTERN } from "../platform/db/uuid-pattern.js";

type DiscountRow = typeof discounts.$inferSelect;

function targetColumns(target: DiscountFields["target"]) {
  return {
    productId: target.kind === "PRODUCT" ? target.id : null,
    categoryId: target.kind === "CATEGORY" ? target.id : null,
    tagId: target.kind === "TAG" ? target.id : null,
  };
}

function storedColumns(fields: DiscountFields) {
  return {
    name: fields.name,
    kind: fields.benefit.kind,
    percent: fields.benefit.percent,
    ...targetColumns(fields.target),
    validFrom: fields.validFrom,
    validTo: fields.validTo,
    weekdays: fields.weekdays,
    active: fields.active,
    version: fields.version,
  };
}

function targetOf(row: DiscountRow): DiscountFields["target"] {
  if (row.productId !== null) {
    return { kind: "PRODUCT", id: row.productId };
  }
  if (row.categoryId !== null) {
    return { kind: "CATEGORY", id: row.categoryId };
  }
  if (row.tagId !== null) {
    return { kind: "TAG", id: row.tagId };
  }
  throw new Error(`discount ${row.id} has no target`);
}

function fieldsOf(row: DiscountRow): DiscountFields {
  if (row.percent === null) {
    throw new Error(`discount ${row.id} has no percent`);
  }
  return {
    name: row.name,
    benefit: { kind: "PERCENT_OFF", percent: row.percent },
    target: targetOf(row),
    validFrom: row.validFrom,
    validTo: row.validTo,
    weekdays: row.weekdays,
    active: row.active,
    version: row.version,
  };
}

class DrizzleDiscountStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements DiscountStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;

  constructor(tx: PgDatabase<TQueryResult>) {
    this.tx = tx;
  }

  async lockAssignableTarget(
    target: DiscountFields["target"],
  ): Promise<LockAssignableTargetResult> {
    if (!UUID_PATTERN.test(target.id)) {
      return { kind: "not_found" };
    }
    const found = await this.lockedTargetRow(target);
    return found ? { kind: "locked" } : { kind: "not_found" };
  }

  async insertDiscount(fields: DiscountFields): Promise<{ id: string }> {
    const [discount] = await this.tx
      .insert(discounts)
      .values(storedColumns(fields))
      .returning({ id: discounts.id });
    if (!discount) {
      throw new Error("inserting the discount returned no row");
    }
    return discount;
  }

  async lockDiscount(id: string): Promise<LockDiscountResult> {
    if (!UUID_PATTERN.test(id)) {
      return { kind: "not_found" };
    }
    const [row] = await this.tx.select().from(discounts).where(eq(discounts.id, id)).for("update");
    return row ? { kind: "locked", discount: fieldsOf(row) } : { kind: "not_found" };
  }

  async updateDiscount(id: string, fields: DiscountFields): Promise<void> {
    await this.tx.update(discounts).set(storedColumns(fields)).where(eq(discounts.id, id));
  }

  // A shared lock is enough: deactivating a product or a tag takes the row's update lock, which waits.
  private async lockedTargetRow(target: DiscountFields["target"]): Promise<boolean> {
    switch (target.kind) {
      case "PRODUCT": {
        const rows = await this.tx
          .select({ id: products.id })
          .from(products)
          .where(and(eq(products.id, target.id), eq(products.active, true)))
          .for("share");
        return rows.length > 0;
      }
      case "TAG": {
        const rows = await this.tx
          .select({ id: tags.id })
          .from(tags)
          .where(and(eq(tags.id, target.id), eq(tags.active, true)))
          .for("share");
        return rows.length > 0;
      }
      case "CATEGORY": {
        const rows = await this.tx
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.id, target.id))
          .for("share");
        return rows.length > 0;
      }
    }
  }
}

export class DrizzleDiscountStore<TQueryResult extends PgQueryResultHKT> implements DiscountStore {
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: DiscountStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleDiscountStoreTransaction(tx)));
  }
}
