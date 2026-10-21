import {
  QrPointOfSaleAlreadyAssigned,
  type QrPointOfSaleAssignment,
  type QrPointOfSaleAssignmentRecord,
  type QrPointOfSaleAssignmentStore,
  type QrPointOfSaleAssignmentStoreTransaction,
} from "@purosur/domain/payments/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { lockBranchRegister } from "../fiscal/drizzle-point-of-sale-claims.js";
import { postgresErrorChain } from "../platform/db/postgres-error-chain.js";
import { auditLog, registerQrPointsOfSale } from "../platform/db/schema.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";

const UNIQUE_VIOLATION = "23505";
const EXTERNAL_POS_ID_KEY = "register_qr_points_of_sale_external_pos_id_key";
const NEVER_ASSIGNED_VERSION = 0;

function assignmentAuditValueOf(assignment: QrPointOfSaleAssignment) {
  return { external_pos_id: assignment.externalPosId, version: assignment.version };
}

class DrizzleQrPointOfSaleAssignmentStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements QrPointOfSaleAssignmentStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;
  private readonly now: () => Date;
  private readonly pending: PendingChanges;

  constructor(tx: PgDatabase<TQueryResult>, now: () => Date, pending: PendingChanges) {
    this.tx = tx;
    this.now = now;
    this.pending = pending;
  }

  lockBranchRegister(locationId: string, registerId: string) {
    return lockBranchRegister(this.tx, locationId, registerId);
  }

  async lockRegisterQrPointOfSale(registerId: string): Promise<QrPointOfSaleAssignment> {
    const [current] = await this.tx
      .select({
        externalPosId: registerQrPointsOfSale.externalPosId,
        version: registerQrPointsOfSale.version,
      })
      .from(registerQrPointsOfSale)
      .where(eq(registerQrPointsOfSale.registerId, registerId))
      .for("update");
    return current ?? { externalPosId: null, version: NEVER_ASSIGNED_VERSION };
  }

  async lockQrPointOfSaleHolder(externalPosId: string): Promise<string | undefined> {
    const [holder] = await this.tx
      .select({ registerId: registerQrPointsOfSale.registerId })
      .from(registerQrPointsOfSale)
      .where(eq(registerQrPointsOfSale.externalPosId, externalPosId))
      .for("update");
    return holder?.registerId;
  }

  async recordQrPointOfSaleAssignment(record: QrPointOfSaleAssignmentRecord): Promise<void> {
    const { registerId, externalPosId, version, actorId } = record;
    const [previous] = await this.tx
      .select({
        externalPosId: registerQrPointsOfSale.externalPosId,
        version: registerQrPointsOfSale.version,
      })
      .from(registerQrPointsOfSale)
      .where(eq(registerQrPointsOfSale.registerId, registerId));
    const fields = { externalPosId, version };
    try {
      await this.tx
        .insert(registerQrPointsOfSale)
        .values({ registerId, ...fields })
        .onConflictDoUpdate({ target: registerQrPointsOfSale.registerId, set: fields });
    } catch (error) {
      if (
        postgresErrorChain(error).some(
          (link) => link.code === UNIQUE_VIOLATION && link.constraint === EXTERNAL_POS_ID_KEY,
        )
      ) {
        throw new QrPointOfSaleAlreadyAssigned();
      }
      throw error;
    }
    await this.tx.insert(auditLog).values({
      entity: "register_qr_point_of_sale",
      entityId: registerId,
      actorId,
      previousValue: previous ? assignmentAuditValueOf(previous) : null,
      newValue: assignmentAuditValueOf(fields),
      at: this.now(),
    });
    this.pending.note({
      entity: "register_qr_point_of_sale",
      entityId: registerId,
      version,
      op: previous ? "update" : "insert",
    });
  }
}

export class DrizzleQrPointOfSaleAssignmentStore<TQueryResult extends PgQueryResultHKT>
  implements QrPointOfSaleAssignmentStore
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  transaction<TOutcome>(
    work: (tx: QrPointOfSaleAssignmentStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, undefined, (tx, pending) =>
      work(new DrizzleQrPointOfSaleAssignmentStoreTransaction(tx, this.now, pending)),
    );
  }
}
