import type { FreightMeans } from "@purosur/domain";
import type {
  FreightEdit,
  FreightPurchase,
  FreightStore,
  FreightStoreTransaction,
  FreightValues,
  LockFreightResult,
  NewFreightFields,
} from "@purosur/domain/purchasing/use-cases";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  auditLog,
  freightPurchases,
  freights,
  purchaseLines,
  purchases,
} from "../platform/db/schema.js";

function meansColumns(means: FreightMeans) {
  return {
    meansKind: means.kind,
    carrierName: means.kind === "carrier" ? means.name : null,
  };
}

class DrizzleFreightStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements FreightStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(tx: PgDatabase<TQueryResult>, now: () => Date) {
    this.tx = tx;
    this.now = now;
  }

  async lockPurchasesForFreight(
    locationId: string,
    purchaseIds: readonly string[],
  ): Promise<FreightPurchase[]> {
    const locked = await this.tx
      .select({ id: purchases.id })
      .from(purchases)
      .where(and(eq(purchases.locationId, locationId), inArray(purchases.id, [...purchaseIds])))
      .orderBy(asc(purchases.id))
      .for("update");
    if (locked.length === 0) {
      return [];
    }
    const lines = await this.tx
      .select({
        id: purchaseLines.id,
        purchaseId: purchaseLines.purchaseId,
        costPaidCents: purchaseLines.costPaidCents,
        quantity: purchaseLines.quantity,
        quantityPerPackage: purchaseLines.quantityPerPackage,
      })
      .from(purchaseLines)
      .where(
        inArray(
          purchaseLines.purchaseId,
          locked.map(({ id }) => id),
        ),
      )
      .orderBy(asc(purchaseLines.position));
    return locked.map(({ id }) => ({
      id,
      lines: lines
        .filter((line) => line.purchaseId === id)
        .map(({ purchaseId: _purchaseId, ...line }) => line),
    }));
  }

  async insertFreight(fields: NewFreightFields): Promise<{ id: string }> {
    const [freight] = await this.tx
      .insert(freights)
      .values({
        locationId: fields.locationId,
        freightOn: fields.date,
        amountCents: fields.amountCents,
        description: fields.description,
        ...meansColumns(fields.means),
        recordedAt: fields.recordedAt,
        actorId: fields.actorId,
        updatedAt: fields.recordedAt,
      })
      .returning({ id: freights.id });
    if (!freight) {
      throw new Error("inserting the freight returned no row");
    }
    await this.linkPurchases(freight.id, fields.purchaseIds);
    return freight;
  }

  async lockFreight(locationId: string, freightId: string): Promise<LockFreightResult> {
    const [freight] = await this.tx
      .select()
      .from(freights)
      .where(and(eq(freights.id, freightId), eq(freights.locationId, locationId)))
      .for("update");
    if (!freight) {
      return { kind: "not_found" };
    }
    const links = await this.tx
      .select({ purchaseId: freightPurchases.purchaseId })
      .from(freightPurchases)
      .where(eq(freightPurchases.freightId, freightId))
      .orderBy(asc(freightPurchases.purchaseId));
    return {
      kind: "locked",
      freight: {
        id: freight.id,
        locationId: freight.locationId,
        date: freight.freightOn,
        amountCents: freight.amountCents,
        description: freight.description,
        means:
          freight.carrierName === null
            ? { kind: "own_trip" }
            : { kind: "carrier", name: freight.carrierName },
        purchaseIds: links.map(({ purchaseId }) => purchaseId),
        recordedAt: freight.recordedAt,
        actorId: freight.actorId,
      },
    };
  }

  async replaceFreight(freightId: string, values: FreightValues): Promise<void> {
    await this.tx
      .update(freights)
      .set({
        freightOn: values.date,
        amountCents: values.amountCents,
        description: values.description,
        ...meansColumns(values.means),
        updatedAt: this.now(),
      })
      .where(eq(freights.id, freightId));
    await this.tx.delete(freightPurchases).where(eq(freightPurchases.freightId, freightId));
    await this.linkPurchases(freightId, values.purchaseIds);
  }

  async recordFreightEdit(edit: FreightEdit): Promise<void> {
    await this.tx.insert(auditLog).values({
      entity: "freight",
      entityId: edit.freightId,
      actorId: edit.actorId,
      previousValue: edit.previous,
      newValue: edit.next,
      at: edit.editedAt,
    });
  }

  private async linkPurchases(freightId: string, purchaseIds: readonly string[]): Promise<void> {
    await this.tx
      .insert(freightPurchases)
      .values(purchaseIds.map((purchaseId) => ({ freightId, purchaseId })));
  }
}

export class DrizzleFreightStore<TQueryResult extends PgQueryResultHKT> implements FreightStore {
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  transaction<TOutcome>(
    work: (tx: FreightStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleFreightStoreTransaction(tx, this.now)));
  }
}
