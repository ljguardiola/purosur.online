import {
  SNAPSHOT_STATUSES_AWAITING_VERIFICATION,
  type SnapshotCorruptionStage,
  type SnapshotLifecycleRules,
} from "@purosur/domain";
import {
  type NewSnapshotGeneration,
  type RegisterSnapshotLanes,
  type SnapshotGeneration,
  SnapshotGenerationIdTaken,
  type SnapshotSettlement,
  type SnapshotStore,
  type SnapshotStoreTransaction,
} from "@purosur/domain/register/use-cases";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  registerSnapshotGenerations,
  registerSnapshotKeys,
  registerSnapshotLifecycleRules,
  registerSnapshotRetentionFreezes,
} from "../platform/db/schema.js";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

export function registerSnapshotsLockKey(registerId: string) {
  return sql`hashtextextended(${`register_snapshots:${registerId}`}, 0)`;
}

const generationColumns = {
  id: registerSnapshotGenerations.id,
  registerId: registerSnapshotGenerations.registerId,
  deviceId: registerSnapshotGenerations.deviceId,
  createdAt: registerSnapshotGenerations.createdAt,
  size: registerSnapshotGenerations.size,
  sha256: registerSnapshotGenerations.sha256,
  keyVersion: registerSnapshotGenerations.keyVersion,
  lastDeviceSeq: registerSnapshotGenerations.lastDeviceSeq,
  status: registerSnapshotGenerations.status,
  failureReason: registerSnapshotGenerations.failureReason,
  uploadReportedAt: registerSnapshotGenerations.uploadReportedAt,
  pruned: registerSnapshotGenerations.pruned,
  objectDeleted: registerSnapshotGenerations.objectDeleted,
};

class DrizzleSnapshotStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements SnapshotStoreTransaction
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

  async snapshotKeyVersions(registerId: string): Promise<number[]> {
    const rows = await this.tx
      .select({ version: registerSnapshotKeys.version })
      .from(registerSnapshotKeys)
      .where(eq(registerSnapshotKeys.registerId, registerId));
    return rows.map((row) => row.version);
  }

  async findGeneration(
    registerId: string,
    generationId: string,
  ): Promise<SnapshotGeneration | undefined> {
    const [row] = await this.tx
      .select(generationColumns)
      .from(registerSnapshotGenerations)
      .where(
        and(
          eq(registerSnapshotGenerations.registerId, registerId),
          eq(registerSnapshotGenerations.id, generationId),
        ),
      );
    return row;
  }

  async recordDeclaredGeneration(generation: NewSnapshotGeneration): Promise<void> {
    const recorded = await this.tx
      .insert(registerSnapshotGenerations)
      .values({ ...generation, onRegisterDisk: true })
      .onConflictDoNothing({ target: registerSnapshotGenerations.id })
      .returning({ id: registerSnapshotGenerations.id });
    if (recorded.length === 0) {
      throw new SnapshotGenerationIdTaken();
    }
  }

  async recordUploadReported(generationId: string, reportedAt: Date): Promise<void> {
    await this.tx
      .update(registerSnapshotGenerations)
      .set({ status: "uploaded", uploadReportedAt: reportedAt })
      .where(
        and(
          eq(registerSnapshotGenerations.id, generationId),
          eq(registerSnapshotGenerations.status, "declared"),
        ),
      );
  }

  async unsettledGenerations(): Promise<SnapshotGeneration[]> {
    return this.tx
      .select(generationColumns)
      .from(registerSnapshotGenerations)
      .where(
        inArray(registerSnapshotGenerations.status, [...SNAPSHOT_STATUSES_AWAITING_VERIFICATION]),
      );
  }

  async settleGeneration(generationId: string, settlement: SnapshotSettlement): Promise<void> {
    await this.tx
      .update(registerSnapshotGenerations)
      .set({
        status: settlement.kind,
        failureReason: settlement.kind === "failed" ? settlement.reason : null,
      })
      .where(
        and(
          eq(registerSnapshotGenerations.id, generationId),
          inArray(registerSnapshotGenerations.status, [...SNAPSHOT_STATUSES_AWAITING_VERIFICATION]),
        ),
      );
  }

  async freezeRetention(
    registerId: string,
    stage: SnapshotCorruptionStage,
    frozenAt: Date,
  ): Promise<void> {
    await this.tx
      .insert(registerSnapshotRetentionFreezes)
      .values({ registerId, stage, frozenAt })
      .onConflictDoNothing();
  }

  async retentionFrozen(registerId: string): Promise<boolean> {
    const rows = await this.tx
      .select({ registerId: registerSnapshotRetentionFreezes.registerId })
      .from(registerSnapshotRetentionFreezes)
      .where(eq(registerSnapshotRetentionFreezes.registerId, registerId));
    return rows.length > 0;
  }

  async lifecycleRules(): Promise<SnapshotLifecycleRules | undefined> {
    const [row] = await this.tx
      .select({
        hourly: registerSnapshotLifecycleRules.hourly,
        daily: registerSnapshotLifecycleRules.daily,
        monthly: registerSnapshotLifecycleRules.monthly,
      })
      .from(registerSnapshotLifecycleRules);
    return row;
  }

  async registersWithGenerations(): Promise<string[]> {
    const rows = await this.tx
      .selectDistinct({ registerId: registerSnapshotGenerations.registerId })
      .from(registerSnapshotGenerations);
    return rows.map((row) => row.registerId);
  }

  async generationsOf(registerId: string): Promise<SnapshotGeneration[]> {
    return this.tx
      .select(generationColumns)
      .from(registerSnapshotGenerations)
      .where(eq(registerSnapshotGenerations.registerId, registerId));
  }

  async generationsAmong(
    registerId: string,
    generationIds: readonly string[],
  ): Promise<SnapshotGeneration[]> {
    if (generationIds.length === 0) {
      return [];
    }
    return this.tx
      .select(generationColumns)
      .from(registerSnapshotGenerations)
      .where(
        and(
          eq(registerSnapshotGenerations.registerId, registerId),
          inArray(registerSnapshotGenerations.id, [...generationIds]),
        ),
      );
  }

  async markPruned(generationIds: readonly string[]): Promise<void> {
    await this.tx
      .update(registerSnapshotGenerations)
      .set({ pruned: true })
      .where(inArray(registerSnapshotGenerations.id, [...generationIds]));
  }

  async prunedWithObject(registerId: string): Promise<SnapshotGeneration[]> {
    return this.tx
      .select(generationColumns)
      .from(registerSnapshotGenerations)
      .where(
        and(
          eq(registerSnapshotGenerations.registerId, registerId),
          eq(registerSnapshotGenerations.pruned, true),
          eq(registerSnapshotGenerations.objectDeleted, false),
        ),
      );
  }

  async markObjectDeleted(generationId: string): Promise<void> {
    await this.tx
      .update(registerSnapshotGenerations)
      .set({ objectDeleted: true })
      .where(eq(registerSnapshotGenerations.id, generationId));
  }
}

export class DrizzleSnapshotStore<TQueryResult extends PgQueryResultHKT> implements SnapshotStore {
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: SnapshotStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleSnapshotStoreTransaction(tx)));
  }
}

export class DrizzleRegisterSnapshotLanes<TQueryResult extends PgQueryResultHKT>
  implements RegisterSnapshotLanes
{
  private readonly connections: DedicatedConnections<TQueryResult>;

  constructor(connections: DedicatedConnections<TQueryResult>) {
    this.connections = connections;
  }

  inRegisterSnapshotLane<TOutcome>(
    registerId: string,
    work: (store: SnapshotStore) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.connections.withConnection(async (db) => {
      await db.execute(sql`select pg_advisory_lock(${registerSnapshotsLockKey(registerId)})`);
      try {
        return await work(new DrizzleSnapshotStore(db));
      } finally {
        await db.execute(sql`select pg_advisory_unlock(${registerSnapshotsLockKey(registerId)})`);
      }
    });
  }
}
