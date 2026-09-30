import type { SaleUnit } from "@purosur/domain";
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
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";

type DiscountRow = typeof discounts.$inferSelect;

function targetColumns(target: DiscountFields["target"]) {
  return {
    productId: target.kind === "PRODUCT" ? target.id : null,
    categoryId: target.kind === "CATEGORY" ? target.id : null,
    tagId: target.kind === "TAG" ? target.id : null,
  };
}

function benefitColumns(benefit: DiscountFields["benefit"]) {
  switch (benefit.kind) {
    case "PERCENT_OFF":
      return { kind: benefit.kind, percent: benefit.percent, buyQty: null, payQty: null };
    case "BUY_N_PAY_M":
      return { kind: benefit.kind, percent: null, buyQty: benefit.buyQty, payQty: benefit.payQty };
  }
}

function storedColumns(fields: DiscountFields) {
  return {
    name: fields.name,
    ...benefitColumns(fields.benefit),
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

export function storedBenefit(row: DiscountRow): DiscountFields["benefit"] {
  if (row.kind === "BUY_N_PAY_M" && row.buyQty !== null && row.payQty !== null) {
    return { kind: "BUY_N_PAY_M", buyQty: row.buyQty, payQty: row.payQty };
  }
  if (row.kind === "PERCENT_OFF" && row.percent !== null) {
    return { kind: "PERCENT_OFF", percent: row.percent };
  }
  throw new Error(`discount ${row.id} has no benefit of its kind ${row.kind}`);
}

export function discountFieldsOf(row: DiscountRow): DiscountFields {
  return {
    name: row.name,
    benefit: storedBenefit(row),
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
  private readonly pending: PendingChanges;

  constructor(tx: PgDatabase<TQueryResult>, pending: PendingChanges) {
    this.tx = tx;
    this.pending = pending;
  }

  async lockAssignableTarget(
    target: DiscountFields["target"],
  ): Promise<LockAssignableTargetResult> {
    if (!UUID_PATTERN.test(target.id)) {
      return { kind: "not_found" };
    }
    const found = await this.lockedTargetRow(target);
    return found
      ? { kind: "locked", name: found.name, saleUnit: found.saleUnit }
      : { kind: "not_found" };
  }

  async insertDiscount(fields: DiscountFields): Promise<{ id: string }> {
    const [discount] = await this.tx
      .insert(discounts)
      .values(storedColumns(fields))
      .returning({ id: discounts.id });
    if (!discount) {
      throw new Error("inserting the discount returned no row");
    }
    this.pending.note({
      entity: "discount",
      entityId: discount.id,
      version: fields.version,
      op: "insert",
    });
    return discount;
  }

  async lockDiscount(id: string): Promise<LockDiscountResult> {
    if (!UUID_PATTERN.test(id)) {
      return { kind: "not_found" };
    }
    const [row] = await this.tx.select().from(discounts).where(eq(discounts.id, id)).for("update");
    return row ? { kind: "locked", discount: discountFieldsOf(row) } : { kind: "not_found" };
  }

  async updateDiscount(id: string, fields: DiscountFields): Promise<void> {
    await this.tx.update(discounts).set(storedColumns(fields)).where(eq(discounts.id, id));
    this.pending.note({ entity: "discount", entityId: id, version: fields.version, op: "update" });
  }

  // A shared lock is enough: deactivating a product or a tag takes the row's update lock, which waits.
  private async lockedTargetRow(
    target: DiscountFields["target"],
  ): Promise<{ name: string; saleUnit: SaleUnit | null } | undefined> {
    switch (target.kind) {
      case "PRODUCT": {
        const [row] = await this.tx
          .select({ name: products.name, saleUnit: products.saleUnit })
          .from(products)
          .where(and(eq(products.id, target.id), eq(products.active, true)))
          .for("share");
        return row && { name: row.name, saleUnit: row.saleUnit as SaleUnit };
      }
      case "TAG": {
        const [row] = await this.tx
          .select({ name: tags.name })
          .from(tags)
          .where(and(eq(tags.id, target.id), eq(tags.active, true)))
          .for("share");
        return row && { name: row.name, saleUnit: null };
      }
      case "CATEGORY": {
        const [row] = await this.tx
          .select({ name: categories.name })
          .from(categories)
          .where(eq(categories.id, target.id))
          .for("share");
        return row && { name: row.name, saleUnit: null };
      }
    }
  }
}

export class DrizzleDiscountStore<TQueryResult extends PgQueryResultHKT> implements DiscountStore {
  private readonly db: PgDatabase<TQueryResult>;
  private readonly pending: PendingChanges | undefined;

  constructor(db: PgDatabase<TQueryResult>, pending?: PendingChanges) {
    this.db = db;
    this.pending = pending;
  }

  transaction<TOutcome>(
    work: (tx: DiscountStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, this.pending, (tx, pending) =>
      work(new DrizzleDiscountStoreTransaction(tx, pending)),
    );
  }
}
