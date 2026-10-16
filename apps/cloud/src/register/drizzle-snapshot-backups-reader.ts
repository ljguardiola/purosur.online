import type { SnapshotLifecycleRules } from "@purosur/domain";
import type {
  SnapshotBackupGenerationFacts,
  SnapshotBackupRegister,
  SnapshotBackupsReader,
} from "@purosur/domain/register/use-cases";
import { and, asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  registerSnapshotGenerations,
  registerSnapshotLifecycleRules,
  registers,
} from "../platform/db/schema.js";

export class DrizzleSnapshotBackupsReader<TQueryResult extends PgQueryResultHKT>
  implements SnapshotBackupsReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  registersForBackups(): Promise<SnapshotBackupRegister[]> {
    return this.db
      .select({ id: registers.id, name: registers.name })
      .from(registers)
      .orderBy(asc(registers.name));
  }

  async registerExists(registerId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: registers.id })
      .from(registers)
      .where(eq(registers.id, registerId));
    return rows.length > 0;
  }

  async lifecycleRules(): Promise<SnapshotLifecycleRules | undefined> {
    const [row] = await this.db
      .select({
        hourly: registerSnapshotLifecycleRules.hourly,
        daily: registerSnapshotLifecycleRules.daily,
        monthly: registerSnapshotLifecycleRules.monthly,
      })
      .from(registerSnapshotLifecycleRules);
    return row;
  }

  generationsOf(registerId: string): Promise<SnapshotBackupGenerationFacts[]> {
    return this.db
      .select({
        id: registerSnapshotGenerations.id,
        registerId: registerSnapshotGenerations.registerId,
        deviceId: registerSnapshotGenerations.deviceId,
        createdAt: registerSnapshotGenerations.createdAt,
        size: registerSnapshotGenerations.size,
        sha256: registerSnapshotGenerations.sha256,
        keyVersion: registerSnapshotGenerations.keyVersion,
        status: registerSnapshotGenerations.status,
        failureReason: registerSnapshotGenerations.failureReason,
        uploadReportedAt: registerSnapshotGenerations.uploadReportedAt,
        pruned: registerSnapshotGenerations.pruned,
        objectDeleted: registerSnapshotGenerations.objectDeleted,
        onRegisterDisk: registerSnapshotGenerations.onRegisterDisk,
      })
      .from(registerSnapshotGenerations)
      .where(
        and(
          eq(registerSnapshotGenerations.registerId, registerId),
          eq(registerSnapshotGenerations.pruned, false),
        ),
      );
  }
}
