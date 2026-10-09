import type {
  LockBranchRegisterResult,
  PointOfSaleClaim,
  PointOfSaleHolder,
  RegisterOfflinePointOfSale,
  RegisterOfflinePointOfSaleRecord,
  RegisterOfflinePointOfSaleStore,
  RegisterOfflinePointOfSaleStoreTransaction,
  RegisterPointOfSale,
} from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  auditLog,
  registerOfflinePointsOfSale,
  registerPointsOfSale,
} from "../platform/db/schema.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";
import {
  claimPointOfSale,
  lockBranchRegister,
  lockPointOfSaleClaim,
} from "./drizzle-point-of-sale-claims.js";
import { NEVER_CONFIGURED_VERSION } from "./register-point-of-sale-version.js";

function offlineAuditValueOf(setup: { pointOfSaleNumber: number; version: number }) {
  return { point_of_sale_number: setup.pointOfSaleNumber, version: setup.version };
}

class DrizzleRegisterOfflinePointOfSaleStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements RegisterOfflinePointOfSaleStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;
  private readonly now: () => Date;
  private readonly pending: PendingChanges;

  constructor(tx: PgDatabase<TQueryResult>, now: () => Date, pending: PendingChanges) {
    this.tx = tx;
    this.now = now;
    this.pending = pending;
  }

  lockBranchRegister(locationId: string, registerId: string): Promise<LockBranchRegisterResult> {
    return lockBranchRegister(this.tx, locationId, registerId);
  }

  // KEY SHARE is the weakest lock that keeps the row from being deleted or re-keyed while the
  // offline point of sale that depends on it is written, and it leaves a concurrent change of the
  // real-time point of sale's number or fiscal address free to proceed.
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

  constructor(db: PgDatabase<TQueryResult>, now: () => Date, pending?: PendingChanges) {
    this.db = db;
    this.now = now;
    this.pending = pending;
  }

  transaction<TOutcome>(
    work: (tx: RegisterOfflinePointOfSaleStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, this.pending, (tx, pending) =>
      work(new DrizzleRegisterOfflinePointOfSaleStoreTransaction(tx, this.now, pending)),
    );
  }
}
