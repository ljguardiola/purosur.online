import type {
  LockBranchRegisterResult,
  PointOfSaleClaim,
  PointOfSaleHolder,
  RegisterPointOfSale,
  RegisterPointOfSaleRecord,
  RegisterPointOfSaleStore,
  RegisterPointOfSaleStoreTransaction,
} from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { auditLog, fiscalAddresses, registerPointsOfSale } from "../platform/db/schema.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";
import {
  claimPointOfSale,
  lockBranchRegister,
  lockPointOfSaleClaim,
} from "./drizzle-point-of-sale-claims.js";
import type { EnqueueTaxAuthorityCount } from "./graphile-tax-authority-count-queue.js";
import { NEVER_CONFIGURED_VERSION } from "./register-point-of-sale-version.js";

function pointOfSaleAuditValueOf(setup: {
  pointOfSaleNumber: number;
  fiscalAddressId: string;
  version: number;
}) {
  return {
    point_of_sale_number: setup.pointOfSaleNumber,
    fiscal_address_id: setup.fiscalAddressId,
    version: setup.version,
  };
}

class DrizzleRegisterPointOfSaleStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements RegisterPointOfSaleStoreTransaction
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
      .for("update");
    return (
      current ?? {
        pointOfSaleNumber: null,
        fiscalAddressId: null,
        version: NEVER_CONFIGURED_VERSION,
      }
    );
  }

  async fiscalAddressExists(fiscalAddressId: string): Promise<boolean> {
    const [existing] = await this.tx
      .select({ id: fiscalAddresses.id })
      .from(fiscalAddresses)
      .where(eq(fiscalAddresses.id, fiscalAddressId))
      .limit(1);
    return existing !== undefined;
  }

  lockPointOfSaleClaim(pointOfSaleNumber: number): Promise<PointOfSaleHolder | undefined> {
    return lockPointOfSaleClaim(this.tx, pointOfSaleNumber);
  }

  claimPointOfSale(claim: PointOfSaleClaim): Promise<void> {
    return claimPointOfSale(this.tx, claim);
  }

  async recordRegisterPointOfSale(record: RegisterPointOfSaleRecord): Promise<void> {
    const { registerId, pointOfSaleNumber, fiscalAddressId, version, actorId } = record;
    const [previous] = await this.tx
      .select({
        pointOfSaleNumber: registerPointsOfSale.pointOfSaleNumber,
        fiscalAddressId: registerPointsOfSale.fiscalAddressId,
        version: registerPointsOfSale.version,
      })
      .from(registerPointsOfSale)
      .where(eq(registerPointsOfSale.registerId, registerId));
    const fields = { pointOfSaleNumber, fiscalAddressId, version };
    await this.tx
      .insert(registerPointsOfSale)
      .values({ registerId, ...fields })
      .onConflictDoUpdate({ target: registerPointsOfSale.registerId, set: fields });
    await this.tx.insert(auditLog).values({
      entity: "register_point_of_sale",
      entityId: registerId,
      actorId,
      previousValue: previous ? pointOfSaleAuditValueOf(previous) : null,
      newValue: pointOfSaleAuditValueOf(fields),
      at: this.now(),
    });
    this.pending.note({
      entity: "register_point_of_sale",
      entityId: registerId,
      version,
      op: previous ? "update" : "insert",
    });
    await this.enqueueTaxAuthorityCount?.(this.tx, pointOfSaleNumber);
  }
}

export class DrizzleRegisterPointOfSaleStore<TQueryResult extends PgQueryResultHKT>
  implements RegisterPointOfSaleStore
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
    work: (tx: RegisterPointOfSaleStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, this.pending, (tx, pending) =>
      work(
        new DrizzleRegisterPointOfSaleStoreTransaction(
          tx,
          this.now,
          pending,
          this.enqueueTaxAuthorityCount,
        ),
      ),
    );
  }
}
