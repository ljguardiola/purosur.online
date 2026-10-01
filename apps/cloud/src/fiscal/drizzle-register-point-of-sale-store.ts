import {
  type LockBranchRegisterResult,
  type PointOfSaleClaim,
  PointOfSaleClaimConflict,
  type RegisterPointOfSale,
  type RegisterPointOfSaleRecord,
  type RegisterPointOfSaleStore,
  type RegisterPointOfSaleStoreTransaction,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { postgresErrorChain } from "../platform/db/postgres-error-chain.js";
import {
  auditLog,
  fiscalAddresses,
  pointOfSaleClaims,
  registerPointsOfSale,
  registers,
} from "../platform/db/schema.js";
import { UUID_PATTERN } from "../platform/db/uuid-pattern.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";

const UNIQUE_VIOLATION = "23505";
const POINT_OF_SALE_CLAIM_PRIMARY_KEY = "point_of_sale_claims_pkey";
const NEVER_CONFIGURED = 0;

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
  private readonly pending: PendingChanges;

  constructor(tx: PgDatabase<TQueryResult>, pending: PendingChanges) {
    this.tx = tx;
    this.pending = pending;
  }

  // NO KEY UPDATE leaves the foreign-key check of an enrollment redeeming this register's code free
  // to proceed, instead of deadlocking.
  async lockBranchRegister(
    locationId: string,
    registerId: string,
  ): Promise<LockBranchRegisterResult> {
    if (!UUID_PATTERN.test(registerId)) {
      return { kind: "not_found" };
    }
    const [register] = await this.tx
      .select({ id: registers.id })
      .from(registers)
      .where(and(eq(registers.id, registerId), eq(registers.locationId, locationId)))
      .for("no key update");
    return register ? { kind: "locked" } : { kind: "not_found" };
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
    return current ?? { pointOfSaleNumber: null, fiscalAddressId: null, version: NEVER_CONFIGURED };
  }

  async fiscalAddressExists(fiscalAddressId: string): Promise<boolean> {
    if (!UUID_PATTERN.test(fiscalAddressId)) {
      return false;
    }
    const [existing] = await this.tx
      .select({ id: fiscalAddresses.id })
      .from(fiscalAddresses)
      .where(eq(fiscalAddresses.id, fiscalAddressId))
      .limit(1);
    return existing !== undefined;
  }

  // Claims are append-only, so cloud_app holds no UPDATE on them and cannot lock the row; a claim
  // that a concurrent register inserts first surfaces as a PointOfSaleClaimConflict from
  // claimPointOfSale.
  async lockPointOfSaleClaim(pointOfSaleNumber: number): Promise<string | undefined> {
    const [claim] = await this.tx
      .select({ registerId: pointOfSaleClaims.registerId })
      .from(pointOfSaleClaims)
      .where(eq(pointOfSaleClaims.pointOfSaleNumber, pointOfSaleNumber));
    return claim?.registerId;
  }

  async claimPointOfSale(claim: PointOfSaleClaim): Promise<void> {
    try {
      await this.tx.insert(pointOfSaleClaims).values({
        pointOfSaleNumber: claim.pointOfSaleNumber,
        registerId: claim.registerId,
        claimedBy: claim.actorId,
      });
    } catch (error) {
      if (
        postgresErrorChain(error).some(
          (link) =>
            link.code === UNIQUE_VIOLATION && link.constraint === POINT_OF_SALE_CLAIM_PRIMARY_KEY,
        )
      ) {
        throw new PointOfSaleClaimConflict();
      }
      throw error;
    }
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
    });
    this.pending.note({
      entity: "register_point_of_sale",
      entityId: registerId,
      version,
      op: previous ? "update" : "insert",
    });
  }
}

export class DrizzleRegisterPointOfSaleStore<TQueryResult extends PgQueryResultHKT>
  implements RegisterPointOfSaleStore
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly pending: PendingChanges | undefined;

  constructor(db: PgDatabase<TQueryResult>, pending?: PendingChanges) {
    this.db = db;
    this.pending = pending;
  }

  transaction<TOutcome>(
    work: (tx: RegisterPointOfSaleStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, this.pending, (tx, pending) =>
      work(new DrizzleRegisterPointOfSaleStoreTransaction(tx, pending)),
    );
  }
}
