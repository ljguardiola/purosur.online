import type { RegisterBackupStanding } from "@purosur/domain";
import type { RegisterBackupStandingReader } from "@purosur/domain/backups/use-cases";
import { and, desc, eq, exists, gt, isNull, min, or } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { alias } from "drizzle-orm/pg-core";
import {
  inbox,
  registerInstallations,
  registerSnapshotGenerations,
  registers,
} from "../platform/db/schema.js";

export class DrizzleRegisterBackupStandingReader<TQueryResult extends PgQueryResultHKT>
  implements RegisterBackupStandingReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async watchedRegisterBackupStandings(): Promise<RegisterBackupStanding[]> {
    const activeInstallation = alias(registerInstallations, "active_installation");
    const anyInstallation = alias(registerInstallations, "any_installation");
    const lastVerifiedInstallation = alias(registerInstallations, "last_verified_installation");
    const lastVerified = this.db
      .selectDistinctOn([registerSnapshotGenerations.registerId], {
        registerId: registerSnapshotGenerations.registerId,
        deviceId: registerSnapshotGenerations.deviceId,
        lastDeviceSeq: registerSnapshotGenerations.lastDeviceSeq,
        createdAt: registerSnapshotGenerations.createdAt,
      })
      .from(registerSnapshotGenerations)
      .where(eq(registerSnapshotGenerations.status, "verified"))
      .orderBy(registerSnapshotGenerations.registerId, desc(registerSnapshotGenerations.createdAt))
      .as("last_verified");
    const rows = await this.db
      .select({
        registerId: registers.id,
        lastVerifiedGenerationAt: lastVerified.createdAt,
        firstChangeSinceLastVerifiedAt: min(inbox.occurredAt),
      })
      .from(registers)
      .leftJoin(lastVerified, eq(lastVerified.registerId, registers.id))
      .leftJoin(lastVerifiedInstallation, eq(lastVerifiedInstallation.id, lastVerified.deviceId))
      .leftJoin(anyInstallation, eq(anyInstallation.registerId, registers.id))
      .leftJoin(
        inbox,
        and(
          eq(inbox.deviceId, anyInstallation.id),
          or(
            isNull(lastVerified.createdAt),
            and(
              eq(anyInstallation.id, lastVerified.deviceId),
              gt(inbox.deviceSeq, lastVerified.lastDeviceSeq),
            ),
            gt(anyInstallation.enrolledAt, lastVerifiedInstallation.enrolledAt),
          ),
        ),
      )
      .where(
        exists(
          this.db
            .select({ one: activeInstallation.id })
            .from(activeInstallation)
            .where(
              and(
                eq(activeInstallation.registerId, registers.id),
                isNull(activeInstallation.revokedAt),
              ),
            ),
        ),
      )
      .groupBy(registers.id, lastVerified.createdAt);
    return rows;
  }
}
