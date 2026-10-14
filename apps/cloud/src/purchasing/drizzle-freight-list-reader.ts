import type { ReceiptType } from "@purosur/domain";
import type {
  FreightListing,
  FreightListQuery,
  FreightListReader,
  FreightPurchaseListing,
  LinkablePurchaseListing,
} from "@purosur/domain/purchasing/use-cases";
import { and, asc, desc, eq, exists, gte, ilike, inArray, or, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { containsPattern } from "../platform/contains-pattern.js";
import {
  freightPurchases,
  freights,
  purchaseLines,
  purchases,
  suppliers,
} from "../platform/db/schema.js";

const purchaseColumns = {
  id: purchases.id,
  purchasedOn: purchases.purchasedOn,
  supplierId: suppliers.id,
  supplierName: suppliers.name,
  recordedAt: purchases.recordedAt,
  receiptType: purchases.receiptType,
  receiptNumber: purchases.receiptNumber,
};

export class DrizzleFreightListReader<TQueryResult extends PgQueryResultHKT>
  implements FreightListReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async freights({ locationId, from, search }: FreightListQuery): Promise<FreightListing[]> {
    const rows = await this.db
      .select()
      .from(freights)
      .where(
        and(
          eq(freights.locationId, locationId),
          gte(freights.freightOn, from),
          search === undefined ? undefined : this.matches(containsPattern(search)),
        ),
      )
      .orderBy(desc(freights.freightOn), desc(freights.recordedAt), desc(freights.id));
    if (rows.length === 0) {
      return [];
    }

    const coveredRows = await this.db
      .select({
        freightId: freightPurchases.freightId,
        id: purchases.id,
        purchasedOn: purchases.purchasedOn,
        supplierId: suppliers.id,
        supplierName: suppliers.name,
      })
      .from(freightPurchases)
      .innerJoin(purchases, eq(purchases.id, freightPurchases.purchaseId))
      .innerJoin(suppliers, eq(suppliers.id, purchases.supplierId))
      .where(
        inArray(
          freightPurchases.freightId,
          rows.map(({ id }) => id),
        ),
      )
      .orderBy(desc(purchases.purchasedOn), asc(purchases.id));
    const coveredBy = new Map<string, FreightPurchaseListing[]>();
    for (const { freightId, supplierId, supplierName, ...purchase } of coveredRows) {
      coveredBy.set(freightId, [
        ...(coveredBy.get(freightId) ?? []),
        { ...purchase, supplier: { id: supplierId, name: supplierName } },
      ]);
    }

    return rows.map((row) => ({
      id: row.id,
      date: row.freightOn,
      amountCents: row.amountCents,
      description: row.description,
      means:
        row.carrierName === null
          ? { kind: "own_trip" }
          : { kind: "carrier", name: row.carrierName },
      purchases: coveredBy.get(row.id) ?? [],
    }));
  }

  purchasesSince(locationId: string, since: string): Promise<LinkablePurchaseListing[]> {
    return this.readPurchases(
      and(eq(purchases.locationId, locationId), gte(purchases.purchasedOn, since)),
    );
  }

  purchasesLinkedTo(locationId: string, freightId: string): Promise<LinkablePurchaseListing[]> {
    return this.readPurchases(
      and(
        eq(purchases.locationId, locationId),
        exists(
          this.db
            .select({ purchaseId: freightPurchases.purchaseId })
            .from(freightPurchases)
            .innerJoin(freights, eq(freights.id, freightPurchases.freightId))
            .where(
              and(
                eq(freightPurchases.purchaseId, purchases.id),
                eq(freights.id, freightId),
                eq(freights.locationId, locationId),
              ),
            ),
        ),
      ),
    );
  }

  private matches(pattern: string): SQL | undefined {
    return or(
      ilike(freights.description, pattern),
      ilike(freights.carrierName, pattern),
      exists(
        this.db
          .select({ purchaseId: freightPurchases.purchaseId })
          .from(freightPurchases)
          .innerJoin(purchases, eq(purchases.id, freightPurchases.purchaseId))
          .innerJoin(suppliers, eq(suppliers.id, purchases.supplierId))
          .where(and(eq(freightPurchases.freightId, freights.id), ilike(suppliers.name, pattern))),
      ),
    );
  }

  private async readPurchases(where: SQL | undefined): Promise<LinkablePurchaseListing[]> {
    const rows = await this.db
      .select(purchaseColumns)
      .from(purchases)
      .innerJoin(suppliers, eq(suppliers.id, purchases.supplierId))
      .where(where);
    if (rows.length === 0) {
      return [];
    }

    const lines = await this.db
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
          rows.map(({ id }) => id),
        ),
      )
      .orderBy(asc(purchaseLines.position));
    return rows.map(({ supplierId, supplierName, receiptType, ...purchase }) => ({
      ...purchase,
      supplier: { id: supplierId, name: supplierName },
      receiptType: receiptType as ReceiptType,
      lines: lines
        .filter((line) => line.purchaseId === purchase.id)
        .map(({ purchaseId: _purchaseId, ...line }) => line),
    }));
  }
}
