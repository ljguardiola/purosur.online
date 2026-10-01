import type {
  IssuerIdentification,
  IssuerIdentificationStore,
  IssuerIdentificationStoreTransaction,
  NewIssuerIdentificationVersion,
} from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  auditLog,
  ISSUER_IDENTIFICATION_SINGLETON_ID,
  issuerIdentification,
  issuerIdentificationVersions,
} from "../platform/db/schema.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";

function auditValueOf(identification: IssuerIdentification) {
  return {
    legal_name: identification.legalName,
    gross_income_registration: identification.grossIncomeRegistration,
    activity_start_date: identification.activityStartDate,
    authorized_cuit: identification.authorizedCuit,
    version: identification.version,
  };
}

class DrizzleIssuerIdentificationStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements IssuerIdentificationStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;
  private readonly pending: PendingChanges;

  constructor(tx: PgDatabase<TQueryResult>, pending: PendingChanges) {
    this.tx = tx;
    this.pending = pending;
  }

  async lockCurrentIssuerIdentification(): Promise<IssuerIdentification> {
    const [current] = await this.tx
      .select({
        legalName: issuerIdentification.legalName,
        grossIncomeRegistration: issuerIdentification.grossIncomeRegistration,
        activityStartDate: issuerIdentification.activityStartDate,
        authorizedCuit: issuerIdentificationVersions.authorizedCuit,
        version: issuerIdentification.version,
      })
      .from(issuerIdentification)
      .leftJoin(
        issuerIdentificationVersions,
        eq(issuerIdentificationVersions.version, issuerIdentification.version),
      )
      .where(eq(issuerIdentification.id, ISSUER_IDENTIFICATION_SINGLETON_ID))
      .for("update", { of: issuerIdentification });
    if (!current) {
      throw new Error("issuer identification row missing: the seeding migration never ran");
    }
    return current;
  }

  async recordIssuerIdentificationVersion(
    next: NewIssuerIdentificationVersion,
    previous: IssuerIdentification,
  ): Promise<void> {
    const { legalName, grossIncomeRegistration, activityStartDate, version } = next;
    await this.tx
      .update(issuerIdentification)
      .set({ legalName, grossIncomeRegistration, activityStartDate, version })
      .where(eq(issuerIdentification.id, ISSUER_IDENTIFICATION_SINGLETON_ID));
    await this.tx.insert(issuerIdentificationVersions).values({
      version,
      legalName,
      grossIncomeRegistration,
      activityStartDate,
      authorizedCuit: next.authorizedCuit,
      recordedBy: next.recordedBy,
    });
    await this.tx.insert(auditLog).values({
      entity: "issuer_identification",
      entityId: ISSUER_IDENTIFICATION_SINGLETON_ID,
      actorId: next.recordedBy,
      previousValue: auditValueOf(previous),
      newValue: auditValueOf(next),
    });
    this.pending.note({
      entity: "issuer_identification",
      entityId: ISSUER_IDENTIFICATION_SINGLETON_ID,
      version,
      op: "update",
    });
  }
}

export class DrizzleIssuerIdentificationStore<TQueryResult extends PgQueryResultHKT>
  implements IssuerIdentificationStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: IssuerIdentificationStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, undefined, (tx, pending) =>
      work(new DrizzleIssuerIdentificationStoreTransaction(tx, pending)),
    );
  }
}
