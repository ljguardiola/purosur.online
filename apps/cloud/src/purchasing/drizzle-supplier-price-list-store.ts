import {
  DEFAULT_SUPPLIER_PRICE_LIST_DAILY_EXTRACTION_CAP,
  type SupplierPriceListReadFailure,
  type SupplierPriceListSourceKind,
  type SupplierPriceListState,
} from "@purosur/domain";
import type {
  FindPriceListSupplierResult,
  LockSupplierPriceListResult,
  LockSupplierPriceListRowResult,
  NewSupplierPriceListFields,
  ProposedPriceListRow,
  SupplierPriceListStore,
  SupplierPriceListStoreTransaction,
} from "@purosur/domain/purchasing/use-cases";
import { and, asc, count, eq, isNull, or, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  auditLog,
  locations,
  supplierPriceListExtractionCaps,
  supplierPriceListRows,
  supplierPriceLists,
  suppliers,
} from "../platform/db/schema.js";
import {
  SUPPLIER_PRICE_LIST_READING_MAX_ATTEMPTS,
  SUPPLIER_PRICE_LIST_READING_TASK_IDENTIFIER,
} from "./supplier-price-list-reading-task-identifier.js";

const ROW_AUDIT_ENTITY = "supplier_price_list_row";

class DrizzleSupplierPriceListStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements SupplierPriceListStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(tx: PgDatabase<TQueryResult>, now: () => Date) {
    this.tx = tx;
    this.now = now;
  }

  async lockBranchExtractionQuota(locationId: string): Promise<{ cap: number }> {
    await this.tx
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.id, locationId))
      .for("no key update");
    const [setCap] = await this.tx
      .select({ dailyCap: supplierPriceListExtractionCaps.dailyCap })
      .from(supplierPriceListExtractionCaps)
      .where(eq(supplierPriceListExtractionCaps.locationId, locationId));
    return { cap: setCap?.dailyCap ?? DEFAULT_SUPPLIER_PRICE_LIST_DAILY_EXTRACTION_CAP };
  }

  async extractionsCountedOn(locationId: string, day: string): Promise<number> {
    const [row] = await this.tx
      .select({ counted: count() })
      .from(supplierPriceLists)
      .where(
        and(
          eq(supplierPriceLists.locationId, locationId),
          or(
            eq(supplierPriceLists.sentOn, day),
            and(eq(supplierPriceLists.state, "READING"), isNull(supplierPriceLists.sentOn)),
          ),
        ),
      );
    return row?.counted ?? 0;
  }

  async findSupplier(supplierId: string): Promise<FindPriceListSupplierResult> {
    const [supplier] = await this.tx
      .select({ id: suppliers.id, active: suppliers.active })
      .from(suppliers)
      .where(eq(suppliers.id, supplierId));
    return supplier ? { kind: "found", supplier } : { kind: "not_found" };
  }

  async insertList(fields: NewSupplierPriceListFields): Promise<{ id: string }> {
    const [list] = await this.tx
      .insert(supplierPriceLists)
      .values({
        supplierId: fields.supplierId,
        locationId: fields.locationId,
        sourceKind: fields.sourceKind,
        fileName: fields.fileName,
        fileByteSize: fields.byteSize,
        state: "READING",
        uploadedAt: fields.uploadedAt,
        uploadedBy: fields.actorId,
      })
      .returning({ id: supplierPriceLists.id });
    if (!list) {
      throw new Error("inserting the supplier price list returned no row");
    }
    return list;
  }

  // graphile-worker's JavaScript `addJob` runs on its own pool, so it cannot join this
  // transaction; its SQL function can.
  async enqueueReading(listId: string): Promise<void> {
    await this.tx.execute(
      sql`select graphile_worker.add_job(
        ${SUPPLIER_PRICE_LIST_READING_TASK_IDENTIFIER}::text,
        json_build_object('listId', ${listId}::text),
        job_key => ${listId}::text,
        max_attempts => ${SUPPLIER_PRICE_LIST_READING_MAX_ATTEMPTS}::int
      )`,
    );
  }

  async lockList(listId: string): Promise<LockSupplierPriceListResult> {
    const [list] = await this.tx
      .select()
      .from(supplierPriceLists)
      .where(eq(supplierPriceLists.id, listId))
      .for("update");
    if (!list) {
      return { kind: "not_found" };
    }
    const rows = await this.tx
      .select({ priceCents: supplierPriceListRows.priceCents })
      .from(supplierPriceListRows)
      .where(eq(supplierPriceListRows.listId, listId))
      .orderBy(asc(supplierPriceListRows.position));
    return {
      kind: "locked",
      list: {
        id: list.id,
        sourceKind: list.sourceKind as SupplierPriceListSourceKind,
        state: list.state as SupplierPriceListState,
        version: list.version,
        listDate: list.listDate,
        sentAt: list.sentAt,
        rowPrices: rows.map((row) => row.priceCents),
      },
    };
  }

  async markSent(listId: string, sentAt: Date, sentOn: string): Promise<void> {
    await this.tx
      .update(supplierPriceLists)
      .set({ sentAt, sentOn })
      .where(eq(supplierPriceLists.id, listId));
  }

  async recordExtraction(
    listId: string,
    listDate: string | null,
    rows: ProposedPriceListRow[],
  ): Promise<void> {
    await this.tx.insert(supplierPriceListRows).values(
      rows.map((row, position) => ({
        listId,
        position,
        description: row.description,
        supplierCode: row.code,
        presentation: row.presentation,
        priceCents: row.priceCents,
        page: row.page,
      })),
    );
    await this.tx
      .update(supplierPriceLists)
      .set({
        state: "EXTRACTED",
        listDate,
        extractedAt: this.now(),
        version: sql`${supplierPriceLists.version} + 1`,
      })
      .where(eq(supplierPriceLists.id, listId));
  }

  async recordReadFailure(listId: string, reason: SupplierPriceListReadFailure): Promise<void> {
    await this.tx
      .update(supplierPriceLists)
      .set({
        state: "READ_FAILED",
        readFailure: reason,
        version: sql`${supplierPriceLists.version} + 1`,
      })
      .where(eq(supplierPriceLists.id, listId));
  }

  async lockRow(listId: string, rowId: string): Promise<LockSupplierPriceListRowResult> {
    const [row] = await this.tx
      .select({ id: supplierPriceListRows.id })
      .from(supplierPriceListRows)
      .where(and(eq(supplierPriceListRows.id, rowId), eq(supplierPriceListRows.listId, listId)))
      .for("update");
    return row ? { kind: "locked" } : { kind: "not_found" };
  }

  async setRowPrice(
    listId: string,
    rowId: string,
    priceCents: number,
    actorId: string,
  ): Promise<void> {
    const [previous] = await this.tx
      .select({ priceCents: supplierPriceListRows.priceCents })
      .from(supplierPriceListRows)
      .where(eq(supplierPriceListRows.id, rowId));
    await this.tx
      .update(supplierPriceListRows)
      .set({ priceCents })
      .where(eq(supplierPriceListRows.id, rowId));
    await this.advanceVersion(listId);
    await this.tx.insert(auditLog).values({
      entity: ROW_AUDIT_ENTITY,
      entityId: rowId,
      actorId,
      at: this.now(),
      previousValue: { priceCents: previous?.priceCents ?? null },
      newValue: { priceCents },
    });
  }

  async removeRow(listId: string, rowId: string, actorId: string): Promise<void> {
    const [removed] = await this.tx
      .delete(supplierPriceListRows)
      .where(eq(supplierPriceListRows.id, rowId))
      .returning({
        description: supplierPriceListRows.description,
        code: supplierPriceListRows.supplierCode,
        presentation: supplierPriceListRows.presentation,
        priceCents: supplierPriceListRows.priceCents,
        page: supplierPriceListRows.page,
      });
    await this.advanceVersion(listId);
    await this.tx.insert(auditLog).values({
      entity: ROW_AUDIT_ENTITY,
      entityId: rowId,
      actorId,
      at: this.now(),
      previousValue: removed ?? null,
      newValue: null,
    });
  }

  async confirmList(
    listId: string,
    listDate: string,
    confirmedAt: Date,
    actorId: string,
  ): Promise<void> {
    await this.tx
      .update(supplierPriceLists)
      .set({
        state: "REVIEWED",
        listDate,
        confirmedAt,
        confirmedBy: actorId,
        version: sql`${supplierPriceLists.version} + 1`,
      })
      .where(eq(supplierPriceLists.id, listId));
  }

  async discardList(listId: string, discardedAt: Date, actorId: string): Promise<void> {
    await this.tx
      .update(supplierPriceLists)
      .set({
        state: "DISCARDED",
        discardedAt,
        discardedBy: actorId,
        version: sql`${supplierPriceLists.version} + 1`,
      })
      .where(eq(supplierPriceLists.id, listId));
  }

  private async advanceVersion(listId: string): Promise<void> {
    await this.tx
      .update(supplierPriceLists)
      .set({ version: sql`${supplierPriceLists.version} + 1` })
      .where(eq(supplierPriceLists.id, listId));
  }
}

export class DrizzleSupplierPriceListStore<TQueryResult extends PgQueryResultHKT>
  implements SupplierPriceListStore
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  transaction<TOutcome>(
    work: (tx: SupplierPriceListStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) =>
      work(new DrizzleSupplierPriceListStoreTransaction(tx, this.now)),
    );
  }
}
