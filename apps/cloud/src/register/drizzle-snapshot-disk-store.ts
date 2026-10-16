import type {
  SnapshotDiskStore,
  SnapshotDiskStoreTransaction,
} from "@purosur/domain/register/use-cases";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { registerSnapshotGenerations } from "../platform/db/schema.js";
import { registerSnapshotsLockKey } from "./drizzle-snapshot-store.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

class DrizzleSnapshotDiskStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements SnapshotDiskStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;

  constructor(tx: Transaction<TQueryResult>) {
    this.tx = tx;
  }

  async lockRegisterSnapshots(registerId: string): Promise<void> {
    await this.tx.execute(
      sql`select pg_advisory_xact_lock(${registerSnapshotsLockKey(registerId)})`,
    );
  }

  async recordGenerationsOnRegisterDisk(
    registerId: string,
    generationIds: readonly string[],
  ): Promise<void> {
    const ofRegister = eq(registerSnapshotGenerations.registerId, registerId);
    await this.tx
      .update(registerSnapshotGenerations)
      .set({ onRegisterDisk: false })
      .where(
        generationIds.length === 0
          ? ofRegister
          : and(ofRegister, notInArray(registerSnapshotGenerations.id, [...generationIds])),
      );
    if (generationIds.length > 0) {
      await this.tx
        .update(registerSnapshotGenerations)
        .set({ onRegisterDisk: true })
        .where(and(ofRegister, inArray(registerSnapshotGenerations.id, [...generationIds])));
    }
  }
}

export class DrizzleSnapshotDiskStore<TQueryResult extends PgQueryResultHKT>
  implements SnapshotDiskStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: SnapshotDiskStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleSnapshotDiskStoreTransaction(tx)));
  }
}
