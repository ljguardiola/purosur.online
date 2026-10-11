import type { FiscalDocumentType } from "@purosur/domain";
import type {
  LockBranchRegisterResult,
  OfflineNumberBlockRecord,
  PointOfSaleClaim,
  PointOfSaleHolder,
  RegisterOfflinePointOfSale,
  RegisterOfflinePointOfSaleRecord,
  RegisterOfflinePointOfSaleStore,
  RegisterOfflinePointOfSaleStoreTransaction,
  RegisterPointOfSale,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  auditLog,
  offlineNumberBlocks,
  registerOfflinePointsOfSale,
  registerPointsOfSale,
  taxAuthorityLastAuthorizedNumbers,
} from "../platform/db/schema.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";
import {
  claimPointOfSale,
  lockBranchRegister,
  lockPointOfSaleClaim,
} from "./drizzle-point-of-sale-claims.js";
import type { EnqueueTaxAuthorityCount } from "./graphile-tax-authority-count-queue.js";
import { NEVER_CONFIGURED_VERSION } from "./register-point-of-sale-version.js";

function offlineNumberBlocksLockKey(
  pointOfSaleNumber: number,
  documentType: FiscalDocumentType,
): string {
  return `offline_number_blocks:${pointOfSaleNumber}:${documentType}`;
}

function offlineAuditValueOf(setup: { pointOfSaleNumber: number; version: number }) {
  return { point_of_sale_number: setup.pointOfSaleNumber, version: setup.version };
}

class DrizzleRegisterOfflinePointOfSaleStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements RegisterOfflinePointOfSaleStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;
  private readonly now: () => Date;
  private readonly pending: PendingChanges;
  private readonly enqueueTaxAuthorityCount: EnqueueTaxAuthorityCount | undefined;

  constructor(
    tx: PgDatabase<TQueryResult>,
    now: () => Date,
    pending: PendingChanges,
    enqueueTaxAuthorityCount: EnqueueTaxAuthorityCount | undefined,
  ) {
    this.tx = tx;
    this.now = now;
    this.pending = pending;
    this.enqueueTaxAuthorityCount = enqueueTaxAuthorityCount;
  }

  async taxAuthorityLastAuthorized(pointOfSaleNumber: number): Promise<number | null> {
    const [count] = await this.tx
      .select({ lastAuthorized: taxAuthorityLastAuthorizedNumbers.lastAuthorized })
      .from(taxAuthorityLastAuthorizedNumbers)
      .where(eq(taxAuthorityLastAuthorizedNumbers.pointOfSaleNumber, pointOfSaleNumber));
    return count?.lastAuthorized ?? null;
  }

  async requireTaxAuthorityCount(pointOfSaleNumber: number): Promise<void> {
    await this.enqueueTaxAuthorityCount?.(this.tx, pointOfSaleNumber);
  }

  async offlineRegisterOf(pointOfSaleNumber: number): Promise<string | null> {
    const [holder] = await this.tx
      .select({ registerId: registerOfflinePointsOfSale.registerId })
      .from(registerOfflinePointsOfSale)
      .where(eq(registerOfflinePointsOfSale.pointOfSaleNumber, pointOfSaleNumber));
    return holder?.registerId ?? null;
  }

  lockBranchRegister(locationId: string, registerId: string): Promise<LockBranchRegisterResult> {
    return lockBranchRegister(this.tx, locationId, registerId);
  }

  async lockRegisterPointOfSale(registerId: string): Promise<RegisterPointOfSale> {
    const [current] = await this.tx
      .select({
        pointOfSaleNumber: registerPointsOfSale.pointOfSaleNumber,
        fiscalAddressId: registerPointsOfSale.fiscalAddressId,
        version: registerPointsOfSale.version,
      })
      .from(registerPointsOfSale)
      .where(eq(registerPointsOfSale.registerId, registerId))
      .for("key share");
    return (
      current ?? {
        pointOfSaleNumber: null,
        fiscalAddressId: null,
        version: NEVER_CONFIGURED_VERSION,
      }
    );
  }

  async lockRegisterOfflinePointOfSale(registerId: string): Promise<RegisterOfflinePointOfSale> {
    const [current] = await this.tx
      .select({
        pointOfSaleNumber: registerOfflinePointsOfSale.pointOfSaleNumber,
        version: registerOfflinePointsOfSale.version,
      })
      .from(registerOfflinePointsOfSale)
      .where(eq(registerOfflinePointsOfSale.registerId, registerId))
      .for("update");
    return current ?? { pointOfSaleNumber: null, version: NEVER_CONFIGURED_VERSION };
  }

  lockPointOfSaleClaim(pointOfSaleNumber: number): Promise<PointOfSaleHolder | undefined> {
    return lockPointOfSaleClaim(this.tx, pointOfSaleNumber);
  }

  claimPointOfSale(claim: PointOfSaleClaim): Promise<void> {
    return claimPointOfSale(this.tx, claim);
  }

  async lockOfflineNumberBlocks(
    pointOfSaleNumber: number,
    documentType: FiscalDocumentType,
  ): Promise<void> {
    const key = offlineNumberBlocksLockKey(pointOfSaleNumber, documentType);
    await this.tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }

  async hasOfflineNumberBlock(
    pointOfSaleNumber: number,
    documentType: FiscalDocumentType,
  ): Promise<boolean> {
    const [block] = await this.tx
      .select({ id: offlineNumberBlocks.id })
      .from(offlineNumberBlocks)
      .where(
        and(
          eq(offlineNumberBlocks.pointOfSaleNumber, pointOfSaleNumber),
          eq(offlineNumberBlocks.documentType, documentType),
        ),
      )
      .limit(1);
    return block !== undefined;
  }

  async recordOfflineNumberBlock(record: OfflineNumberBlockRecord): Promise<void> {
    const version = 1;
    const [block] = await this.tx
      .insert(offlineNumberBlocks)
      .values({
        pointOfSaleNumber: record.pointOfSaleNumber,
        documentType: record.documentType,
        registerId: record.registerId,
        firstNumber: record.range.firstNumber,
        lastNumber: record.range.lastNumber,
        status: record.status,
        assignedAt: this.now(),
        version,
      })
      .returning({ id: offlineNumberBlocks.id });
    if (!block) {
      throw new Error("an inserted offline number block returned no row");
    }
    this.pending.note({
      entity: "offline_number_block",
      entityId: block.id,
      version,
      op: "insert",
      registerId: record.registerId,
    });
  }

  async recordRegisterOfflinePointOfSale(record: RegisterOfflinePointOfSaleRecord): Promise<void> {
    const { registerId, pointOfSaleNumber, version, actorId } = record;
    const [previous] = await this.tx
      .select({
        pointOfSaleNumber: registerOfflinePointsOfSale.pointOfSaleNumber,
        version: registerOfflinePointsOfSale.version,
      })
      .from(registerOfflinePointsOfSale)
      .where(eq(registerOfflinePointsOfSale.registerId, registerId));
    const fields = { pointOfSaleNumber, version };
    await this.tx
      .insert(registerOfflinePointsOfSale)
      .values({ registerId, ...fields })
      .onConflictDoUpdate({ target: registerOfflinePointsOfSale.registerId, set: fields });
    await this.tx.insert(auditLog).values({
      entity: "register_offline_point_of_sale",
      entityId: registerId,
      actorId,
      previousValue: previous ? offlineAuditValueOf(previous) : null,
      newValue: offlineAuditValueOf(fields),
      at: this.now(),
    });
    this.pending.note({
      entity: "register_offline_point_of_sale",
      entityId: registerId,
      version,
      op: previous ? "update" : "insert",
    });
  }
}

export class DrizzleRegisterOfflinePointOfSaleStore<TQueryResult extends PgQueryResultHKT>
  implements RegisterOfflinePointOfSaleStore
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;
  private readonly pending: PendingChanges | undefined;
  private readonly enqueueTaxAuthorityCount: EnqueueTaxAuthorityCount | undefined;

  constructor(
    db: PgDatabase<TQueryResult>,
    now: () => Date,
    pending?: PendingChanges,
    enqueueTaxAuthorityCount?: EnqueueTaxAuthorityCount,
  ) {
    this.db = db;
    this.now = now;
    this.pending = pending;
    this.enqueueTaxAuthorityCount = enqueueTaxAuthorityCount;
  }

  transaction<TOutcome>(
    work: (tx: RegisterOfflinePointOfSaleStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, this.pending, (tx, pending) =>
      work(
        new DrizzleRegisterOfflinePointOfSaleStoreTransaction(
          tx,
          this.now,
          pending,
          this.enqueueTaxAuthorityCount,
        ),
      ),
    );
  }
}
